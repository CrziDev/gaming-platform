package mail

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/http"
	netmail "net/mail"
	"net/textproto"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	gmailTokenEndpoint = "https://oauth2.googleapis.com/token"
	gmailSendEndpoint  = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
	gmailTokenMargin   = time.Minute
)

var oauthErrorCode = regexp.MustCompile(`^[a-z_]{1,64}$`)

type GmailConfig struct {
	ClientID      string
	ClientSecret  string
	RefreshToken  string
	From          string
	TokenEndpoint string
	SendEndpoint  string
	Client        *http.Client
	MaxAttempts   int
	RetryDelay    time.Duration
	Now           func() time.Time
}

// Gmail sends through the Gmail API as the account that granted RefreshToken the
// gmail.send scope. It exchanges the refresh token for an access token and reuses
// that token until shortly before it expires.
type Gmail struct {
	clientID      string
	clientSecret  string
	refreshToken  string
	from          string
	tokenEndpoint string
	sendEndpoint  string
	client        *http.Client
	maxAttempts   int
	retryDelay    time.Duration
	now           func() time.Time

	mu          sync.Mutex
	accessToken string
	expiresAt   time.Time
}

func NewGmail(cfg GmailConfig) *Gmail {
	g := &Gmail{
		clientID:      cfg.ClientID,
		clientSecret:  cfg.ClientSecret,
		refreshToken:  cfg.RefreshToken,
		from:          cfg.From,
		tokenEndpoint: cfg.TokenEndpoint,
		sendEndpoint:  cfg.SendEndpoint,
		client:        cfg.Client,
		maxAttempts:   cfg.MaxAttempts,
		retryDelay:    cfg.RetryDelay,
		now:           cfg.Now,
	}
	if g.tokenEndpoint == "" {
		g.tokenEndpoint = gmailTokenEndpoint
	}
	if g.sendEndpoint == "" {
		g.sendEndpoint = gmailSendEndpoint
	}
	if g.client == nil {
		g.client = &http.Client{Timeout: requestTimeout}
	}
	if g.maxAttempts <= 0 {
		g.maxAttempts = maximumAttempts
	}
	if g.retryDelay == 0 {
		g.retryDelay = retryDelay
	}
	if g.now == nil {
		g.now = time.Now
	}
	return g
}

func (g *Gmail) Send(ctx context.Context, message Message) error {
	raw, err := g.compose(message)
	if err != nil {
		return err
	}
	body, err := json.Marshal(struct {
		Raw string `json:"raw"`
	}{Raw: base64.URLEncoding.EncodeToString(raw)})
	if err != nil {
		return fmt.Errorf("mail: encode gmail request: %w", err)
	}
	return withRetries(ctx, g.maxAttempts, g.retryDelay, func() (bool, error) {
		return g.send(ctx, body)
	})
}

func (g *Gmail) send(ctx context.Context, body []byte) (bool, error) {
	token, retry, err := g.token(ctx)
	if err != nil {
		return retry, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.sendEndpoint, bytes.NewReader(body))
	if err != nil {
		return false, fmt.Errorf("mail: build gmail request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	response, err := g.client.Do(req)
	if err != nil {
		return true, fmt.Errorf("mail: send through gmail: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<20))

	switch {
	case response.StatusCode >= 200 && response.StatusCode < 300:
		return false, nil
	case response.StatusCode == http.StatusUnauthorized:
		g.forgetToken(token)
		return true, errors.New("mail: gmail rejected the access token")
	default:
		return retryableStatus(response.StatusCode), fmt.Errorf("mail: gmail returned status %d", response.StatusCode)
	}
}

func (g *Gmail) token(ctx context.Context) (string, bool, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.accessToken != "" && g.now().Before(g.expiresAt) {
		return g.accessToken, false, nil
	}

	form := url.Values{
		"client_id":     {g.clientID},
		"client_secret": {g.clientSecret},
		"refresh_token": {g.refreshToken},
		"grant_type":    {"refresh_token"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.tokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", false, fmt.Errorf("mail: build gmail token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	response, err := g.client.Do(req)
	if err != nil {
		return "", true, fmt.Errorf("mail: refresh gmail access token: %w", err)
	}
	defer response.Body.Close()
	var body struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
		Error       string `json:"error"`
	}
	decodeErr := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&body)

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		code := ""
		if oauthErrorCode.MatchString(body.Error) {
			code = " (" + body.Error + ")"
		}
		return "", retryableStatus(response.StatusCode), fmt.Errorf("mail: gmail token endpoint returned status %d%s", response.StatusCode, code)
	}
	if decodeErr != nil || body.AccessToken == "" || body.ExpiresIn <= 0 {
		return "", true, errors.New("mail: gmail token endpoint returned an unusable token")
	}
	g.accessToken = body.AccessToken
	g.expiresAt = g.now().Add(time.Duration(body.ExpiresIn)*time.Second - gmailTokenMargin)
	return g.accessToken, false, nil
}

func (g *Gmail) forgetToken(token string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.accessToken == token {
		g.accessToken = ""
	}
}

func (g *Gmail) compose(message Message) ([]byte, error) {
	from, err := netmail.ParseAddress(g.from)
	if err != nil {
		return nil, fmt.Errorf("mail: parse gmail sender: %w", err)
	}
	if len(message.To) == 0 {
		return nil, errors.New("mail: a message needs at least one recipient")
	}
	to := make([]string, 0, len(message.To))
	for _, recipient := range message.To {
		address, err := netmail.ParseAddress(recipient)
		if err != nil {
			return nil, fmt.Errorf("mail: parse recipient: %w", err)
		}
		to = append(to, address.String())
	}

	var body bytes.Buffer
	parts := multipart.NewWriter(&body)
	for _, part := range []struct{ contentType, content string }{
		{"text/plain; charset=UTF-8", message.Text},
		{"text/html; charset=UTF-8", message.HTML},
	} {
		if part.content == "" {
			continue
		}
		writer, err := parts.CreatePart(textproto.MIMEHeader{
			"Content-Type":              {part.contentType},
			"Content-Transfer-Encoding": {"quoted-printable"},
		})
		if err != nil {
			return nil, fmt.Errorf("mail: create message part: %w", err)
		}
		encoder := quotedprintable.NewWriter(writer)
		if _, err := encoder.Write([]byte(part.content)); err != nil {
			return nil, fmt.Errorf("mail: write message part: %w", err)
		}
		if err := encoder.Close(); err != nil {
			return nil, fmt.Errorf("mail: close message part: %w", err)
		}
	}
	if err := parts.Close(); err != nil {
		return nil, fmt.Errorf("mail: close message: %w", err)
	}

	var raw bytes.Buffer
	header := func(name, value string) { raw.WriteString(name + ": " + value + "\r\n") }
	header("From", from.String())
	header("To", strings.Join(to, ", "))
	header("Subject", mime.QEncoding.Encode("utf-8", message.Subject))
	header("Date", g.now().UTC().Format(time.RFC1123Z))
	header("MIME-Version", "1.0")
	header("Content-Type", mime.FormatMediaType("multipart/alternative", map[string]string{"boundary": parts.Boundary()}))
	raw.WriteString("\r\n")
	raw.Write(body.Bytes())
	return raw.Bytes(), nil
}
