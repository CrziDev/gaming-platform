package plinko

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/engine"
)

const testRef = "plinko/9500"

func TestEnginePlayReturnsAnOutcomeFromTheReferencedTable(t *testing.T) {
	table, err := profile9500.Table(Params{Rows: 12, Risk: RiskHigh})
	if err != nil {
		t.Fatal(err)
	}
	for range 500 {
		outcome, err := New().Play(engine.Input{ConfigRef: testRef, Params: json.RawMessage(`{"rows": 12, "risk": "high"}`), StakeMinor: 300})
		if err != nil {
			t.Fatal(err)
		}
		var display result
		if err := json.Unmarshal(outcome.Result, &display); err != nil {
			t.Fatal(err)
		}
		if display.Rows != 12 || display.Risk != RiskHigh || display.Slot < 0 || display.Slot >= table.Slots() {
			t.Fatalf("result %s is off the board", outcome.Result)
		}
		if outcome.MultiplierHundredths != table.MultipliersHundredths[display.Slot] {
			t.Fatalf("slot %d pays %d, outcome says %d", display.Slot, table.MultipliersHundredths[display.Slot], outcome.MultiplierHundredths)
		}
		want, err := Payout(300, outcome.MultiplierHundredths)
		if err != nil {
			t.Fatal(err)
		}
		if outcome.WinMinor != want || outcome.Reference != testRef {
			t.Fatalf("outcome %+v: want win %d and reference %q", outcome, want, testRef)
		}
	}
}

func TestEnginePlayRejectsBadParamsConfigAndStake(t *testing.T) {
	cases := map[string]struct {
		in   engine.Input
		want error
	}{
		"missing risk":       {engine.Input{ConfigRef: testRef, Params: json.RawMessage(`{"rows": 8}`), StakeMinor: 100}, engine.ErrInvalidParams},
		"unknown field":      {engine.Input{ConfigRef: testRef, Params: json.RawMessage(`{"rows": 8, "risk": "low", "seed": 1}`), StakeMinor: 100}, engine.ErrInvalidParams},
		"fractional rows":    {engine.Input{ConfigRef: testRef, Params: json.RawMessage(`{"rows": 8.5, "risk": "low"}`), StakeMinor: 100}, engine.ErrInvalidParams},
		"rows out of range":  {engine.Input{ConfigRef: testRef, Params: json.RawMessage(`{"rows": 17, "risk": "low"}`), StakeMinor: 100}, engine.ErrInvalidParams},
		"trailing data":      {engine.Input{ConfigRef: testRef, Params: json.RawMessage(`{"rows": 8, "risk": "low"} {}`), StakeMinor: 100}, engine.ErrInvalidParams},
		"empty params":       {engine.Input{ConfigRef: testRef, Params: nil, StakeMinor: 100}, engine.ErrInvalidParams},
		"unknown config":     {engine.Input{ConfigRef: "plinko/v0", Params: json.RawMessage(`{"rows": 8, "risk": "low"}`), StakeMinor: 100}, engine.ErrUnknownConfig},
		"non-positive stake": {engine.Input{ConfigRef: testRef, Params: json.RawMessage(`{"rows": 8, "risk": "low"}`), StakeMinor: 0}, ErrInvalidStake},
	}
	for name, c := range cases {
		if _, err := New().Play(c.in); !errors.Is(err, c.want) {
			t.Fatalf("%s: want %v, got %v", name, c.want, err)
		}
	}
}

func TestEngineManifestListsEveryBoardWithoutWeights(t *testing.T) {
	raw, err := New().Manifest(testRef)
	if err != nil {
		t.Fatal(err)
	}
	var out manifest
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Rows) != 9 || out.Rows[0] != MinRows || out.Rows[8] != MaxRows || len(out.Risks) != 3 {
		t.Fatalf("manifest = %s", raw)
	}
	table, err := profile9500.Table(Params{Rows: 13, Risk: RiskLow})
	if err != nil {
		t.Fatal(err)
	}
	got := out.MultipliersHundredths["13"][RiskLow]
	if len(got) != 14 || got[6] != table.MultipliersHundredths[6] {
		t.Fatalf("13 low = %v", got)
	}
	if strings.Contains(string(raw), "weight") {
		t.Fatal("a manifest must not expose the weights")
	}
	if _, err := New().Manifest("plinko/v0"); !errors.Is(err, engine.ErrUnknownConfig) {
		t.Fatalf("want %v, got %v", engine.ErrUnknownConfig, err)
	}
}
