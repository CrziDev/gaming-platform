package rtp

import (
	"errors"
	"time"
)

var (
	ErrNoProfile        = errors.New("rtp: no such profile")
	ErrNameVersionTaken = errors.New("rtp: name and version are already taken")
	ErrNotDraft         = errors.New("rtp: only a draft profile can be edited")
	ErrNotVerified      = errors.New("rtp: only a verified profile can be activated")
	ErrDefaultRequired  = errors.New("rtp: a timed profile needs a different verified default")
	ErrTargetOutOfRange = errors.New("rtp: target is outside 5000-20000 basis points")
	ErrEndRequired      = errors.New("rtp: a profile at or above 100% needs an end time")
	ErrScheduleOrder    = errors.New("rtp: the end must be after the start")
	ErrEvidenceMismatch = errors.New("rtp: verification evidence does not match the profile")
)

const (
	StatusDraft    = "draft"
	StatusVerified = "verified"
	StatusActive   = "active"
	StatusRetired  = "retired"
)

var Statuses = map[string]bool{StatusDraft: true, StatusVerified: true, StatusActive: true, StatusRetired: true}

// The bounds of rtp_profiles_target_sane; which targets a game can reach is
// its engine's business, not the platform's.
const (
	MinTargetBasisPoints = 5000
	MaxTargetBasisPoints = 20000
)

func targetInRange(basisPoints int) bool {
	return basisPoints >= MinTargetBasisPoints && basisPoints <= MaxTargetBasisPoints
}

const NegativeMarginBasisPoints = 10000

type Profile struct {
	ID                     string
	GameID                 string
	GameSlug               string
	GameName               string
	Name                   string
	Version                int
	TargetBasisPoints      int
	Status                 string
	EngineConfigRef        string
	TheoreticalBasisPoints *int
	ObservedBasisPoints    *int
	VerifiedAt             *time.Time
	EffectiveFrom          *time.Time
	EffectiveUntil         *time.Time
	IsDefault              bool
	CreatedBy              string
	CreatedByDisplayName   string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}
