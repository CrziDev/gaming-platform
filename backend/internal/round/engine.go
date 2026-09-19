package round

import "github.com/gaming-platform/backend/internal/engine"

// Engine decides one round's outcome from the stake and the profile's
// configuration and nothing else: it never sees a wallet, a transaction, or the
// player. The round package owns everything that moves money around its answer.
type Engine interface {
	Play(in engine.Input) (engine.Outcome, error)
}

// Engines maps a game slug to the engine that plays it; a slug with no entry is
// a game the platform cannot play, whatever its catalogue row says.
type Engines map[string]Engine
