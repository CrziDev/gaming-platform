package plinko

import (
	"errors"
	"testing"

	"github.com/gaming-platform/backend/internal/engine"
)

func TestParamsValidate(t *testing.T) {
	for _, params := range []Params{{Rows: 8, Risk: RiskLow}, {Rows: 16, Risk: RiskHigh}, {Rows: 12, Risk: RiskNormal}} {
		if err := params.Validate(); err != nil {
			t.Fatalf("%+v: %v", params, err)
		}
	}
	for _, params := range []Params{{Rows: 7, Risk: RiskLow}, {Rows: 17, Risk: RiskLow}, {Rows: 8, Risk: "medium"}, {Rows: 8, Risk: ""}, {}} {
		if err := params.Validate(); !errors.Is(err, engine.ErrInvalidParams) {
			t.Fatalf("%+v: want %v, got %v", params, engine.ErrInvalidParams, err)
		}
	}
}

func suppliedProfileTables(t *testing.T) map[Params]Table {
	t.Helper()
	tables := make(map[Params]Table)
	for rows := MinRows; rows <= MaxRows; rows++ {
		for _, risk := range Risks {
			params := Params{Rows: rows, Risk: risk}
			table, err := SuppliedTable(params)
			if err != nil {
				t.Fatal(err)
			}
			tables[params] = table
		}
	}
	return tables
}

func TestNewProfileAcceptsEveryBoard(t *testing.T) {
	profile, err := NewProfile("plinko/test", suppliedProfileTables(t))
	if err != nil {
		t.Fatal(err)
	}
	table, err := profile.Table(Params{Rows: 8, Risk: RiskNormal})
	if err != nil {
		t.Fatal(err)
	}
	if table.Slots() != 9 || table.MultipliersHundredths[4] != 50 {
		t.Fatalf("unexpected 8/normal table: %+v", table)
	}
	if _, err := profile.Table(Params{Rows: 20, Risk: RiskNormal}); !errors.Is(err, engine.ErrInvalidParams) {
		t.Fatalf("want %v, got %v", engine.ErrInvalidParams, err)
	}
}

func TestNewProfileRefusesBrokenTables(t *testing.T) {
	broken := func(mutate func(tables map[Params]Table)) map[Params]Table {
		tables := suppliedProfileTables(t)
		mutate(tables)
		return tables
	}
	cases := map[string]map[Params]Table{
		"missing board": broken(func(tables map[Params]Table) { delete(tables, Params{Rows: 13, Risk: RiskHigh}) }),
		"wrong length": broken(func(tables map[Params]Table) {
			tables[Params{Rows: 8, Risk: RiskLow}] = Table{Weights: []int64{1, 2, 1}, MultipliersHundredths: []int{100, 100, 100}}
		}),
		"asymmetric weights": broken(func(tables map[Params]Table) {
			table := tables[Params{Rows: 8, Risk: RiskLow}]
			weights := append([]int64(nil), table.Weights...)
			weights[0]++
			tables[Params{Rows: 8, Risk: RiskLow}] = Table{Weights: weights, MultipliersHundredths: table.MultipliersHundredths}
		}),
		"asymmetric multipliers": broken(func(tables map[Params]Table) {
			table := tables[Params{Rows: 8, Risk: RiskLow}]
			multipliers := append([]int(nil), table.MultipliersHundredths...)
			multipliers[8]++
			tables[Params{Rows: 8, Risk: RiskLow}] = Table{Weights: table.Weights, MultipliersHundredths: multipliers}
		}),
		"zero weight": broken(func(tables map[Params]Table) {
			table := tables[Params{Rows: 8, Risk: RiskLow}]
			weights := append([]int64(nil), table.Weights...)
			weights[4] = 0
			tables[Params{Rows: 8, Risk: RiskLow}] = Table{Weights: weights, MultipliersHundredths: table.MultipliersHundredths}
		}),
		"zero multiplier": broken(func(tables map[Params]Table) {
			table := tables[Params{Rows: 8, Risk: RiskLow}]
			multipliers := append([]int(nil), table.MultipliersHundredths...)
			multipliers[4] = 0
			tables[Params{Rows: 8, Risk: RiskLow}] = Table{Weights: table.Weights, MultipliersHundredths: multipliers}
		}),
	}
	for name, tables := range cases {
		if _, err := NewProfile("plinko/test", tables); !errors.Is(err, engine.ErrInvalidConfig) {
			t.Fatalf("%s: want %v, got %v", name, engine.ErrInvalidConfig, err)
		}
	}
	if _, err := NewProfile("", suppliedProfileTables(t)); !errors.Is(err, engine.ErrInvalidConfig) {
		t.Fatalf("empty ref: want %v, got %v", engine.ErrInvalidConfig, err)
	}
}

func TestSuppliedTablesMatchTheirBoards(t *testing.T) {
	for rows := MinRows; rows <= MaxRows; rows++ {
		if len(SuppliedWeights[rows]) != rows+1 {
			t.Fatalf("%d rows: %d weights", rows, len(SuppliedWeights[rows]))
		}
		for _, risk := range Risks {
			if len(SuppliedMultipliersHundredths[rows][risk]) != rows+1 {
				t.Fatalf("%d rows %s: %d multipliers", rows, risk, len(SuppliedMultipliersHundredths[rows][risk]))
			}
		}
	}
}
