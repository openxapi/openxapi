import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const root = asyncapi.json ? asyncapi.json() : {};
  
  // Extract servers from spec for codegen
  const serversList = [];
  try {
    const srv = root && root.servers;
    if (srv && typeof srv === 'object') {
      Object.entries(srv).forEach(([name, conf]) => {
        if (!conf || typeof conf !== 'object') return;
        const protocol = String(conf.protocol || conf.scheme || '').trim();
        const host = String(conf.host || conf.url || '').trim();
        const pathname = String(conf.pathname || conf.basePath || '').trim();
        const title = String(conf.title || '').trim();
        const summary = String(conf.summary || '').trim();
        const description = String(conf.description || '').trim();
        let url = '';
        if (host && protocol) {
          // If host already contains protocol, avoid doubling
          if (/^wss?:\/\//i.test(host)) {
            url = host + (pathname || '');
          } else {
            url = `${protocol}://${host}${pathname || ''}`;
          }
        } else if (host) {
          url = host + (pathname || '');
        }
        if (!url) return;
        serversList.push({ name, url, title, summary, description });
      });
    }
  } catch (e) { /* ignore server extraction errors */ }

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

  // Discover error message handling from spec extensions
  let hasErrorModel = false;
  let errorAlias = 'error';
  try {
    const msgs = root && root.components && root.components.messages;
    if (msgs && typeof msgs === 'object') {
      for (const [k, m] of Object.entries(msgs)) {
        if (!m || typeof m !== 'object') continue;
        const isErr = (m['x-error'] === true) || (m.payload && m.payload.properties && Object.prototype.hasOwnProperty.call(m.payload.properties, 'error'));
        if (isErr) {
          hasErrorModel = true;
          if (typeof m['x-handler-key'] === 'string' && m['x-handler-key'].trim()) {
            errorAlias = String(m['x-handler-key']).trim();
          }
          break;
        }
      }
    }
  } catch (e) {}

  return (
    <File name="client.go">
      <Text>package {packageName}</Text>

      <Text newLines={2}>
        {`import (
  "bytes"
  "context"
  "encoding/json"
  "fmt"
  "log"
  "net/url"
  "runtime"
  "strings"
  "sync"
  "github.com/gorilla/websocket"
)`}
      </Text>

      {/* Wrapper alias keys map used to avoid treating wrapper-only handling as dispatched */}
      <Text newLines={2}>
        {(() => {
          const aliases = new Set(["wrap:combined"]);
          try {
            wrappers.forEach(w => { if (w && w.aliasKey) aliases.add(String(w.aliasKey)); });
          } catch (e) {}
          const entries = Array.from(aliases).map(a => '  "' + String(a).replace(/\\/g, '\\').replace(/"/g, '\"') + '": {},').join('\n');
          return '// Wrapper alias keys discovered from spec\n' +
            'var wrapperAliases = map[string]struct{}{' + '\n' +
            entries + '\n' +
            '}';

        })()}
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
  // pendingByID holds one-shot RPC response handlers keyed by id
  pendingByID  sync.Map // key: string (id), val: func(context.Context, []byte) error

  // async dispatch pipeline to ensure slow handlers never block ReadMessage
  mb          *mailbox
  workerWG    sync.WaitGroup
  // configuration for dispatch pipeline
  workerCount int
}

// NewClient creates a new client (no direct connection management)
func NewClient() *Client { return NewClientWithOptions(nil) }

// ClientOptions configures the dispatch pipeline behavior
type ClientOptions struct {
  // HandlerWorkers controls the number of concurrent handler workers
  HandlerWorkers int
}

// NewClientWithOptions creates a new client with configurable dispatch options
func NewClientWithOptions(opts *ClientOptions) *Client {
  c := &Client{ serverManager: NewServerManager(), handlers: make(map[string]map[string]func(context.Context, []byte) error) }
  // apply defaults
  wc := runtime.NumCPU()
  if wc < 1 { wc = 1 }
  if opts != nil {
    if opts.HandlerWorkers > 0 { wc = opts.HandlerWorkers }
  }
  c.workerCount = wc
  // Preload servers from AsyncAPI spec (first becomes active by default)
${(() => {
  if (!serversList.length) return '';
  function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
  return serversList.map(s => `  _ = c.AddServer("${esc(s.name)}", "${esc(s.url)}", "${esc(s.title)}", "${esc(s.description || s.summary)}")`).join("\n");
})()}
  return c
}

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
  // Expand event-type alias keys when templates provided a comma-separated list (x-event-type array)
  // e.g. evt:1hTicker,4hTicker,1dTicker[:array] -> duplicate handlers for each value
  expanded := make(map[string]func(context.Context, []byte) error, len(m))
  for k, h := range m {
    if strings.HasPrefix(k, "evt:") {
      body := strings.TrimPrefix(k, "evt:")
      suffix := ""
      if strings.HasSuffix(body, ":array") {
        body = strings.TrimSuffix(body, ":array")
        suffix = ":array"
      }
      kb := strings.TrimSpace(body)
      // strip optional bracket notation if present
      if strings.HasPrefix(kb, "[") && strings.HasSuffix(kb, "]") {
        kb = strings.TrimPrefix(kb, "[")
        kb = strings.TrimSuffix(kb, "]")
      }
      createdAny := false
      parts := strings.Split(kb, ",")
      for _, p := range parts {
        v := strings.TrimSpace(p)
        if strings.HasPrefix(v, \`"\`) { v = strings.TrimPrefix(v, \`"\`) }
        if strings.HasSuffix(v, \`"\`) { v = strings.TrimSuffix(v, \`"\`) }
        if v == "" { continue }
        expanded["evt:"+v+suffix] = h
        createdAny = true
      }
      if !createdAny {
        expanded[k] = h
      }
    } else {
      expanded[k] = h
    }
  }
  c.handlers[channel] = expanded
}

// StopReadLoop closes the underlying websocket connection and flips connection flags.
// The read loop will observe the close and exit, and Wait(ctx) can be used to synchronize.
func (c *Client) StopReadLoop() {
  c.connMu.Lock()
  conn := c.conn
  c.conn = nil
  c.isConnected = false
  c.connMu.Unlock()
  if conn != nil { _ = conn.Close() }
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
  // initialize dispatch pipeline (workers + unbounded mailbox)
  if c.mb == nil {
    c.mb = newMailbox()
    wnum := c.workerCount
    if wnum <= 0 { wnum = 1 }
    for i := 0; i < wnum; i++ {
      mb := c.mb
      c.workerWG.Add(1)
      go func(mb *mailbox) {
        defer c.workerWG.Done()
        for {
          msg, ok := mb.Dequeue()
          if !ok { return }
          c.dispatchMessage(ctx, msg)
        }
      }(mb)
    }
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
    // close mailbox and wait for all workers to drain before signalling completion
    mb := c.mb
    if mb != nil { mb.Close() }
    c.workerWG.Wait()
    c.mb = nil

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
    // Enqueue into unbounded mailbox; never drops
    if c.mb != nil { c.mb.Enqueue(data) }
  }
}

// No-event-type classification (generated from AsyncAPI x-no-event-type)
// These helpers allow routing events that do not include an 'e' field in payload.
type noEvtCandidate struct {
  Key        string
  Required   []string
  Properties []string
  IsArray    bool
}

// Generated from spec: x-no-event-type messages
var noEvtCandidates = []noEvtCandidate{
${(() => {
  const out = [];
  try {
    const root = asyncapi.json ? asyncapi.json() : {};
    const msgs = root && root.components && root.components.messages ? root.components.messages : {};
    const schemas = root && root.components && root.components.schemas ? root.components.schemas : {};
    const resolveRef = (ref) => {
      if (!ref || typeof ref !== 'string' || !ref.startsWith('#/')) return null;
      const parts = ref.slice(2).split('/');
      let cur = root; for (const p of parts) { if (!cur) return null; cur = cur[p]; }
      return cur || null;
    };
    Object.entries(msgs).forEach(([msgKey, msg]) => {
      try {
        if (!msg || typeof msg !== 'object') return;
        const noEvt = msg['x-no-event-type'] === true || msg['x-no-event-type'] === 'true';
        if (!noEvt) return;
        // Prefer the component raw key to match handler registration keys
        const key = String(msgKey);
        let payload = msg.payload || {};
        if (payload && payload.$ref) payload = resolveRef(payload.$ref) || payload;
        let isArray = false;
        let schema = payload;
        if (payload && payload.type === 'array') {
          isArray = true;
          const it = payload.items || {};
          schema = it.$ref ? resolveRef(it.$ref) || it : it;
        }
        const props = (schema && schema.properties) ? schema.properties : {};
        const required = Array.isArray(schema && schema.required) ? schema.required.slice() : [];
        const allProps = Object.keys(props || {});
        const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        out.push(`  { Key: "${esc(key)}", Required: []string{${required.map(r => `"${esc(r)}"`).join(', ')}}, Properties: []string{${allProps.map(p => `"${esc(p)}"`).join(', ')}}, IsArray: ${isArray ? 'true' : 'false'} },`);
      } catch (e) { /* ignore message */ }
    });
  } catch (e) { /* ignore */ }
  return out.join('\n');
})()}
}

func hasAllFields(obj map[string]json.RawMessage, required []string) bool {
  if len(required) == 0 { return true }
  for _, k := range required {
    if _, ok := obj[k]; !ok { return false }
  }
  return true
}

func scoreFields(obj map[string]json.RawMessage, candidates []string) int {
  score := 0
  for _, k := range candidates {
    if _, ok := obj[k]; ok { score++ }
  }
  return score
}

// classifyNoEventTypePayload returns a handler key for x-no-event-type messages, or empty string if none matched
func classifyNoEventTypePayload(b []byte) string {
  // Try object payload
  var obj map[string]json.RawMessage
  if err := json.Unmarshal(b, &obj); err == nil {
    bestKey := ""
    bestScore := -1
    for _, cand := range noEvtCandidates {
      if cand.IsArray { continue }
      if !hasAllFields(obj, cand.Required) { continue }
      sc := scoreFields(obj, cand.Properties)
      if sc > bestScore { bestScore = sc; bestKey = cand.Key }
    }
    if bestScore >= 0 && bestKey != "" { return bestKey }
  }
  // Try array payload; inspect first element
  var arr []map[string]json.RawMessage
  if err := json.Unmarshal(b, &arr); err == nil && len(arr) > 0 {
    first := arr[0]
    bestKey := ""
    bestScore := -1
    for _, cand := range noEvtCandidates {
      if !cand.IsArray { continue }
      if !hasAllFields(first, cand.Required) { continue }
      sc := scoreFields(first, cand.Properties)
      if sc > bestScore { bestScore = sc; bestKey = cand.Key }
    }
    if bestScore >= 0 && bestKey != "" { return bestKey }
  }
  return ""
}

// dispatchMessage performs JSON decoding + handler routing on a worker goroutine
func (c *Client) dispatchMessage(ctx context.Context, data []byte) {
  // Try structured dispatch first
  dispatched := false
  var envelope map[string]json.RawMessage
  if err := json.Unmarshal(data, &envelope); err == nil {
${(() => {
  if (!hasErrorModel) return '';
  const ek = String(errorAlias).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `    // Top-level error dispatch (spec-declared)
    if _, ok := envelope["error"]; ok {
      // collect matching handlers without holding the lock during invocation
      c.handlersMu.RLock()
      var callList []func(context.Context, []byte) error
      for _, hm := range c.handlers {
        if h, ok := hm["${ek}"]; ok && h != nil { callList = append(callList, h) }
      }
      c.handlersMu.RUnlock()
      // invoke wrapper handlers but do not mark dispatched; data-level handlers should decide
      for _, h := range callList { _ = h(ctx, data) }
      // If this error correlates to a request id, clear the pending one-shot handler
      if rawID, ok := envelope["id"]; ok && len(rawID) > 0 {
        dec := json.NewDecoder(bytes.NewReader(rawID))
        dec.UseNumber()
        var idVal interface{}
        if err := dec.Decode(&idVal); err == nil {
          var idStr string
          switch v := idVal.(type) {
          case json.Number:
            idStr = v.String()
          case string:
            idStr = v
          default:
            idStr = fmt.Sprintf("%v", v)
          }
          if _, ok := c.pendingByID.Load(idStr); ok {
            c.pendingByID.Delete(idStr)
          }
        }
      }
    }`;
})()}
    // Combined wrapper handlers first (spec-driven)
    // Support multiple wrapper shapes if declared in spec
    payload := data
${(() => {
  if (!wrappers.length) {
    // keep a small fallback for backward-compat (stream/data)
    return `    if _, hasStream := envelope[\"stream\"]; hasStream {
      c.handlersMu.RLock()
      var callList []func(context.Context, []byte) error
      for _, hm := range c.handlers {
        if h, ok := hm[\"wrap:combined\"]; ok && h != nil { callList = append(callList, h) }
      }
      c.handlersMu.RUnlock()
      // invoke wrapper handlers but do not mark dispatched; data-level handlers should decide
      for _, h := range callList { _ = h(ctx, data) }
      if raw, ok := envelope[\"data\"]; ok && len(raw) > 0 { payload = raw }
    }`;
  }
  // Generate explicit checks per wrapper discovered
  return wrappers.map((w, idx) => {
    const esk = String(w.streamKey).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const edk = String(w.dataKey).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const alias = String(w.aliasKey).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `    if _, ok := envelope[\"${esk}\"]; ok {
      c.handlersMu.RLock()
      var callList []func(context.Context, []byte) error
      for _, hm := range c.handlers {
        if h, ok := hm[\"${alias}\"]; ok && h != nil { callList = append(callList, h) }
      }
      c.handlersMu.RUnlock()
      // invoke wrapper handlers but do not mark dispatched; data-level handlers should decide
      for _, h := range callList { _ = h(ctx, data) }
      if raw, ok := envelope[\"${edk}\"]; ok && len(raw) > 0 { payload = raw }
    }`;
  }).join("\n");
})()}
    // Event-type dispatch with array/object shape detection
    // 1) Try object payload
    var typ map[string]interface{}
    if err := json.Unmarshal(payload, &typ); err == nil {
${(() => { return ''; })()}
      // support nested event.e as well as top-level e
      var ev string
      if v, ok := typ["e"].(string); ok { ev = v } else if evobj, ok := typ["event"].(map[string]interface{}); ok { if vv, ok2 := evobj["e"].(string); ok2 { ev = vv } }
      if ev != "" {
        key := "evt:" + ev
        c.handlersMu.RLock()
        var callList []func(context.Context, []byte) error
        for _, hm := range c.handlers {
          if h, ok := hm[key]; ok && h != nil { callList = append(callList, h) }
        }
        c.handlersMu.RUnlock()
        for _, h := range callList { if err := h(ctx, payload); err == nil { dispatched = true } }
      }
    } else {
      // 2) Try array payload; inspect first element for event type
      var arr []json.RawMessage
      if err2 := json.Unmarshal(payload, &arr); err2 == nil && len(arr) > 0 {
        var first map[string]interface{}
        if err3 := json.Unmarshal(arr[0], &first); err3 == nil {
${(() => { return ''; })()}
          // support nested event.e as well as top-level e for array payloads
          var ev string
          if v, ok := first["e"].(string); ok { ev = v } else if evobj, ok := first["event"].(map[string]interface{}); ok { if vv, ok2 := evobj["e"].(string); ok2 { ev = vv } }
          if ev != "" {
            key := "evt:" + ev + ":array"
            c.handlersMu.RLock()
            var callList []func(context.Context, []byte) error
            for _, hm := range c.handlers {
              if h, ok := hm[key]; ok && h != nil { callList = append(callList, h) }
            }
            c.handlersMu.RUnlock()
            for _, h := range callList { if err := h(ctx, payload); err == nil { dispatched = true } }
          }
        }
      }
    }
    // No-event-type routing based on field presence (x-no-event-type)
    if !dispatched {
      if key := classifyNoEventTypePayload(payload); key != "" {
        c.handlersMu.RLock()
        var callList []func(context.Context, []byte) error
        for _, hm := range c.handlers {
          if h, ok := hm[key]; ok && h != nil { callList = append(callList, h) }
        }
        c.handlersMu.RUnlock()
        for _, h := range callList { if err := h(ctx, payload); err == nil { dispatched = true } }
      }
    }
  }

  // ID-based dispatch for RPC-style responses (result/id)
  if !dispatched {
    var idProbe map[string]json.RawMessage
    if err := json.Unmarshal(data, &idProbe); err == nil {
      if rawID, ok := idProbe["id"]; ok && len(rawID) > 0 {
        // Decode ID using UseNumber to avoid float64 precision issues
        dec := json.NewDecoder(bytes.NewReader(rawID))
        dec.UseNumber()
        var idVal interface{}
        if err := dec.Decode(&idVal); err == nil {
          var idStr string
          switch v := idVal.(type) {
          case json.Number:
            idStr = v.String()
          case string:
            idStr = v
          default:
            idStr = fmt.Sprintf("%v", v)
          }
          // Prefer client-level pendingByID registry to avoid map-aliasing issues
          if h, ok := c.pendingByID.Load(idStr); ok {
            if fn, ok2 := h.(func(context.Context, []byte) error); ok2 && fn != nil {
              // one-shot: remove before invoking to avoid double-dispatch
              c.pendingByID.Delete(idStr)
              if err := fn(ctx, data); err == nil { dispatched = true }
            } else {
              // cleanup invalid entry
              c.pendingByID.Delete(idStr)
            }
          }
          if !dispatched {
            // Fallback to legacy per-channel id: handlers
            key := "id:" + idStr
            c.handlersMu.RLock()
            var idHandlers []func(context.Context, []byte) error
            for _, hm := range c.handlers {
              if h, ok := hm[key]; ok && h != nil { idHandlers = append(idHandlers, h) }
            }
            c.handlersMu.RUnlock()
            if len(idHandlers) > 0 {
              for _, h := range idHandlers { if err := h(ctx, data); err == nil { dispatched = true } }
            }
          }
        }
      }
    }
  }

  // Final fallback: fan-out to all handlers; their pre-checks will filter
  if !dispatched {
    c.handlersMu.RLock()
    var callList []func(context.Context, []byte) error
    for _, hm := range c.handlers {
      for k, h := range hm { if h != nil {
        if _, isWrapper := wrapperAliases[k]; isWrapper { continue }
        callList = append(callList, h)
      } }
    }
    c.handlersMu.RUnlock()
    for _, h := range callList { if err := h(ctx, data); err == nil { dispatched = true } }
  }

  if !dispatched { log.Printf("unhandled message: %s", string(data)) }
}

// mailbox is an unbounded, goroutine-safe FIFO for []byte messages
type mailbox struct {
  mu     sync.Mutex
  cond   *sync.Cond
  q      [][]byte
  closed bool
}

func newMailbox() *mailbox {
  m := &mailbox{}
  m.cond = sync.NewCond(&m.mu)
  return m
}

// Enqueue adds a message to the queue; it copies the slice to avoid aliasing
func (m *mailbox) Enqueue(b []byte) {
  if b == nil { return }
  m.mu.Lock()
  if m.closed {
    m.mu.Unlock()
    return
  }
  // copy to ensure immutability and avoid accidental reuse of buffers
  cp := append([]byte(nil), b...)
  m.q = append(m.q, cp)
  m.cond.Signal()
  m.mu.Unlock()
}

// Dequeue returns the next message; ok=false if closed and drained
func (m *mailbox) Dequeue() ([]byte, bool) {
  m.mu.Lock()
  for len(m.q) == 0 && !m.closed {
    m.cond.Wait()
  }
  if len(m.q) == 0 && m.closed {
    m.mu.Unlock()
    return nil, false
  }
  msg := m.q[0]
  // shift
  copy(m.q[0:], m.q[1:])
  m.q = m.q[:len(m.q)-1]
  m.mu.Unlock()
  return msg, true
}

// Close marks the mailbox closed and wakes any waiters
func (m *mailbox) Close() {
  m.mu.Lock()
  m.closed = true
  m.cond.Broadcast()
  m.mu.Unlock()
}
`}
      </Text>
    </File>
  );
}
