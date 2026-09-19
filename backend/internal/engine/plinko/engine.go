package plinko

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/gaming-platform/backend/internal/engine"
)

type Engine struct{}

func New() Engine {
	return Engine{}
}

type result struct {
	Rows int  `json:"rows"`
	Risk Risk `json:"risk"`
	Slot int  `json:"slot"`
}

// Play draws from the secure source only; there is no way to hand it another.
func (Engine) Play(in engine.Input) (engine.Outcome, error) {
	params, err := decodeParams(in.Params)
	if err != nil {
		return engine.Outcome{}, err
	}
	profile, err := ProfileByRef(in.ConfigRef)
	if err != nil {
		return engine.Outcome{}, err
	}
	table, err := profile.Table(params)
	if err != nil {
		return engine.Outcome{}, err
	}
	slot, err := Pick(engine.SecureSource(), table)
	if err != nil {
		return engine.Outcome{}, err
	}
	multiplier := table.MultipliersHundredths[slot]
	win, err := Payout(in.StakeMinor, multiplier)
	if err != nil {
		return engine.Outcome{}, err
	}
	display, err := json.Marshal(result{Rows: params.Rows, Risk: params.Risk, Slot: slot})
	if err != nil {
		return engine.Outcome{}, fmt.Errorf("plinko: encode result: %w", err)
	}
	return engine.Outcome{WinMinor: win, MultiplierHundredths: multiplier, Result: display, Reference: profile.Ref}, nil
}

func decodeParams(raw json.RawMessage) (Params, error) {
	var params Params
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&params); err != nil {
		return Params{}, fmt.Errorf("%w: rows and risk are required", engine.ErrInvalidParams)
	}
	if decoder.More() {
		return Params{}, fmt.Errorf("%w: unexpected trailing data", engine.ErrInvalidParams)
	}
	if err := params.Validate(); err != nil {
		return Params{}, err
	}
	return params, nil
}
