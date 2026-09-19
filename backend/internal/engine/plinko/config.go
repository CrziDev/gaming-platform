package plinko

import (
	"fmt"

	"github.com/gaming-platform/backend/internal/engine"
)

type Risk string

const (
	RiskLow    Risk = "low"
	RiskNormal Risk = "normal"
	RiskHigh   Risk = "high"
)

var Risks = []Risk{RiskLow, RiskNormal, RiskHigh}

const (
	MinRows = 8
	MaxRows = 16
)

// Params are the public parameters a player chooses; the platform validates them
// before any money moves and the frame never widens them.
type Params struct {
	Rows int  `json:"rows"`
	Risk Risk `json:"risk"`
}

func (p Params) Validate() error {
	if p.Rows < MinRows || p.Rows > MaxRows {
		return fmt.Errorf("%w: rows must be between %d and %d", engine.ErrInvalidParams, MinRows, MaxRows)
	}
	if !validRisk(p.Risk) {
		return fmt.Errorf("%w: risk must be low, normal, or high", engine.ErrInvalidParams)
	}
	return nil
}

func validRisk(risk Risk) bool {
	for _, known := range Risks {
		if risk == known {
			return true
		}
	}
	return false
}

// Table is one board's outcome distribution: slot i is drawn with probability
// Weights[i] / Σ Weights and pays MultipliersHundredths[i] / 100 of the stake.
// Both are symmetric about the centre, as the board is.
type Table struct {
	Weights               []int64
	MultipliersHundredths []int
}

func (t Table) Slots() int {
	return len(t.Weights)
}

func (t Table) validate(rows int) error {
	slots := rows + 1
	if len(t.Weights) != slots || len(t.MultipliersHundredths) != slots {
		return fmt.Errorf("%w: %d rows need %d weights and multipliers", engine.ErrInvalidConfig, rows, slots)
	}
	if _, err := engine.SumWeights(t.Weights); err != nil {
		return fmt.Errorf("%w: %v", engine.ErrInvalidConfig, err)
	}
	for i := range slots {
		mirror := slots - 1 - i
		if t.MultipliersHundredths[i] <= 0 {
			return fmt.Errorf("%w: multiplier %d is not positive", engine.ErrInvalidConfig, i)
		}
		if t.Weights[i] != t.Weights[mirror] || t.MultipliersHundredths[i] != t.MultipliersHundredths[mirror] {
			return fmt.Errorf("%w: slot %d does not mirror slot %d", engine.ErrInvalidConfig, i, mirror)
		}
	}
	return nil
}

type tableKey struct {
	Rows int
	Risk Risk
}

// Profile is one immutable engine configuration, addressed by the
// engine_config_ref an RTP profile row records. It carries a table for every
// rows and risk combination a player may choose.
type Profile struct {
	Ref    string
	tables map[tableKey]Table
}

func NewProfile(ref string, tables map[Params]Table) (Profile, error) {
	profile := Profile{Ref: ref, tables: make(map[tableKey]Table, len(tables))}
	for params, table := range tables {
		profile.tables[tableKey{Rows: params.Rows, Risk: params.Risk}] = table
	}
	if err := profile.Validate(); err != nil {
		return Profile{}, err
	}
	return profile, nil
}

func (p Profile) Table(params Params) (Table, error) {
	if err := params.Validate(); err != nil {
		return Table{}, err
	}
	table, ok := p.tables[tableKey{Rows: params.Rows, Risk: params.Risk}]
	if !ok {
		return Table{}, fmt.Errorf("%w: %s has no table for %d rows %s", engine.ErrInvalidConfig, p.Ref, params.Rows, params.Risk)
	}
	return table, nil
}

func (p Profile) Validate() error {
	if p.Ref == "" {
		return fmt.Errorf("%w: profile has no reference", engine.ErrInvalidConfig)
	}
	for rows := MinRows; rows <= MaxRows; rows++ {
		for _, risk := range Risks {
			table, ok := p.tables[tableKey{Rows: rows, Risk: risk}]
			if !ok {
				return fmt.Errorf("%w: %s has no table for %d rows %s", engine.ErrInvalidConfig, p.Ref, rows, risk)
			}
			if err := table.validate(rows); err != nil {
				return fmt.Errorf("%s %d rows %s: %w", p.Ref, rows, risk, err)
			}
		}
	}
	return nil
}
