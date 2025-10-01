import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';

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
        {`// Client carries shared server manager and optional auth for per-channel connections
type Client struct {
  serverManager *ServerManager
  auth          *Auth
  conn          *websocket.Conn
  connMu        sync.RWMutex
  isConnected   bool
  done          chan struct{}
  // registry of handlers per channel name
  handlersMu    sync.RWMutex
  handlers      map[string]map[string]func(context.Context, []byte) error
}

// NewClient creates a new client (no direct connection management)
func NewClient() *Client { return &Client{ serverManager: NewServerManager(), handlers: make(map[string]map[string]func(context.Context, []byte) error), done: make(chan struct{}) } }

// NewClientWithAuth creates a new client with authentication
func NewClientWithAuth(auth *Auth) *Client { c := NewClient(); c.auth = auth; return c }

// SetAuth sets authentication for the client
func (c *Client) SetAuth(auth *Auth) { c.auth = auth }

// Server Management wrappers
func (c *Client) AddServer(name, serverURL, title, description string) error {
  parsed, err := url.Parse(serverURL); if err != nil { return fmt.Errorf("invalid URL format: %w", err) }
  s := &ServerInfo{ Name: name, URL: serverURL, Host: parsed.Host, Pathname: parsed.Path, Protocol: parsed.Scheme, Title: title, Summary: fmt.Sprintf("WebSocket API Server (%s)", name), Description: description, Active: false }
  return c.serverManager.AddServer(name, s)
}

func (c *Client) AddOrUpdateServer(name, serverURL, title, description string) error {
  parsed, err := url.Parse(serverURL); if err != nil { return fmt.Errorf("invalid URL format: %w", err) }
  s := &ServerInfo{ Name: name, URL: serverURL, Host: parsed.Host, Pathname: parsed.Path, Protocol: parsed.Scheme, Title: title, Summary: fmt.Sprintf("WebSocket API Server (%s)", name), Description: description, Active: false }
  return c.serverManager.AddOrUpdateServer(name, s)
}

func (c *Client) RemoveServer(name string) error { return c.serverManager.RemoveServer(name) }

func (c *Client) UpdateServer(name, serverURL, title, description string) error {
  parsed, err := url.Parse(serverURL); if err != nil { return fmt.Errorf("invalid URL format: %w", err) }
  s := &ServerInfo{ Name: name, URL: serverURL, Host: parsed.Host, Pathname: parsed.Path, Protocol: parsed.Scheme, Title: title, Summary: fmt.Sprintf("WebSocket API Server (%s)", name), Description: description, Active: false }
  return c.serverManager.UpdateServer(name, s)
}

func (c *Client) SetActiveServer(name string) error { return c.serverManager.SetActiveServer(name) }
func (c *Client) GetActiveServer() *ServerInfo { return c.serverManager.GetActiveServer() }
func (c *Client) GetServer(name string) *ServerInfo { return c.serverManager.GetServer(name) }
func (c *Client) ListServers() map[string]*ServerInfo { return c.serverManager.ListServers() }
func (c *Client) GetCurrentURL() string { return c.serverManager.GetActiveServerURL() }

// Deprecated: use GetCurrentURL
func (c *Client) GetURL() string { return c.GetCurrentURL() }
 
// RegisterHandlers registers channel-specific message handlers to the client dispatcher
func (c *Client) RegisterHandlers(channel string, m map[string]func(context.Context, []byte) error) {
  c.handlersMu.Lock()
  defer c.handlersMu.Unlock()
  if c.handlers == nil { c.handlers = make(map[string]map[string]func(context.Context, []byte) error) }
  c.handlers[channel] = m
}

// ensureReadLoop starts the shared read loop once
func (c *Client) ensureReadLoop(ctx context.Context) {
  c.connMu.RLock()
  running := c.isConnected && c.conn != nil
  c.connMu.RUnlock()
  if !running { return }
  // simple idempotence: if done channel is closed, recreate
  select { case <-c.done: c.done = make(chan struct{}); default: }
  go c.readLoop(ctx)
}

// readLoop reads from the shared connection and dispatches to registered handlers
func (c *Client) readLoop(ctx context.Context) {
  defer func() { close(c.done) }()
  for {
    c.connMu.RLock()
    conn := c.conn
    c.connMu.RUnlock()
    if conn == nil { return }
    _, data, err := conn.ReadMessage()
    if err != nil { 
      c.connMu.Lock()
      c.isConnected = false
      c.connMu.Unlock()
      return 
    }

    // Combined wrapper detection
    var generic map[string]interface{}
    _ = json.Unmarshal(data, &generic)

    dispatched := false
    if _, hasStream := generic["stream"]; hasStream {
      // Prefer combined wrapper handler if any channel registered it
      c.handlersMu.RLock()
      for _, hm := range c.handlers {
        if h, ok := hm["combinedMarketStreamsEvent"]; ok { _ = h(ctx, data); dispatched = true; break }
      }
      c.handlersMu.RUnlock()
      if dispatched { continue }
    }

    // Try each registered handler until one succeeds
    c.handlersMu.RLock()
    outer:
    for _, hm := range c.handlers {
      for name, h := range hm {
        if err := h(ctx, data); err == nil { _ = name; dispatched = true; break outer }
      }
    }
    c.handlersMu.RUnlock()

    if !dispatched { log.Printf("unhandled message: %s", string(data)) }
  }
}
`}
      </Text>
    </File>
  );
}
