package engine

import "encoding/json"

// Input is what a round hands an engine: the configuration the round's RTP
// profile references, the player's public parameters as sent, and the stake
// already debited. The engine validates the first two itself.
type Input struct {
	ConfigRef  string
	Params     json.RawMessage
	StakeMinor int64
}

// Outcome is the whole of what an engine may decide. Result is the safe display
// hint the client animates; Reference names the engine and configuration that
// produced the outcome so a settled round can always be traced to its rules.
type Outcome struct {
	WinMinor             int64
	MultiplierHundredths int
	Result               json.RawMessage
	Reference            string
}
