package auth_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/auth"
)

func TestHashAndVerifyPassword(t *testing.T) {
	encoded, err := auth.HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}

	tests := map[string]struct {
		password string
		want     bool
	}{
		"the right password":  {"correct horse battery staple", true},
		"one character off":   {"correct horse battery stapler", false},
		"empty":               {"", false},
		"a case change alone": {"Correct horse battery staple", false},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			matches, err := auth.VerifyPassword(encoded, test.password)
			if err != nil {
				t.Fatalf("verify: %v", err)
			}
			if matches != test.want {
				t.Fatalf("verify %q: want %v, got %v", test.password, test.want, matches)
			}
		})
	}
}

func TestHashPasswordUsesAFreshSaltEveryTime(t *testing.T) {
	first, err := auth.HashPassword("same password")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	second, err := auth.HashPassword("same password")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}

	if first == second {
		t.Fatal("two hashes of one password are identical: the salt is not random")
	}
}

func TestHashPasswordIsPHCEncodedArgon2id(t *testing.T) {
	encoded, err := auth.HashPassword("whatever")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}

	if !strings.HasPrefix(encoded, "$argon2id$v=19$") {
		t.Fatalf("want a PHC-encoded argon2id hash, got %q", encoded)
	}
	if !strings.Contains(encoded, "m=65536,t=3,p=2") {
		t.Fatalf("the hash does not record the cost it was derived at: %q", encoded)
	}
}

func TestVerifyPasswordReportsAMalformedHash(t *testing.T) {
	tests := map[string]string{
		"empty":           "",
		"not phc":         "plaintext",
		"wrong algorithm": "$argon2i$v=19$m=65536,t=3,p=2$c2FsdHNhbHQ$a2V5",
		"truncated":       "$argon2id$v=19$m=65536,t=3,p=2$c2FsdHNhbHQ",
		"bad base64":      "$argon2id$v=19$m=65536,t=3,p=2$!!!!$!!!!",
	}

	for name, encoded := range tests {
		t.Run(name, func(t *testing.T) {
			matches, err := auth.VerifyPassword(encoded, "anything")
			if !errors.Is(err, auth.ErrHashMalformed) {
				t.Fatalf("want ErrHashMalformed, got %v", err)
			}
			if matches {
				t.Fatal("a malformed hash reported a match")
			}
		})
	}
}

func TestValidateRegistration(t *testing.T) {
	handler := newHandler(nil)

	tests := map[string]struct {
		email       string
		password    string
		displayName string
		wantFields  []string
	}{
		"missing email":       {"", "a-long-enough-password", "Ann", []string{"email"}},
		"malformed email":     {"not-an-email", "a-long-enough-password", "Ann", []string{"email"}},
		"display form email":  {"Ann <ann@example.com>", "a-long-enough-password", "Ann", []string{"email"}},
		"short password":      {"ann@example.com", "short", "Ann", []string{"password"}},
		"missing name":        {"ann@example.com", "a-long-enough-password", "", []string{"display_name"}},
		"everything rejected": {"", "", "", []string{"email", "password", "display_name"}},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			body, err := json.Marshal(map[string]string{
				"email": test.email, "password": test.password, "display_name": test.displayName,
			})
			if err != nil {
				t.Fatalf("encode body: %v", err)
			}

			request := httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewReader(body))
			response := httptest.NewRecorder()
			handler.Register(response, request)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("want 400, got %d (%s)", response.Code, response.Body.Bytes())
			}

			var problem struct {
				Fields map[string]string `json:"fields"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &problem); err != nil {
				t.Fatalf("decode: %v (%s)", err, response.Body.Bytes())
			}

			if len(problem.Fields) != len(test.wantFields) {
				t.Fatalf("want %d rejected fields %v, got %d %v",
					len(test.wantFields), test.wantFields, len(problem.Fields), problem.Fields)
			}
			for _, field := range test.wantFields {
				if _, rejected := problem.Fields[field]; !rejected {
					t.Errorf("%q was not rejected: %v", field, problem.Fields)
				}
			}
		})
	}
}
