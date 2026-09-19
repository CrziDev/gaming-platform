package plinko

import (
	"fmt"

	"github.com/gaming-platform/backend/internal/engine"
)

// The options an operator can pick, in ascending return. Each is a literal
// reviewed into the repository; profiles_test.go pins every board of every
// profile to its basis points exactly.
var profiles = []Profile{profile9000, profile9500, profile10500, profile11000}

func ProfileByRef(ref string) (Profile, error) {
	for _, profile := range profiles {
		if profile.Ref == ref {
			return profile, nil
		}
	}
	return Profile{}, fmt.Errorf("%w: %q", engine.ErrUnknownConfig, ref)
}

func ProfileByBasisPoints(basisPoints int) (Profile, bool) {
	for _, profile := range profiles {
		if profile.BasisPoints == basisPoints {
			return profile, true
		}
	}
	return Profile{}, false
}

func Options() []engine.Option {
	options := make([]engine.Option, 0, len(profiles))
	for _, profile := range profiles {
		options = append(options, engine.Option{Ref: profile.Ref, BasisPoints: profile.BasisPoints})
	}
	return options
}

// Profiles are literals reviewed into the repository, so a table that fails
// validation is a build defect, not a runtime condition to recover from.
func mustProfile(ref string, basisPoints int, tables map[Params]Table) Profile {
	profile, err := NewProfile(ref, basisPoints, tables)
	if err != nil {
		panic(err)
	}
	return profile
}
