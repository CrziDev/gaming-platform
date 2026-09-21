package app

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestForwardedClientIPIsOptIn(t *testing.T) {
	for name, enabled := range map[string]bool{"disabled": false, "enabled": true} {
		t.Run(name, func(t *testing.T) {
			var remote string
			handler := forwardedClientIP(enabled, http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
				remote = r.RemoteAddr
			}))
			request := httptest.NewRequest(http.MethodGet, "/", nil)
			request.RemoteAddr = "172.18.0.2:4321"
			request.Header.Set("X-Forwarded-For", "203.0.113.10, 172.18.0.1")
			handler.ServeHTTP(httptest.NewRecorder(), request)

			want := "172.18.0.2:4321"
			if enabled {
				want = "203.0.113.10:0"
			}
			if remote != want {
				t.Fatalf("RemoteAddr = %q, want %q", remote, want)
			}
		})
	}
}

func TestForwardedClientIPIgnoresInvalidValues(t *testing.T) {
	var remote string
	handler := forwardedClientIP(true, http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		remote = r.RemoteAddr
	}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "172.18.0.2:4321"
	request.Header.Set("X-Forwarded-For", "not-an-ip")
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if remote != request.RemoteAddr {
		t.Fatalf("RemoteAddr = %q, want original %q", remote, request.RemoteAddr)
	}
}
