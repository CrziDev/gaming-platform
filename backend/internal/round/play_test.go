package round

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/gaming-platform/backend/internal/engine"
	"github.com/gaming-platform/backend/internal/money"
	"github.com/gaming-platform/backend/internal/wallet"
)

type stubEngine struct {
	outcome engine.Outcome
	err     error
	calls   atomic.Int32
	mu      sync.Mutex
	inputs  []engine.Input
}

func (s *stubEngine) Play(in engine.Input) (engine.Outcome, error) {
	s.calls.Add(1)
	s.mu.Lock()
	s.inputs = append(s.inputs, in)
	s.mu.Unlock()
	return s.outcome, s.err
}

func (s *stubEngine) Options() []engine.Option {
	return testOptions
}

func (s *stubEngine) Manifest(configRef string) (json.RawMessage, error) {
	if s.err != nil {
		return nil, s.err
	}
	return json.RawMessage(`{"config":"` + configRef + `"}`), nil
}

func winningEngine(win int64, multiplier int) *stubEngine {
	return &stubEngine{outcome: engine.Outcome{
		WinMinor: win, MultiplierHundredths: multiplier, Result: json.RawMessage(`{"slot":2}`), Reference: "test/v1",
	}}
}

var plinkoParams = json.RawMessage(`{"rows": 8, "risk": "normal"}`)

func playInput(fixture roundFixture, key string, stake int64) PlayInput {
	return PlayInput{IdempotencyKey: key, UserID: fixture.UserID, GameID: fixture.GameID, Currency: "PHP", StakeMinor: stake, Params: plinkoParams}
}

type ledger struct {
	Rounds, Wagers, Wins int
	Balance              int64
}

func ledgerFor(t *testing.T, fixture roundFixture) ledger {
	t.Helper()
	db := openRoundTestDB(t)
	var l ledger
	if err := db.QueryRow(`SELECT count(*) FROM game_rounds WHERE game_id = ($1::text)::uuid`, fixture.GameID).Scan(&l.Rounds); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT count(*) FILTER (WHERE kind = 'wager'), count(*) FILTER (WHERE kind = 'win') FROM wallet_transactions WHERE user_id = ($1::text)::uuid`, fixture.UserID).Scan(&l.Wagers, &l.Wins); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, fixture.UserID).Scan(&l.Balance); err != nil {
		t.Fatal(err)
	}
	return l
}

func TestPlayDebitsDecidesAndCreditsInOneCommit(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	eng := winningEngine(340, 170)

	result, err := Play(context.Background(), db, eng, playInput(fixture, "play-once-"+fixture.Suffix, 200))
	if err != nil {
		t.Fatalf("play: %v", err)
	}
	round := result.Round
	if round.Status != StatusSettled || round.StakeMinor != 200 || round.WinMinor == nil || *round.WinMinor != 340 || round.MultiplierHundredths == nil || *round.MultiplierHundredths != 170 {
		t.Fatalf("round = %+v", round)
	}
	if round.RTPBasisPoints != 9600 || round.EngineReference != "test/v1" || round.SettledAt == nil || round.GameSlug == "" {
		t.Fatalf("round bindings = %+v", round)
	}
	if !sameParams(result.Result, json.RawMessage(`{"slot":2}`)) || result.Wallet.BalanceMinor != 1_140 || result.Wallet.Currency != "PHP" {
		t.Fatalf("result = %s wallet = %+v", result.Result, result.Wallet)
	}
	if eng.calls.Load() != 1 || eng.inputs[0].ConfigRef != "test:v1" || eng.inputs[0].StakeMinor != 200 || string(eng.inputs[0].Params) != string(plinkoParams) {
		t.Fatalf("engine input = %+v", eng.inputs)
	}

	var stored resultData
	if err := json.Unmarshal(round.ResultData, &stored); err != nil {
		t.Fatalf("result data %s: %v", round.ResultData, err)
	}
	if !sameParams(stored.Result, json.RawMessage(`{"slot":2}`)) || !sameParams(stored.Params, plinkoParams) {
		t.Fatalf("stored result data = %s", round.ResultData)
	}
	if l := ledgerFor(t, fixture); l != (ledger{Rounds: 1, Wagers: 1, Wins: 1, Balance: 1_140}) {
		t.Fatalf("ledger = %+v", l)
	}
	if n := notificationsFor(t, fixture); n != 0 {
		t.Fatalf("a handler with no threshold notified %d times", n)
	}
}

func notificationsFor(t *testing.T, fixture roundFixture) int {
	t.Helper()
	db := openRoundTestDB(t)
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM notifications WHERE user_id = ($1::text)::uuid AND kind = 'round_win' AND reference_type = 'round'`, fixture.UserID).Scan(&count); err != nil {
		t.Fatalf("count notifications: %v", err)
	}
	return count
}

func TestPlayNotifiesABigWinOnceAtTheThreshold(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	eng := winningEngine(340, 170)

	below := playInput(fixture, "play-below-"+fixture.Suffix, 200)
	below.BigWinMultiplierHundredths = 171
	if _, err := Play(context.Background(), db, eng, below); err != nil {
		t.Fatalf("play below the threshold: %v", err)
	}
	if n := notificationsFor(t, fixture); n != 0 {
		t.Fatalf("a 1.70x win notified at a 1.71x threshold: %d", n)
	}

	at := playInput(fixture, "play-at-"+fixture.Suffix, 200)
	at.BigWinMultiplierHundredths = 170
	for range 2 {
		if _, err := Play(context.Background(), db, eng, at); err != nil {
			t.Fatalf("play at the threshold: %v", err)
		}
	}
	if n := notificationsFor(t, fixture); n != 1 {
		t.Fatalf("a settled win and its retry notified %d times, want once", n)
	}
	var amount int64
	var currency, roundID string
	if err := db.QueryRow(`SELECT amount_minor, currency, reference_id::text FROM notifications WHERE user_id = ($1::text)::uuid AND kind = 'round_win'`, fixture.UserID).Scan(&amount, &currency, &roundID); err != nil {
		t.Fatalf("read notification: %v", err)
	}
	var settled string
	if err := db.QueryRow(`SELECT id::text FROM game_rounds WHERE round_key = $1`, "play:"+fixture.UserID+":play-at-"+fixture.Suffix).Scan(&settled); err != nil {
		t.Fatalf("find the round: %v", err)
	}
	if amount != 340 || currency != "PHP" || roundID != settled {
		t.Fatalf("notification = %d %s round %s, want 340 PHP round %s", amount, currency, roundID, settled)
	}

	zero := &stubEngine{outcome: engine.Outcome{WinMinor: 0, MultiplierHundredths: 0, Reference: "test/v1"}}
	none := playInput(fixture, "play-none-"+fixture.Suffix, 200)
	none.BigWinMultiplierHundredths = 0
	if _, err := Play(context.Background(), db, zero, none); err != nil {
		t.Fatalf("play with no win: %v", err)
	}
	if n := notificationsFor(t, fixture); n != 1 {
		t.Fatalf("a losing round changed the count to %d", n)
	}
}

func TestPlayZeroWinWritesNoWinMovement(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	eng := &stubEngine{outcome: engine.Outcome{WinMinor: 0, MultiplierHundredths: 0, Reference: "test/v1"}}

	result, err := Play(context.Background(), db, eng, playInput(fixture, "play-zero-"+fixture.Suffix, 200))
	if err != nil {
		t.Fatalf("play: %v", err)
	}
	if *result.Round.WinMinor != 0 || string(result.Result) != `{}` || result.Wallet.BalanceMinor != 800 {
		t.Fatalf("result = %+v %s", result.Round, result.Result)
	}
	if l := ledgerFor(t, fixture); l != (ledger{Rounds: 1, Wagers: 1, Wins: 0, Balance: 800}) {
		t.Fatalf("ledger = %+v", l)
	}
}

func TestPlayRetryReturnsTheCommittedRoundWithoutPlayingAgain(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	eng := winningEngine(340, 170)
	in := playInput(fixture, "play-retry-"+fixture.Suffix, 200)

	first, err := Play(context.Background(), db, eng, in)
	if err != nil {
		t.Fatalf("first play: %v", err)
	}
	reordered := in
	reordered.Params = json.RawMessage(`{"risk":"normal","rows":8}`)
	second, err := Play(context.Background(), db, eng, reordered)
	if err != nil {
		t.Fatalf("retry: %v", err)
	}
	if second.Round.ID != first.Round.ID || *second.Round.WinMinor != 340 || !sameParams(second.Result, json.RawMessage(`{"slot":2}`)) || second.Wallet.BalanceMinor != 1_140 {
		t.Fatalf("retry = %+v %s %+v", second.Round, second.Result, second.Wallet)
	}
	if eng.calls.Load() != 1 {
		t.Fatalf("engine played %d times", eng.calls.Load())
	}

	otherStake := in
	otherStake.StakeMinor = 300
	if _, err := Play(context.Background(), db, eng, otherStake); !errors.Is(err, ErrRoundKeyConflict) {
		t.Fatalf("other stake: want %v, got %v", ErrRoundKeyConflict, err)
	}
	otherParams := in
	otherParams.Params = json.RawMessage(`{"rows": 9, "risk": "normal"}`)
	if _, err := Play(context.Background(), db, eng, otherParams); !errors.Is(err, ErrRoundKeyConflict) {
		t.Fatalf("other params: want %v, got %v", ErrRoundKeyConflict, err)
	}

	otherPlayer := createRoundFixture(t, db, 1_000)
	otherPlayer.GameID = fixture.GameID
	theirs, err := Play(context.Background(), db, eng, playInput(otherPlayer, "play-retry-"+fixture.Suffix, 200))
	if err != nil {
		t.Fatalf("another player with the same key: %v", err)
	}
	if theirs.Round.ID == first.Round.ID {
		t.Fatal("a key must be scoped to the player")
	}
	if l := ledgerFor(t, fixture); l != (ledger{Rounds: 2, Wagers: 1, Wins: 1, Balance: 1_140}) {
		t.Fatalf("ledger = %+v", l)
	}
}

func TestPlayConcurrentDuplicatesSettleOneRound(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	eng := winningEngine(340, 170)
	in := playInput(fixture, "play-concurrent-"+fixture.Suffix, 200)

	const attempts = 8
	results := make([]PlayResult, attempts)
	errs := make([]error, attempts)
	var wg sync.WaitGroup
	for i := range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i], errs[i] = Play(context.Background(), db, eng, in)
		}()
	}
	wg.Wait()
	for i := range attempts {
		if errs[i] != nil {
			t.Fatalf("attempt %d: %v", i, errs[i])
		}
		if results[i].Round.ID != results[0].Round.ID || results[i].Wallet.BalanceMinor != 1_140 {
			t.Fatalf("attempt %d diverged: %+v", i, results[i])
		}
	}
	if eng.calls.Load() != 1 {
		t.Fatalf("engine played %d times", eng.calls.Load())
	}
	if l := ledgerFor(t, fixture); l != (ledger{Rounds: 1, Wagers: 1, Wins: 1, Balance: 1_140}) {
		t.Fatalf("ledger = %+v", l)
	}
}

func TestPlayConcurrentDistinctRoundsNeverOverspendTheWallet(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 500)
	eng := &stubEngine{outcome: engine.Outcome{WinMinor: 0, MultiplierHundredths: 0, Reference: "test/v1"}}

	const attempts = 8
	errs := make([]error, attempts)
	var wg sync.WaitGroup
	for i := range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = Play(context.Background(), db, eng, playInput(fixture, fmt.Sprintf("play-distinct-%d-%s", i, fixture.Suffix), 200))
		}()
	}
	wg.Wait()

	var settled, refused int
	for i, err := range errs {
		switch {
		case err == nil:
			settled++
		case errors.Is(err, wallet.ErrInsufficientFunds):
			refused++
		default:
			t.Fatalf("attempt %d: unexpected error: %v", i, err)
		}
	}
	if settled != 2 || refused != attempts-settled {
		t.Fatalf("settled %d and refused %d attempts, want 2 and %d", settled, refused, attempts-2)
	}
	if eng.calls.Load() != int32(settled) {
		t.Fatalf("engine played %d times for %d settled rounds", eng.calls.Load(), settled)
	}
	if l := ledgerFor(t, fixture); l != (ledger{Rounds: 2, Wagers: 2, Balance: 100}) {
		t.Fatalf("ledger = %+v", l)
	}
}

func TestPlayWritesNothingWhenItCannotComplete(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	untouched := ledger{Rounds: 0, Wagers: 0, Wins: 0, Balance: 1_000}

	poor := createRoundFixture(t, db, 100)
	if _, err := Play(context.Background(), db, winningEngine(340, 170), playInput(poor, "play-poor-"+poor.Suffix, 200)); !errors.Is(err, wallet.ErrInsufficientFunds) {
		t.Fatalf("insufficient balance: want %v, got %v", wallet.ErrInsufficientFunds, err)
	}
	if l := ledgerFor(t, poor); l != (ledger{Balance: 100}) {
		t.Fatalf("insufficient balance: ledger = %+v", l)
	}

	cases := map[string]struct {
		engine Engine
		mutate func(in *PlayInput)
		want   error
	}{
		"wager off the step":  {winningEngine(340, 170), func(in *PlayInput) { in.StakeMinor = 150 }, ErrInvalidWager},
		"wrong currency":      {winningEngine(340, 170), func(in *PlayInput) { in.Currency = "USD" }, ErrUnsupportedCurrency},
		"invalid params json": {winningEngine(340, 170), func(in *PlayInput) { in.Params = json.RawMessage(`{rows`) }, engine.ErrInvalidParams},
		"no key":              {winningEngine(340, 170), func(in *PlayInput) { in.IdempotencyKey = " " }, ErrRoundKeyRequired},
		"no engine":           {nil, func(*PlayInput) {}, ErrEngineRequired},
		"engine refuses":      {&stubEngine{err: engine.ErrInvalidParams}, func(*PlayInput) {}, engine.ErrInvalidParams},
		"engine config gone":  {&stubEngine{err: engine.ErrUnknownConfig}, func(*PlayInput) {}, engine.ErrUnknownConfig},
		"unsafe win":          {winningEngine(money.MaxSafeMinor+1, 100), func(*PlayInput) {}, ErrInvalidOutcome},
		"negative win":        {winningEngine(-1, 100), func(*PlayInput) {}, ErrInvalidOutcome},
		"balance overflow":    {winningEngine(money.MaxSafeMinor, 100), func(*PlayInput) {}, wallet.ErrAmountOverflow},
	}
	for name, c := range cases {
		in := playInput(fixture, "play-"+name+"-"+fixture.Suffix, 200)
		c.mutate(&in)
		if _, err := Play(context.Background(), db, c.engine, in); !errors.Is(err, c.want) {
			t.Fatalf("%s: want %v, got %v", name, c.want, err)
		}
		if l := ledgerFor(t, fixture); l != untouched {
			t.Fatalf("%s: ledger = %+v", name, l)
		}
	}
}

func TestPlayRequiresAReturnTheEngineOffers(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	if _, err := db.Exec(`UPDATE games SET rtp_basis_points = 9700 WHERE id = ($1::text)::uuid`, fixture.GameID); err != nil {
		t.Fatal(err)
	}
	eng := winningEngine(340, 170)
	if _, err := Play(context.Background(), db, eng, playInput(fixture, "play-noref-"+fixture.Suffix, 200)); !errors.Is(err, ErrProfileUnavailable) {
		t.Fatalf("want %v, got %v", ErrProfileUnavailable, err)
	}
	if eng.calls.Load() != 0 {
		t.Fatal("engine must not play a return it does not offer")
	}
	if l := ledgerFor(t, fixture); l != (ledger{Balance: 1_000}) {
		t.Fatalf("ledger = %+v", l)
	}
}

func TestPlayRetryOfAnUnsettledRoundIsRefused(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	key := "play-open-" + fixture.Suffix
	if _, err := Open(context.Background(), db, testOptions, OpenInput{RoundKey: "play:" + fixture.UserID + ":" + key, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 200}); err != nil {
		t.Fatal(err)
	}
	in := playInput(fixture, key, 200)
	in.Params = nil
	if _, err := Play(context.Background(), db, winningEngine(340, 170), in); !errors.Is(err, ErrReplayIncomplete) {
		t.Fatalf("want %v, got %v", ErrReplayIncomplete, err)
	}
}
