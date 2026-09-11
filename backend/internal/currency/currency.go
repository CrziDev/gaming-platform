package currency

type Currency struct {
	Code            string
	Name            string
	Symbol          string
	MinorUnits      int
	DepositMinMinor int64
	DepositMaxMinor int64
}
