package game

import (
	"errors"
	"time"
)

var (
	ErrNoGame              = errors.New("game: no such game")
	ErrSlugTaken           = errors.New("game: slug is already taken")
	ErrNoCategory          = errors.New("game: no such category")
	ErrCurrencyUnavailable = errors.New("game: currency is not enabled")
	ErrWagerNotWholeUnits  = errors.New("game: wager bounds must be whole currency units")
	ErrWagerBounds         = errors.New("game: wager bounds are out of order")
	ErrWagerLimitsRequired = errors.New("game: PHP and USD wager limits are required")
)

const (
	StatusDraft       = "draft"
	StatusActive      = "active"
	StatusMaintenance = "maintenance"
	StatusRetired     = "retired"
)

var Statuses = map[string]bool{StatusDraft: true, StatusActive: true, StatusMaintenance: true, StatusRetired: true}

const (
	SortName   = "name"
	SortNewest = "newest"
)

const (
	FlagHot = "hot"
	FlagNew = "new"
)

const newWindow = 30 * 24 * time.Hour
const hotWindow = 7 * 24 * time.Hour

type Game struct {
	ID            string
	Slug          string
	Name          string
	Description   string
	CategorySlug  string
	CategoryName  string
	Provider      string
	Status        string
	Integration   string
	WagerLimits   map[string]WagerLimit
	ThumbnailPath string
	// The return the game plays at, one of its engine's options; nil until an
	// operator picks one, and the game cannot play until then.
	RTPBasisPoints *int
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Hot            bool
}

type WagerLimit struct {
	MinWagerMinor  int64 `json:"min_wager_minor"`
	MaxWagerMinor  int64 `json:"max_wager_minor"`
	WagerStepMinor int64 `json:"wager_step_minor"`
}

var SupportedWagerCurrencies = []string{"PHP", "USD"}

type AdminGame struct {
	Game
	Rounds30d int
}

type Category struct {
	Slug      string
	Name      string
	GameCount int
}

func NewSince(now time.Time) time.Time {
	return now.Add(-newWindow)
}

func HotSince(now time.Time) time.Time {
	return now.Add(-hotWindow)
}

func (g Game) Flags(now time.Time) []string {
	flags := make([]string, 0, 2)
	if g.Hot {
		flags = append(flags, FlagHot)
	}
	if !g.CreatedAt.Before(NewSince(now)) {
		flags = append(flags, FlagNew)
	}
	return flags
}
