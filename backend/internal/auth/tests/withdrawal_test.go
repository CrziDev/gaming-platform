package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/gaming-platform/backend/internal/wallet"
)

type withdrawalBody struct {
	ID              string  `json:"id"`
	AmountMinor     int64   `json:"amount_minor"`
	Currency        string  `json:"currency"`
	AccountName     string  `json:"account_name"`
	AccountNumber   string  `json:"account_number"`
	Status          string  `json:"status"`
	PayoutReference *string `json:"payout_reference"`
	Reason          *string `json:"reason"`
	ReviewedAt      *string `json:"reviewed_at"`
	CancelledAt     *string `json:"cancelled_at"`
}

type errorBody struct {
	Error  string            `json:"error"`
	Code   string            `json:"code"`
	Fields map[string]string `json:"fields"`
}

func sendWithdrawal(t *testing.T, client *http.Client, base, key string, body any) (int, []byte) {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encode withdrawal: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, base+"/api/withdrawals", bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", webOrigin)
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return resp.StatusCode, raw
}

func decodeWithdrawal(t *testing.T, raw []byte) withdrawalBody {
	t.Helper()
	var item withdrawalBody
	if err := json.Unmarshal(raw, &item); err != nil {
		t.Fatalf("decode withdrawal: %v (%s)", err, raw)
	}
	return item
}

func decodeError(t *testing.T, raw []byte) errorBody {
	t.Helper()
	var item errorBody
	if err := json.Unmarshal(raw, &item); err != nil {
		t.Fatalf("decode error: %v (%s)", err, raw)
	}
	return item
}

func phpBalance(t *testing.T, client *http.Client, base string) int64 {
	t.Helper()
	status, raw := send(t, client, http.MethodGet, base+"/api/wallets/PHP", nil)
	var body struct {
		BalanceMinor int64 `json:"balance_minor"`
	}
	if status != http.StatusOK || json.Unmarshal(raw, &body) != nil {
		t.Fatalf("wallet: %d %s", status, raw)
	}
	return body.BalanceMinor
}

func TestWithdrawalHTTPHoldsTheMoneyUntilReviewedOnce(t *testing.T) {
	db := requireDB(t)
	enableTestPaymentMethod(t, db)
	createPlinko(t, db)
	base, playerClient := newServer(t, db)
	if status, body := register(t, playerClient, base); status != http.StatusCreated {
		t.Fatalf("register player: %d %s", status, body)
	}
	var player struct {
		ID string `json:"id"`
	}
	if _, raw := send(t, playerClient, http.MethodGet, base+"/api/me", nil); json.Unmarshal(raw, &player) != nil || player.ID == "" {
		t.Fatalf("me: %s", raw)
	}
	if balance := phpBalance(t, playerClient, base); balance != 0 {
		t.Fatalf("a new wallet holds %d", balance)
	}
	if _, err := wallet.Move(context.Background(), db, player.ID, "PHP", "adjustment", 20_000, "withdrawal-http-credit", "test credit"); err != nil {
		t.Fatalf("fund wallet: %v", err)
	}
	var methods []struct {
		ID string `json:"id"`
	}
	if _, raw := send(t, playerClient, http.MethodGet, base+"/api/payment-methods", nil); json.Unmarshal(raw, &methods) != nil || len(methods) == 0 {
		t.Fatalf("payment methods: %s", raw)
	}
	request := map[string]any{
		"method_id": methods[0].ID, "currency": "PHP", "amount_minor": 19_900,
		"account_name": "Juan Dela Cruz", "account_number": "0917 123 4567",
	}

	status, raw := sendWithdrawal(t, playerClient, base, "", request)
	if status != http.StatusBadRequest || decodeError(t, raw).Fields["idempotency_key"] == "" {
		t.Fatalf("missing key: %d %s", status, raw)
	}
	status, raw = sendWithdrawal(t, playerClient, base, "withdraw-low", map[string]any{
		"method_id": methods[0].ID, "currency": "PHP", "amount_minor": 9_999, "account_name": "Juan", "account_number": "1",
	})
	if status != http.StatusBadRequest || decodeError(t, raw).Fields["amount_minor"] == "" {
		t.Fatalf("below the minimum: %d %s", status, raw)
	}
	status, raw = sendWithdrawal(t, playerClient, base, "withdraw-too-much", map[string]any{
		"method_id": methods[0].ID, "currency": "PHP", "amount_minor": 20_001, "account_name": "Juan", "account_number": "1",
	})
	if status != http.StatusConflict || decodeError(t, raw).Code != "INSUFFICIENT_BALANCE" {
		t.Fatalf("over the balance: %d %s", status, raw)
	}
	status, raw = sendWithdrawal(t, playerClient, base, "withdraw-extra", map[string]any{
		"method_id": methods[0].ID, "currency": "PHP", "amount_minor": 10_000, "account_name": "Juan", "account_number": "1", "user_id": player.ID,
	})
	if status != http.StatusBadRequest {
		t.Fatalf("unknown field: want 400, got %d %s", status, raw)
	}

	status, raw = sendWithdrawal(t, playerClient, base, "withdraw-one", request)
	if status != http.StatusCreated {
		t.Fatalf("create: want 201, got %d %s", status, raw)
	}
	created := decodeWithdrawal(t, raw)
	if created.Status != "pending" || created.AmountMinor != 19_900 || created.AccountNumber != "0917 123 4567" {
		t.Fatalf("created: %+v", created)
	}
	if balance := phpBalance(t, playerClient, base); balance != 100 {
		t.Fatalf("balance after the request: want 100, got %d", balance)
	}
	if code, out := sendPlay(t, playerClient, base, "plinko", "spend-held", `{"stake_minor": 300, "currency": "PHP", "params": {"rows": 8, "risk": "low"}}`); code != http.StatusConflict || out["code"] != "INSUFFICIENT_BALANCE" {
		t.Fatalf("wagering held money: %d %v", code, out)
	}

	status, raw = sendWithdrawal(t, playerClient, base, "withdraw-one", request)
	if status != http.StatusOK || decodeWithdrawal(t, raw).ID != created.ID {
		t.Fatalf("retry: want 200 with the original, got %d %s", status, raw)
	}
	changed := map[string]any{}
	for key, value := range request {
		changed[key] = value
	}
	changed["amount_minor"] = 10_000
	status, raw = sendWithdrawal(t, playerClient, base, "withdraw-one", changed)
	if status != http.StatusBadRequest || decodeError(t, raw).Fields["idempotency_key"] == "" {
		t.Fatalf("reused key: %d %s", status, raw)
	}
	if _, err := wallet.Move(context.Background(), db, player.ID, "PHP", "adjustment", 20_000, "withdrawal-http-credit-two", "test credit"); err != nil {
		t.Fatalf("fund wallet: %v", err)
	}
	status, raw = sendWithdrawal(t, playerClient, base, "withdraw-two", changed)
	if status != http.StatusConflict || decodeError(t, raw).Code != "WITHDRAWAL_PENDING" {
		t.Fatalf("second pending: %d %s", status, raw)
	}

	otherClient := clientWithCookies(t)
	if status, body := send(t, otherClient, http.MethodPost, base+"/api/register", map[string]string{
		"email": "withdrawal-other@example.com", "password": testPassword, "display_name": "Other",
	}); status != http.StatusCreated {
		t.Fatalf("register other: %d %s", status, body)
	}
	if status, raw := send(t, otherClient, http.MethodGet, base+"/api/withdrawals/"+created.ID, nil); status != http.StatusNotFound {
		t.Fatalf("another player's read: want 404, got %d %s", status, raw)
	}
	if status, raw := send(t, otherClient, http.MethodPost, base+"/api/withdrawals/"+created.ID+"/cancel", nil); status != http.StatusNotFound {
		t.Fatalf("another player's cancel: want 404, got %d %s", status, raw)
	}

	adminClient, _ := registerAdmin(t, db, base, "withdrawal-admin@example.com")
	status, raw = send(t, adminClient, http.MethodGet, base+"/api/admin/withdrawals", nil)
	var queue struct {
		Rows []struct {
			ID        string `json:"id"`
			UserEmail string `json:"user_email"`
		} `json:"rows"`
		Total int `json:"total"`
	}
	if status != http.StatusOK || json.Unmarshal(raw, &queue) != nil || queue.Total != 1 || queue.Rows[0].ID != created.ID || queue.Rows[0].UserEmail != testEmail {
		t.Fatalf("admin queue: %d %s", status, raw)
	}
	reviewURL := base + "/api/admin/withdrawals/" + created.ID + "/review"
	if status, raw := send(t, adminClient, http.MethodPost, reviewURL, map[string]string{"action": "approve"}); status != http.StatusBadRequest || decodeError(t, raw).Fields["payout_reference"] == "" {
		t.Fatalf("approve without a payout reference: %d %s", status, raw)
	}
	status, raw = send(t, adminClient, http.MethodPost, reviewURL, map[string]string{"action": "approve", "payout_reference": "GC-778812"})
	if status != http.StatusOK {
		t.Fatalf("approve: %d %s", status, raw)
	}
	approved := decodeWithdrawal(t, raw)
	if approved.Status != "approved" || approved.PayoutReference == nil || *approved.PayoutReference != "GC-778812" || approved.ReviewedAt == nil {
		t.Fatalf("approved: %+v", approved)
	}
	if balance := phpBalance(t, playerClient, base); balance != 20_100 {
		t.Fatalf("balance after approval: want 20100, got %d", balance)
	}
	if status, raw := send(t, adminClient, http.MethodPost, reviewURL, map[string]string{"action": "reject", "reason": "Late"}); status != http.StatusConflict || decodeError(t, raw).Code != "WITHDRAWAL_ALREADY_REVIEWED" {
		t.Fatalf("second review: %d %s", status, raw)
	}
	if status, raw := send(t, playerClient, http.MethodPost, base+"/api/withdrawals/"+created.ID+"/cancel", nil); status != http.StatusConflict || decodeError(t, raw).Code != "WITHDRAWAL_ALREADY_REVIEWED" {
		t.Fatalf("cancel after approval: %d %s", status, raw)
	}

	status, raw = sendWithdrawal(t, playerClient, base, "withdraw-three", changed)
	if status != http.StatusCreated {
		t.Fatalf("create after approval: %d %s", status, raw)
	}
	rejected := decodeWithdrawal(t, raw)
	status, raw = send(t, adminClient, http.MethodPost, base+"/api/admin/withdrawals/"+rejected.ID+"/review", map[string]string{"action": "reject", "reason": "Account name does not match"})
	if status != http.StatusOK || decodeWithdrawal(t, raw).Status != "rejected" {
		t.Fatalf("reject: %d %s", status, raw)
	}
	if balance := phpBalance(t, playerClient, base); balance != 20_100 {
		t.Fatalf("balance after rejection: want 20100, got %d", balance)
	}

	status, raw = sendWithdrawal(t, playerClient, base, "withdraw-four", changed)
	if status != http.StatusCreated {
		t.Fatalf("create after rejection: %d %s", status, raw)
	}
	cancelled := decodeWithdrawal(t, raw)
	status, raw = send(t, playerClient, http.MethodPost, base+"/api/withdrawals/"+cancelled.ID+"/cancel", nil)
	if status != http.StatusOK || decodeWithdrawal(t, raw).CancelledAt == nil {
		t.Fatalf("cancel: %d %s", status, raw)
	}
	if balance := phpBalance(t, playerClient, base); balance != 20_100 {
		t.Fatalf("balance after cancel: want 20100, got %d", balance)
	}

	var page struct {
		Total int `json:"total"`
	}
	if status, raw := send(t, playerClient, http.MethodGet, base+"/api/withdrawals", nil); status != http.StatusOK || json.Unmarshal(raw, &page) != nil || page.Total != 3 {
		t.Fatalf("own list: %d %s", status, raw)
	}
	var kinds []string
	rows, err := db.Query(`SELECT kind FROM notifications WHERE user_id = ($1::text)::uuid ORDER BY kind`, player.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		if err := rows.Scan(&kind); err != nil {
			t.Fatal(err)
		}
		kinds = append(kinds, kind)
	}
	if len(kinds) != 2 || kinds[0] != "withdrawal_approved" || kinds[1] != "withdrawal_rejected" {
		t.Fatalf("notifications: %v", kinds)
	}
	var holds, releases int
	if err := db.QueryRow(`SELECT count(*) FILTER (WHERE kind = 'withdrawal'), count(*) FILTER (WHERE kind = 'refund') FROM wallet_transactions WHERE user_id = ($1::text)::uuid AND reference_type = 'withdrawal'`, player.ID).Scan(&holds, &releases); err != nil {
		t.Fatal(err)
	}
	if holds != 3 || releases != 2 {
		t.Fatalf("ledger: %d holds and %d releases, want 3 and 2", holds, releases)
	}
}
