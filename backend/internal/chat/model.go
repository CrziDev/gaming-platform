package chat

import "time"

const (
	MaxMessageLength = 280
	recentMessages   = 50
)

type Message struct {
	ID          string
	UserID      string
	DisplayName string
	Role        string
	Text        string
	CreatedAt   time.Time
}
