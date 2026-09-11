package httpx

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)

const (
	DefaultPageSize = 20
	MaximumPageSize = 100
)

type Query struct {
	Page     int
	Size     int
	Search   string
	Status   string
	Type     string
	Currency string
	GameID   string
	UserID   string
	From     *time.Time
	To       *time.Time
}

type Page[T any] struct {
	Rows  []T `json:"rows"`
	Total int `json:"total"`
	Page  int `json:"page"`
	Size  int `json:"size"`
	Pages int `json:"pages"`
}

func ReadQuery(w http.ResponseWriter, r *http.Request) (Query, bool) {
	values := r.URL.Query()
	query := Query{
		Page:     1,
		Size:     DefaultPageSize,
		Search:   strings.TrimSpace(values.Get("search")),
		Status:   strings.TrimSpace(values.Get("status")),
		Type:     strings.TrimSpace(values.Get("type")),
		Currency: strings.ToUpper(strings.TrimSpace(values.Get("currency"))),
		GameID:   strings.TrimSpace(values.Get("game_id")),
		UserID:   strings.TrimSpace(values.Get("user_id")),
	}

	fields := make(map[string]string)
	query.Page = readPositiveInteger(values.Get("page"), 1, "Page must be a positive integer", "page", fields)
	query.Size = readPositiveInteger(values.Get("size"), DefaultPageSize, "Size must be a positive integer", "size", fields)
	if query.Size > MaximumPageSize {
		fields["size"] = "Size must not exceed 100"
	}
	if query.Page-1 > int(^uint(0)>>1)/query.Size {
		fields["page"] = "Page is too large"
	}

	query.From = readTime(values.Get("from"), "from", fields)
	query.To = readTime(values.Get("to"), "to", fields)
	if query.From != nil && query.To != nil && query.From.After(*query.To) {
		fields["to"] = "To must not be earlier than from"
	}

	if len(fields) > 0 {
		WriteFieldErrors(w, "One or more filters are invalid", fields)
		return Query{}, false
	}
	return query, true
}

func NewPage[T any](rows []T, total, page, size int) Page[T] {
	pages := (total + size - 1) / size
	if pages == 0 {
		pages = 1
	}
	return Page[T]{Rows: rows, Total: total, Page: page, Size: size, Pages: pages}
}

func IsUUID(value string) bool {
	return uuidPattern.MatchString(value)
}

func readPositiveInteger(value string, fallback int, message, field string, fields map[string]string) int {
	if value == "" {
		return fallback
	}

	number, err := strconv.Atoi(value)
	if err != nil || number < 1 {
		fields[field] = message
		return fallback
	}
	return number
}

func readTime(value, field string, fields map[string]string) *time.Time {
	if value == "" {
		return nil
	}

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		fields[field] = "Use an RFC 3339 timestamp"
		return nil
	}
	parsed = parsed.UTC()
	return &parsed
}
