package round

import (
	"encoding/json"

	"github.com/gaming-platform/backend/internal/engine"
)

// Engine decides one round's outcome from the stake and the configuration
// behind the game's chosen return, and nothing else: it never sees a wallet, a
// transaction, or the player. The round package owns everything that moves
// money around its answer. Options are the returns it ships, ascending;
// Manifest is the public face of one configuration — the parameters a player
// may choose and what each pays — and carries nothing that could predict an
// outcome.
type Engine interface {
	Options() []engine.Option
	Play(in engine.Input) (engine.Outcome, error)
	Manifest(configRef string) (json.RawMessage, error)
}

// Engines maps a game slug to the engine that plays it; a slug with no entry is
// a game the platform cannot play, whatever its catalogue row says.
type Engines map[string]Engine

func (e Engines) Options(slug string) ([]engine.Option, bool) {
	eng, ok := e[slug]
	if !ok {
		return nil, false
	}
	return eng.Options(), true
}

// optionFor resolves the return a game row holds to the configuration that
// plays it; a game with no return set, or one its engine no longer ships, has
// nothing to play.
func optionFor(options []engine.Option, basisPoints *int) (engine.Option, bool) {
	if basisPoints == nil {
		return engine.Option{}, false
	}
	for _, option := range options {
		if option.BasisPoints == *basisPoints {
			return option, true
		}
	}
	return engine.Option{}, false
}
