package auth_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func TestAnnouncementHTTPFlowIsPublicAndAdministratorManaged(t *testing.T) {
	db := requireDB(t)
	base, publicClient := newServer(t, db)
	adminClient, _ := registerAdmin(t, db, base, "announcement-admin@example.com")

	status, body := send(t, adminClient, http.MethodPost, base+"/api/admin/announcements", map[string]any{
		"text": "Scheduled maintenance tonight.", "ends_at": nil,
	})
	if status != http.StatusCreated {
		t.Fatalf("create announcement: want 201, got %d (%s)", status, body)
	}
	var created struct {
		ID      string  `json:"id"`
		Text    string  `json:"text"`
		EndsAt  *string `json:"ends_at"`
		Enabled bool    `json:"enabled"`
	}
	if err := json.Unmarshal(body, &created); err != nil || created.ID == "" || !created.Enabled || created.EndsAt != nil {
		t.Fatalf("unexpected create response: %+v err=%v (%s)", created, err, body)
	}

	status, body = send(t, publicClient, http.MethodGet, base+"/api/announcements?page=1&size=20", nil)
	if status != http.StatusOK {
		t.Fatalf("public announcements: want 200, got %d (%s)", status, body)
	}
	var page struct {
		Rows []struct {
			ID   string `json:"id"`
			Text string `json:"text"`
		} `json:"rows"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal(body, &page); err != nil || page.Total != 1 || len(page.Rows) != 1 || page.Rows[0].ID != created.ID {
		t.Fatalf("unexpected public page: %+v err=%v (%s)", page, err, body)
	}

	end := time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339)
	status, body = send(t, adminClient, http.MethodPut, base+"/api/admin/announcements/"+created.ID, map[string]any{
		"text": "Maintenance has been rescheduled.", "ends_at": end,
	})
	if status != http.StatusOK {
		t.Fatalf("update announcement: want 200, got %d (%s)", status, body)
	}

	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/announcements/"+created.ID+"/status", map[string]bool{"enabled": false})
	if status != http.StatusOK {
		t.Fatalf("disable announcement: want 200, got %d (%s)", status, body)
	}
	status, body = send(t, publicClient, http.MethodGet, base+"/api/announcements?page=1&size=20", nil)
	if status != http.StatusOK {
		t.Fatalf("public announcements after disable: want 200, got %d (%s)", status, body)
	}
	if err := json.Unmarshal(body, &page); err != nil || page.Total != 0 || len(page.Rows) != 0 {
		t.Fatalf("disabled announcement remained public: %+v err=%v (%s)", page, err, body)
	}

	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/announcements/"+created.ID+"/status", map[string]bool{"enabled": true})
	if status != http.StatusOK {
		t.Fatalf("re-enable announcement: want 200, got %d (%s)", status, body)
	}
}
