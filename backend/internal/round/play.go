package round

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"github.com/gaming-platform/backend/internal/engine"
	"github.com/gaming-platform/backend/internal/wallet"
)

type PlayInput struct {
	IdempotencyKey             string
	UserID                     string
	GameID                     string
	Currency                   string
	StakeMinor                 int64
	Params                     json.RawMessage
	BigWinMultiplierHundredths int
}

type PlayResult struct {
	Round  Record
	Result json.RawMessage
	Wallet wallet.Wallet
}

// resultData is what a played round stores: the parameters as the client sent
// them, so a retry can be checked against them, and the engine's display result.
type resultData struct {
	Params json.RawMessage `json:"params"`
	Result json.RawMessage `json:"result"`
}

var emptyObject = json.RawMessage(`{}`)

// Play is one transaction: the wager is debited, the engine decides, and the
// win is credited, and either all of it commits or none of it does. There is
// no state in which a player has paid for a round that has no outcome. The
// idempotency key is scoped to the player, and a retry returns the committed
// round as long as it asks for the same stake and parameters.
func Play(ctx context.Context, db *sql.DB, eng Engine, in PlayInput) (PlayResult, error) {
	if eng == nil {
		return PlayResult{}, ErrEngineRequired
	}
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" {
		return PlayResult{}, ErrRoundKeyRequired
	}
	params, err := normaliseParams(in.Params)
	if err != nil {
		return PlayResult{}, err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return PlayResult{}, fmt.Errorf("round: begin play: %w", err)
	}
	defer tx.Rollback()

	opened, err := openTx(ctx, tx, OpenInput{
		RoundKey: "play:" + in.UserID + ":" + key, UserID: in.UserID, GameID: in.GameID,
		StakeMinor: in.StakeMinor, Currency: in.Currency,
	})
	if err != nil {
		return PlayResult{}, err
	}
	if !opened.Created {
		return replay(ctx, tx, opened.Round, params)
	}
	if opened.EngineConfigRef == "" {
		return PlayResult{}, ErrProfileUnavailable
	}

	outcome, err := eng.Play(engine.Input{ConfigRef: opened.EngineConfigRef, Params: params, StakeMinor: in.StakeMinor})
	if err != nil {
		return PlayResult{}, err
	}
	display := outcome.Result
	if len(display) == 0 {
		display = emptyObject
	}
	stored, err := json.Marshal(resultData{Params: params, Result: display})
	if err != nil {
		return PlayResult{}, fmt.Errorf("%w: %v", ErrInvalidOutcome, err)
	}
	settle := SettleInput{
		RoundID: opened.Round.ID, WinMinor: outcome.WinMinor, MultiplierHundredths: outcome.MultiplierHundredths,
		EngineReference: outcome.Reference, ResultData: stored, BigWinMultiplierHundredths: in.BigWinMultiplierHundredths,
	}
	if err := validateSettle(&settle); err != nil {
		return PlayResult{}, err
	}
	if _, err := settleTx(ctx, tx, settle); err != nil {
		return PlayResult{}, err
	}

	result, err := loadResult(ctx, tx, in.UserID, opened.Round.ID, display)
	if err != nil {
		return PlayResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return PlayResult{}, fmt.Errorf("round: commit play: %w", err)
	}
	return result, nil
}

func replay(ctx context.Context, tx *sql.Tx, item Round, params json.RawMessage) (PlayResult, error) {
	if item.Status == StatusOpen {
		return PlayResult{}, ErrReplayIncomplete
	}
	var stored resultData
	if len(item.ResultData) > 0 {
		if err := json.Unmarshal(item.ResultData, &stored); err != nil {
			return PlayResult{}, fmt.Errorf("round: decode replayed result: %w", err)
		}
	}
	if !sameParams(stored.Params, params) {
		return PlayResult{}, ErrRoundKeyConflict
	}
	display := stored.Result
	if len(display) == 0 {
		display = emptyObject
	}
	return loadResult(ctx, tx, item.UserID, item.ID, display)
}

func loadResult(ctx context.Context, tx *sql.Tx, userID, roundID string, display json.RawMessage) (PlayResult, error) {
	record, err := GetForPlayer(ctx, tx, userID, roundID)
	if err != nil {
		return PlayResult{}, err
	}
	w, err := wallet.GetTx(ctx, tx, userID, record.Currency)
	if err != nil {
		return PlayResult{}, err
	}
	return PlayResult{Round: record, Result: display, Wallet: w}, nil
}

func normaliseParams(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		return emptyObject, nil
	}
	if !json.Valid(raw) {
		return nil, fmt.Errorf("%w: parameters are not valid JSON", engine.ErrInvalidParams)
	}
	return raw, nil
}

func sameParams(stored, requested json.RawMessage) bool {
	var a, b any
	if err := json.Unmarshal(orEmpty(stored), &a); err != nil {
		return false
	}
	if err := json.Unmarshal(orEmpty(requested), &b); err != nil {
		return false
	}
	return reflect.DeepEqual(a, b)
}

func orEmpty(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return emptyObject
	}
	return raw
}
