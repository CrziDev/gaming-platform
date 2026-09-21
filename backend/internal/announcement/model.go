package announcement

import (
	"errors"
	"time"
)

var (
	ErrNotFound = errors.New("announcement: not found")
	ErrEnded    = errors.New("announcement: end time has passed")
)

type Announcement struct {
	ID        string
	Text      string
	Enabled   bool
	EndsAt    *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}
