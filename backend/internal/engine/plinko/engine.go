package plinko

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/gaming-platform/backend/internal/engine"
)

type Engine struct{}

func New() Engine {
	return Engine{}
}

func (Engine) Options() []engine.Option {
	return Options()
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

type manifest struct {
	Rows                  []int                     `json:"rows"`
	Risks                 []Risk                    `json:"risks"`
	MultipliersHundredths map[string]map[Risk][]int `json:"multipliers_hundredths"`
}

func (Engine) Manifest(configRef string) (json.RawMessage, error) {
	profile, err := ProfileByRef(configRef)
	if err != nil {
		return nil, err
	}
	out := manifest{Risks: Risks, MultipliersHundredths: make(map[string]map[Risk][]int)}
	for rows := MinRows; rows <= MaxRows; rows++ {
		out.Rows = append(out.Rows, rows)
		byRisk := make(map[Risk][]int, len(Risks))
		for _, risk := range Risks {
			table, err := profile.Table(Params{Rows: rows, Risk: risk})
			if err != nil {
				return nil, err
			}
			byRisk[risk] = table.MultipliersHundredths
		}
		out.MultipliersHundredths[strconv.Itoa(rows)] = byRisk
	}
	encoded, err := json.Marshal(out)
	if err != nil {
		return nil, fmt.Errorf("plinko: encode manifest: %w", err)
	}
	return encoded, nil
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
