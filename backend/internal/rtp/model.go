package rtp

import (
	"errors"
	"time"
)

var (
	ErrNoProfile         = errors.New("rtp: no such profile")
	ErrNameVersionTaken  = errors.New("rtp: name and version are already taken")
	ErrNotDraft          = errors.New("rtp: only a draft profile can be edited")
	ErrNotVerified       = errors.New("rtp: only a verified profile can be activated")
	ErrDefaultRequired   = errors.New("rtp: a timed profile needs a different verified default")
	ErrTargetUnsupported = errors.New("rtp: target is not in the supported set")
	ErrEndRequired       = errors.New("rtp: a profile at or above 100% needs an end time")
	ErrScheduleOrder     = errors.New("rtp: the end must be after the start")
)

const (
	StatusDraft    = "draft"
	StatusVerified = "verified"
	StatusActive   = "active"
	StatusRetired  = "retired"
)

var Statuses = map[string]bool{StatusDraft: true, StatusVerified: true, StatusActive: true, StatusRetired: true}

// The Phase 1 target set. A target outside it has no engine that could
// implement it, so a profile cannot be drafted against it.
var Targets = map[int]bool{9200: true, 9400: true, 9600: true, 10000: true, 10200: true, 10500: true}

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
