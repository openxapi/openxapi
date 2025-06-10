import { File, Text } from '@asyncapi/generator-react-sdk';
import { MessageStructs } from '../components/MessageStructs';
import { WebSocketHandlers } from '../components/WebSocketHandlers';

export default function ({ asyncapi, params }) {
  const serverUrl = asyncapi.servers().get(params.server);
  const packageName = params.packageName || 'main';
  const title = asyncapi.info().title().replace(/\s+/g, '');

  return (
    <File name="client.go">
      <Text>package {packageName}</Text>
      <Text newLines={2}>
        {`import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)`}
      </Text>

      <Text newLines={2}>
        {`// Client represents a WebSocket client for ${asyncapi.info().title()}
type Client struct {
	conn     *websocket.Conn
	url      string
	handlers map[string]func([]byte) error
	mu       sync.RWMutex
	done     chan struct{}
}`}
      </Text>

      <Text newLines={2}>
        {`// NewClient creates a new WebSocket client
func NewClient() *Client {
	baseURL := "${serverUrl.protocol()}://${serverUrl.host()}"
	return &Client{
		url:      baseURL,
		handlers: make(map[string]func([]byte) error),
		done:     make(chan struct{}),
	}
}`}
      </Text>

      <Text newLines={2}>
        {`// Connect establishes a WebSocket connection
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
}`}
      </Text>

      <Text newLines={2}>
        {`// Disconnect closes the WebSocket connection
func (c *Client) Disconnect() error {
	close(c.done)
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// subscribe registers a handler for a specific path
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
}`}
      </Text>

      <Text newLines={2}>
        {`// readMessages reads messages from the main WebSocket connection
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
}`}
      </Text>

      <Text newLines={2}>
        {`// readMessagesFromConn reads messages from a specific connection
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
}`}
      </Text>

      <Text newLines={2}>
        {`// handleMessage routes messages to the appropriate handler
func (c *Client) handleMessage(path string, data []byte) {
	c.mu.RLock()
	handler, exists := c.handlers[path]
	c.mu.RUnlock()

	if exists && handler != nil {
		if err := handler(data); err != nil {
			log.Printf("Error handling message for path %s: %v", path, err)
		}
	}
}`}
      </Text>

      <Text newLines={2}>
        <WebSocketHandlers asyncapi={asyncapi} />
      </Text>

      <Text newLines={2}>
        <MessageStructs asyncapi={asyncapi} />
      </Text>

      <Text newLines={2}>
        {`// ParseMessage parses a JSON message into the specified struct
func ParseMessage[T any](data []byte, target *T) error {
	return json.Unmarshal(data, target)
}`}
      </Text>
    </File>
  );
} 