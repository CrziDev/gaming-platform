package plinko

import (
	"fmt"

	"github.com/gaming-platform/backend/internal/engine"
)

var profiles = map[string]Profile{v1.Ref: v1}

func ProfileByRef(ref string) (Profile, error) {
	profile, ok := profiles[ref]
	if !ok {
		return Profile{}, fmt.Errorf("%w: %q", engine.ErrUnknownConfig, ref)
	}
	return profile, nil
}

func ProfileRefs() []string {
	refs := make([]string, 0, len(profiles))
	for ref := range profiles {
		refs = append(refs, ref)
	}
	return refs
}

// Profiles are literals reviewed into the repository, so a table that fails
// validation is a build defect, not a runtime condition to recover from.
func mustProfile(ref string, tables map[Params]Table) Profile {
	profile, err := NewProfile(ref, tables)
	if err != nil {
		panic(err)
	}
	return profile
}
