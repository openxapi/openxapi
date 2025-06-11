package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Client represents a WebSocket client for Binance Spot WebSocket API
type Client struct {
	conn     *websocket.Conn
	url      string
	handlers map[string]func([]byte) error
	mu       sync.RWMutex
	done     chan struct{}
}

// NewClient creates a new WebSocket client
func NewClient() *Client {
	baseURL := "wss://stream.binance.com:9443"
	return &Client{
		url:      baseURL,
		handlers: make(map[string]func([]byte) error),
		done:     make(chan struct{}),
	}
}

// Connect establishes a WebSocket connection
func (c *Client) Connect(ctx context.Context) error {
	u, err := url.Parse(c.url)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	c.conn = conn
	go c.readMessages()
	return nil
}

// Disconnect closes the WebSocket connection
func (c *Client) Disconnect() error {
	close(c.done)
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// subscribe registers a handler for a specific path
func (c *Client) subscribe(path string, handler func([]byte) error) error {
	c.mu.Lock()
	c.handlers[path] = handler
	c.mu.Unlock()

	// For single stream, we need to connect to the specific path
	if path != "/stream" {
		u, err := url.Parse(c.url + path)
		if err != nil {
			return fmt.Errorf("invalid path URL: %w", err)
		}

		conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
		if err != nil {
			return fmt.Errorf("failed to connect to path %s: %w", path, err)
		}

		go c.readMessagesFromConn(conn, path)
	}

	return nil
}

// readMessages reads messages from the main WebSocket connection
func (c *Client) readMessages() {
	defer c.conn.Close()

	for {
		select {
		case <-c.done:
			return
		default:
			_, message, err := c.conn.ReadMessage()
			if err != nil {
				log.Printf("Error reading message: %v", err)
				return
			}

			c.handleMessage("/stream", message)
		}
	}
}

// readMessagesFromConn reads messages from a specific connection
func (c *Client) readMessagesFromConn(conn *websocket.Conn, path string) {
	defer conn.Close()

	for {
		select {
		case <-c.done:
			return
		default:
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("Error reading message from %s: %v", path, err)
				return
			}

			c.handleMessage(path, message)
		}
	}
}

// handleMessage routes messages to the appropriate handler
func (c *Client) handleMessage(path string, data []byte) {
	c.mu.RLock()
	handler, exists := c.handlers[path]
	c.mu.RUnlock()

	if exists && handler != nil {
		if err := handler(data); err != nil {
			log.Printf("Error handling message for path %s: %v", path, err)
		}
	}
}

// HandleSubscribeSingleStream handles messages for the subscribeSingleStream operation
func (c *Client) HandleSubscribeSingleStream(handler func(data []byte) error) error {
	path := "/ws/{streamName}"
	return c.subscribe(path, handler)
}

// HandleSubscribeCombinedStream handles messages for the subscribeCombinedStream operation
func (c *Client) HandleSubscribeCombinedStream(handler func(data []byte) error) error {
	path := "/stream"
	return c.subscribe(path, handler)
}

// AggregateTrade represents the aggregateTrade message payload
type AggregateTrade struct {
	// Event type
	E string `json:"e"`
	// Event time
	EE int64 `json:"E"`
	// Symbol
	S string `json:"s"`
	// Aggregate trade ID
	A int64 `json:"a"`
	// Price
	P string `json:"p"`
	// Quantity
	Q string `json:"q"`
	// First trade ID
	F int64 `json:"f"`
	// Last trade ID
	L int64 `json:"l"`
	// Trade time
	T int64 `json:"T"`
	// Is the buyer the market maker?
	M bool `json:"m"`
}

// Trade represents the trade message payload
type Trade struct {
	// Event type
	E string `json:"e"`
	// Event time
	EE int64 `json:"E"`
	// Symbol
	S string `json:"s"`
	// Trade ID
	T int64 `json:"t"`
	// Price
	P string `json:"p"`
	// Quantity
	Q string `json:"q"`
	// Trade time
	TT int64 `json:"T"`
	// Is the buyer the market maker?
	M bool `json:"m"`
}

// Kline represents the kline message payload
type Kline struct {
	// Event type
	E string `json:"e"`
	// Event time
	EE int64 `json:"E"`
	// Symbol
	S string `json:"s"`
	// Kline data
	K interface{} `json:"k"`
}

// CombinedMessage represents the combinedMessage message payload
type CombinedMessage struct {
	// Stream name
	Stream string `json:"stream"`
	// Original payload data
	Data interface{} `json:"data"`
}

// ParseMessage parses a JSON message into the specified struct
func ParseMessage[T any](data []byte, target *T) error {
	return json.Unmarshal(data, target)
}
