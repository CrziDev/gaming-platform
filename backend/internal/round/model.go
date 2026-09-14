package round

import (
	"encoding/json"
	"errors"
	"time"
)

var (
	ErrGameUnavailable    = errors.New("round: game is unavailable")
	ErrProfileUnavailable = errors.New("round: active RTP profile is unavailable")
	ErrInvalidWager       = errors.New("round: wager is outside the game's permitted steps")
	ErrInvalidOutcome     = errors.New("round: outcome is invalid")
	ErrNotFound           = errors.New("round: not found")
	ErrRoundKeyRequired   = errors.New("round: round key is required")
	ErrRoundKeyConflict   = errors.New("round: round key belongs to another request")
	ErrRoundSettled       = errors.New("round: round is already settled")
	ErrRoundClosed        = errors.New("round: round cannot make that transition")
)

const (
	StatusOpen      = "open"
	StatusSettled   = "settled"
	StatusCancelled = "cancelled"
	StatusFailed    = "failed"
)

type Round struct {
	ID                   string
	RoundKey             string
	UserID               string
	GameID               string
	WalletID             string
	Currency             string
	RTPProfileID         string
	Status               string
	StakeMinor           int64
	WinMinor             *int64
	MultiplierHundredths *int
	EngineReference      string
	ResultData           json.RawMessage
	StartedAt            time.Time
	SettledAt            *time.Time
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type Record struct {
	Round
	GameSlug        string
	GameName        string
	UserEmail       string
	UserDisplayName string
}

type ReadFilter struct {
	Page     int
	Size     int
	UserID   string
	GameID   string
	Status   string
	Currency string
	From     *time.Time
	To       *time.Time
}

type OpenInput struct {
	RoundKey   string
	UserID     string
	GameID     string
	StakeMinor int64
}

type SettleInput struct {
	RoundID              string
	WinMinor             int64
	MultiplierHundredths int
	EngineReference      string
	ResultData           json.RawMessage
}

type TerminateInput struct {
	RoundID         string
	EngineReference string
	ResultData      json.RawMessage
}
