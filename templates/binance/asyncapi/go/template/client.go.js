import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const root = asyncapi.json ? asyncapi.json() : {};

  // Discover wrapper messages and keys from spec extensions
  const wrappers = [];
  try {
    if (root && root.components && root.components.messages) {
      Object.entries(root.components.messages).forEach(([key, msg]) => {
        try {
          const w = msg && msg['x-wrapper'];
          if (w === true || w === 'combined' || (w && typeof w === 'object' && (w.type === 'combined' || w.type === true))) {
            const wk = (msg && msg['x-wrapper-keys']) || {};
            const streamKey = (wk && wk.stream) ? String(wk.stream) : 'stream';
            const dataKey = (wk && wk.data) ? String(wk.data) : 'data';
            const aliasKey = (msg && typeof msg['x-handler-key'] === 'string') ? String(msg['x-handler-key']) : 'wrap:combined';
            wrappers.push({ streamKey, dataKey, aliasKey });
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

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
  "sync"
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
  readLoopStarted bool
  // registry of handlers per channel name
  handlersMu    sync.RWMutex
  handlers      map[string]map[string]func(context.Context, []byte) error
}

// NewClient creates a new client (no direct connection management)
func NewClient() *Client { return &Client{ serverManager: NewServerManager(), handlers: make(map[string]map[string]func(context.Context, []byte) error) } }

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
 
// RegisterHandlers registers channel-specific message handlers to the client dispatcher.
// Note: This replaces any previously registered handler map for the given channel key.
func (c *Client) RegisterHandlers(channel string, m map[string]func(context.Context, []byte) error) {
  c.handlersMu.Lock()
  defer c.handlersMu.Unlock()
  if c.handlers == nil { c.handlers = make(map[string]map[string]func(context.Context, []byte) error) }
  c.handlers[channel] = m
}

// ensureReadLoop starts the shared read loop once
func (c *Client) ensureReadLoop(ctx context.Context) {
  c.connMu.Lock()
  defer c.connMu.Unlock()
  running := c.isConnected && c.conn != nil
  if !running { return }
  if c.readLoopStarted {
    return
  }
  if c.done == nil {
    c.done = make(chan struct{})
  }
  c.readLoopStarted = true
  go c.readLoop(ctx)
}

// Wait blocks until the read loop terminates or the context is cancelled.
// If the read loop hasn't started, it returns immediately.
func (c *Client) Wait(ctx context.Context) error {
  c.connMu.RLock()
  d := c.done
  c.connMu.RUnlock()
  if d == nil {
    return nil
  }
  select {
  case <-d:
    return nil
  case <-ctx.Done():
    return ctx.Err()
  }
}

// readLoop reads from the shared connection and dispatches to registered handlers
func (c *Client) readLoop(ctx context.Context) {
  defer func() {
    c.connMu.Lock()
    c.readLoopStarted = false
    if c.done != nil {
      close(c.done)
      c.done = nil
    }
    c.connMu.Unlock()
  }()
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
  // Try structured dispatch first
  dispatched := false
  var envelope map[string]json.RawMessage
  if err := json.Unmarshal(data, &envelope); err == nil {
    // Combined wrapper handlers first (spec-driven)
    // Support multiple wrapper shapes if declared in spec
    payload := data
${(() => {
  if (!wrappers.length) {
    // keep a small fallback for backward-compat (stream/data)
    return `    if _, hasStream := envelope["stream"]; hasStream {
      c.handlersMu.RLock()
      for _, hm := range c.handlers {
        if h, ok := hm["wrap:combined"]; ok {
          if err := h(ctx, data); err == nil { dispatched = true }
        }
      }
      c.handlersMu.RUnlock()
      if raw, ok := envelope["data"]; ok && len(raw) > 0 { payload = raw }
    }`;
  }
  // Generate explicit checks per wrapper discovered
  return wrappers.map((w, idx) => {
    const esk = String(w.streamKey).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const edk = String(w.dataKey).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const alias = String(w.aliasKey).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `    if _, ok := envelope["${esk}"]; ok {
      c.handlersMu.RLock()
      for _, hm := range c.handlers {
        if h, ok := hm["${alias}"]; ok {
          if err := h(ctx, data); err == nil { dispatched = true }
        }
      }
      c.handlersMu.RUnlock()
      if raw, ok := envelope["${edk}"]; ok && len(raw) > 0 { payload = raw }
    }`;
  }).join("\n");
})()}
    // Event-type dispatch with array/object shape detection
    // 1) Try object payload
    var typ map[string]interface{}
    if err := json.Unmarshal(payload, &typ); err == nil {
      if ev, ok := typ["e"].(string); ok && ev != "" {
        key := "evt:" + ev
        c.handlersMu.RLock()
        for _, hm := range c.handlers {
          if h, ok := hm[key]; ok {
            if err := h(ctx, payload); err == nil { dispatched = true }
          }
        }
        c.handlersMu.RUnlock()
      }
    } else {
      // 2) Try array payload; inspect first element for event type
      var arr []json.RawMessage
      if err2 := json.Unmarshal(payload, &arr); err2 == nil && len(arr) > 0 {
        var first map[string]interface{}
        if err3 := json.Unmarshal(arr[0], &first); err3 == nil {
          if ev, ok := first["e"].(string); ok && ev != "" {
            key := "evt:" + ev + ":array"
            c.handlersMu.RLock()
            for _, hm := range c.handlers {
              if h, ok := hm[key]; ok {
                if err := h(ctx, payload); err == nil { dispatched = true }
              }
            }
            c.handlersMu.RUnlock()
          }
        }
      }
    }
  }

  // Fallback: fan-out to all handlers; their pre-checks will filter
  if !dispatched {
    c.handlersMu.RLock()
    for _, hm := range c.handlers {
      for _, h := range hm {
        if err := h(ctx, data); err == nil { dispatched = true }
      }
    }
    c.handlersMu.RUnlock()
  }

    if !dispatched { log.Printf("unhandled message: %s", string(data)) }
  }
}
`}
      </Text>
    </File>
  );
}
