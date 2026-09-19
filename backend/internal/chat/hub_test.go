package chat

import (
	"testing"
	"time"
)

func receive(t *testing.T, events <-chan []byte) string {
	t.Helper()
	select {
	case event := <-events:
		return string(event)
	case <-time.After(time.Second):
		t.Fatal("no event arrived")
		return ""
	}
}

func TestHubAnnouncesPresenceOnSubscribeAndUnsubscribe(t *testing.T) {
	hub := NewHub()
	first, leaveFirst := hub.Subscribe()
	if got := receive(t, first); got != `{"type":"presence","online":1}` {
		t.Fatalf("first presence = %s", got)
	}
	second, leaveSecond := hub.Subscribe()
	if got := receive(t, first); got != `{"type":"presence","online":2}` {
		t.Fatalf("first sees second join: %s", got)
	}
	if got := receive(t, second); got != `{"type":"presence","online":2}` {
		t.Fatalf("second sees its own join: %s", got)
	}
	if hub.Online() != 2 {
		t.Fatalf("online = %d, want 2", hub.Online())
	}

	leaveSecond()
	leaveSecond()
	if got := receive(t, first); got != `{"type":"presence","online":1}` {
		t.Fatalf("first sees second leave once: %s", got)
	}
	if hub.Online() != 1 {
		t.Fatalf("online after a double leave = %d, want 1", hub.Online())
	}
	leaveFirst()
	if hub.Online() != 0 {
		t.Fatalf("online after everyone left = %d", hub.Online())
	}
}

func TestHubBroadcastReachesEverySubscriberAndDropsWhenFull(t *testing.T) {
	hub := NewHub()
	first, leaveFirst := hub.Subscribe()
	defer leaveFirst()
	second, leaveSecond := hub.Subscribe()
	defer leaveSecond()
	for range 2 {
		receive(t, first)
	}
	receive(t, second)

	hub.Broadcast(messageEvent)
	if got := receive(t, first); got != string(messageEvent) {
		t.Fatalf("first got %s", got)
	}
	if got := receive(t, second); got != string(messageEvent) {
		t.Fatalf("second got %s", got)
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		for range subscriberBuffer * 3 {
			hub.Broadcast(messageEvent)
		}
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("a full subscriber stalled the broadcaster")
	}
	if len(first) != subscriberBuffer {
		t.Fatalf("buffered %d events, want the cap of %d", len(first), subscriberBuffer)
	}
}

func TestHubCloseReleasesHandlersAndRefusesLateSubscribers(t *testing.T) {
	hub := NewHub()
	events, leave := hub.Subscribe()
	receive(t, events)

	handlerDone := make(chan struct{})
	go func() {
		defer close(handlerDone)
		<-hub.Done()
		leave()
	}()

	closed := make(chan struct{})
	go func() {
		defer close(closed)
		hub.Close()
	}()
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("Close did not return once the handler left")
	}
	<-handlerDone

	late, leaveLate := hub.Subscribe()
	if _, open := <-late; open {
		t.Fatal("a subscriber after Close received an open channel")
	}
	leaveLate()
	hub.Close()
}
