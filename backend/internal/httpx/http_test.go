package httpx_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gaming-platform/backend/internal/httpx"
)

func TestReadJSONRejectsTrailingDocuments(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/resource",
		bytes.NewBufferString(`{"name":"first"} {"name":"second"}`))
	response := httptest.NewRecorder()
	var body struct {
		Name string `json:"name"`
	}

	if httpx.ReadJSON(response, request, &body) {
		t.Fatal("two JSON documents were accepted")
	}
	if response.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", response.Code)
	}
}

func TestWriteCodedErrorOmitsNoContractFields(t *testing.T) {
	response := httptest.NewRecorder()
	httpx.WriteCodedError(response, http.StatusConflict, "The wallet is frozen", "WALLET_FROZEN")

	want := `{"error":"The wallet is frozen","code":"WALLET_FROZEN"}`
	if response.Code != http.StatusConflict || response.Body.String() != want {
		t.Fatalf("unexpected response: %d %s", response.Code, response.Body.String())
	}
}
