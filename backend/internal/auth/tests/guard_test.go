package auth_test

import (
	"net/http"
	"testing"
)

const anyID = "00000000-0000-4000-8000-000000000000"

var playerRoutes = []struct{ method, path string }{
	{http.MethodGet, "/api/me"},
	{http.MethodGet, "/api/payment-methods"},
	{http.MethodGet, "/api/deposits"},
	{http.MethodGet, "/api/deposits/" + anyID},
	{http.MethodPost, "/api/deposits"},
	{http.MethodGet, "/api/wallets"},
	{http.MethodGet, "/api/wallets/PHP"},
	{http.MethodGet, "/api/wallets/PHP/transactions"},
	{http.MethodGet, "/api/transactions"},
	{http.MethodGet, "/api/rounds"},
	{http.MethodGet, "/api/rounds/" + anyID},
}

var adminRoutes = []struct{ method, path string }{
	{http.MethodGet, "/api/admin/users"},
	{http.MethodGet, "/api/admin/users/" + anyID},
	{http.MethodPatch, "/api/admin/users/" + anyID + "/status"},
	{http.MethodGet, "/api/admin/users/" + anyID + "/wallets"},
	{http.MethodPost, "/api/admin/users/" + anyID + "/wallet-adjustments"},
	{http.MethodGet, "/api/admin/transactions"},
	{http.MethodGet, "/api/admin/rounds"},
	{http.MethodGet, "/api/admin/deposits"},
	{http.MethodGet, "/api/admin/deposits/" + anyID + "/proof"},
	{http.MethodPost, "/api/admin/deposits/" + anyID + "/review"},
	{http.MethodGet, "/api/admin/games"},
	{http.MethodPost, "/api/admin/games"},
	{http.MethodGet, "/api/admin/games/" + anyID},
	{http.MethodPatch, "/api/admin/games/" + anyID},
	{http.MethodGet, "/api/admin/games/" + anyID + "/rtp-profiles"},
	{http.MethodPost, "/api/admin/games/" + anyID + "/rtp-profiles"},
	{http.MethodGet, "/api/admin/rtp-profiles"},
	{http.MethodPatch, "/api/admin/rtp-profiles/" + anyID},
	{http.MethodPost, "/api/admin/rtp-profiles/" + anyID + "/activate"},
	{http.MethodGet, "/api/admin/audit-logs"},
	{http.MethodGet, "/api/admin/dashboard?currency=PHP"},
}

func TestEveryGuardedRouteRefusesAnAnonymousRequest(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	for _, route := range append(playerRoutes, adminRoutes...) {
		status, body := send(t, client, route.method, base+route.path, map[string]string{})
		if status != http.StatusUnauthorized {
			t.Errorf("%s %s anonymous: want 401, got %d (%s)", route.method, route.path, status, body)
		}
	}
}

func TestEveryAdminRouteRefusesAPlayer(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	for _, route := range adminRoutes {
		status, body := send(t, client, route.method, base+route.path, map[string]string{})
		if status != http.StatusForbidden {
			t.Errorf("%s %s as a player: want 403, got %d (%s)", route.method, route.path, status, body)
		}
	}
}

func TestEveryAdminRouteAdmitsAnAdministrator(t *testing.T) {
	db := requireDB(t)
	base, _ := newServer(t, db)
	client, _ := registerAdmin(t, db, base, "guard-admin@example.com")

	for _, route := range adminRoutes {
		status, body := send(t, client, route.method, base+route.path, map[string]string{})
		if status == http.StatusUnauthorized || status == http.StatusForbidden {
			t.Errorf("%s %s as an administrator: refused with %d (%s)", route.method, route.path, status, body)
		}
	}
}
