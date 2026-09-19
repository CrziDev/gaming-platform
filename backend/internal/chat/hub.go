package chat

import (
	"fmt"
	"sync"
)

const subscriberBuffer = 16

var messageEvent = []byte(`{"type":"message"}`)

// Hub fans events out to every open socket in this process. A subscriber that
// falls subscriberBuffer events behind loses the ones it missed rather than
// stalling the sender; a message event only tells the client to re-read the
// room, so a dropped one costs nothing once the next arrives.
type Hub struct {
	mu          sync.Mutex
	subscribers map[chan []byte]struct{}
	closed      bool
	done        chan struct{}
	wg          sync.WaitGroup
}

func NewHub() *Hub {
	return &Hub{subscribers: make(map[chan []byte]struct{}), done: make(chan struct{})}
}

// Subscribe registers a socket and announces the new presence count to every
// subscriber, including the new one. After Close it returns a closed channel so
// a late handler exits without blocking.
func (h *Hub) Subscribe() (<-chan []byte, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	events := make(chan []byte, subscriberBuffer)
	if h.closed {
		close(events)
		return events, func() {}
	}
	h.subscribers[events] = struct{}{}
	h.wg.Add(1)
	h.broadcastLocked(presenceEvent(len(h.subscribers)))

	var once sync.Once
	return events, func() {
		once.Do(func() {
			h.mu.Lock()
			defer h.mu.Unlock()
			delete(h.subscribers, events)
			h.wg.Done()
			h.broadcastLocked(presenceEvent(len(h.subscribers)))
		})
	}
}

func (h *Hub) Broadcast(event []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.broadcastLocked(event)
}

func (h *Hub) broadcastLocked(event []byte) {
	for events := range h.subscribers {
		select {
		case events <- event:
		default:
		}
	}
}

func (h *Hub) Online() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subscribers)
}

func (h *Hub) Done() <-chan struct{} {
	return h.done
}

// Close signals every socket handler to finish and waits for them, so a graceful
// shutdown sends each client a going-away close instead of dropping the TCP
// connection.
func (h *Hub) Close() {
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return
	}
	h.closed = true
	close(h.done)
	h.mu.Unlock()
	h.wg.Wait()
}

func presenceEvent(online int) []byte {
	return fmt.Appendf(nil, `{"type":"presence","online":%d}`, online)
}
