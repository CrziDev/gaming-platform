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
	ErrCurrencyLocked      = errors.New("game: currency cannot change once rounds exist")
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

const FlagNew = "new"

const newWindow = 30 * 24 * time.Hour

type Game struct {
	ID             string
	Slug           string
	Name           string
	Description    string
	CategorySlug   string
	CategoryName   string
	Provider       string
	Status         string
	Integration    string
	Currency       string
	MinWagerMinor  int64
	MaxWagerMinor  int64
	WagerStepMinor int64
	ThumbnailPath  string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type AdminGame struct {
	Game
	ActiveRTPBasisPoints *int
	Rounds30d            int
}

type Category struct {
	Slug      string
	Name      string
	GameCount int
}

func NewSince(now time.Time) time.Time {
	return now.Add(-newWindow)
}

func (g Game) Flags(now time.Time) []string {
	flags := make([]string, 0, 1)
	if !g.CreatedAt.Before(NewSince(now)) {
		flags = append(flags, FlagNew)
	}
	return flags
}
