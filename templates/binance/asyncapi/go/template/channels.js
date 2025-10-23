import { File, Text } from '@asyncapi/generator-react-sdk';

function toPascalCase(str) {
  return (str || '')
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^([a-z])/, (m) => m.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
}

function toSnakeCase(str) {
  return (str || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '')
}

function toLowerCamelCase(str) {
  const pascal = toPascalCase(str);
  if (!pascal) return '';
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function extractPathParams(address) {
  const params = [];
  const re = /\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(address)) !== null) {
    params.push(m[1]);
  }
  return params;
}

function sanitizeAddress(address) {
  return (address || '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const moduleName = params.moduleName || 'websocket-sdk';

  const files = [];

  // Build maps to resolve global component models
  // 1) component message display name (name/title) -> component struct name
  const root = asyncapi.json ? asyncapi.json() : {};
  const compNameToStruct = {};
  if (root && root.components && root.components.messages) {
    Object.entries(root.components.messages).forEach(([compKey, compMsg]) => {
      try {
        const display = (compMsg && (compMsg.name || compMsg.title)) || compKey;
        const displayPascal = toPascalCase(display);
        const structName = toPascalCase(compKey);
        if (displayPascal) compNameToStruct[displayPascal] = structName;
      } catch (e) {}
    });
  }
  // 2) channel message key (e.g., subscribe, subscribeResponse) -> component struct name (if channel message $refers to a component message)
  const chanMsgKeyToStruct = {};
  try {
    if (root && root.channels) {
      Object.keys(root.channels).forEach((chKey) => {
        const ch = root.channels[chKey];
        if (ch && ch.messages) {
          Object.entries(ch.messages).forEach(([msgKey, msgVal]) => {
            if (msgVal && typeof msgVal === 'object' && msgVal.$ref && typeof msgVal.$ref === 'string') {
              const ref = msgVal.$ref;
              if (ref.startsWith('#/components/messages/')) {
                const compTail = ref.split('/').pop();
                const structName = toPascalCase(compTail);
                const keyPascal = toPascalCase(msgKey);
                chanMsgKeyToStruct[keyPascal] = structName;
              }
            }
          });
        }
      });
    }
  } catch (e) {}

  // Build operation map per channel by address for quick lookup
  const operationsByChannelAddr = new Map();
  asyncapi.operations().forEach((op) => {
    let chan = null;
    try {
      if (typeof op.channel === 'function') {
        chan = op.channel();
      } else if (typeof op.channels === 'function') {
        const cs = op.channels();
        chan = cs && cs[0];
      }
    } catch (e) {}
    if (!chan || !chan.address) return;
    const addr = chan.address();
    if (!operationsByChannelAddr.has(addr)) operationsByChannelAddr.set(addr, []);
    operationsByChannelAddr.get(addr).push(op);
  });

  // Collect channels
  const channelObjs = [];
  try {
    asyncapi.channels().forEach((channel) => channelObjs.push(channel));
  } catch (e) {
    // Fallback: if forEach isn't available, try keys/get pattern
    if (asyncapi.channels().keys && asyncapi.channels().get) {
      for (const k of asyncapi.channels().keys()) {
        const ch = asyncapi.channels().get(k);
        if (ch) channelObjs.push(ch);
      }
    }
  }

  // Iterate channels and emit a file per channel
  for (const ch of channelObjs) {
    if (!ch) continue;
    const addr = ch.address ? ch.address() : '';
    const nameSource = (typeof ch.id === 'function' && ch.id()) || sanitizeAddress(addr) || 'channel';
    const channelPascal = toPascalCase(nameSource);
    const channelSnake = toSnakeCase(nameSource);
    const paramNames = extractPathParams(addr);
    const fileName = `${channelSnake}_channel.go`;

    const ops = operationsByChannelAddr.get(addr) || [];
    const receiveOps = ops.filter(op => op.action && op.action() === 'receive');
    const sendOps = ops.filter(op => op.action && op.action() === 'send');

    const connectParamsSig = paramNames.map(p => `${toLowerCamelCase(p)} string`).join(', ');
    const connectReplaceCode = paramNames.map(p => {
      const name = toLowerCamelCase(p);
      return `\tpath = strings.ReplaceAll(path, "{${p}}", ${name})`;
    }).join('\n');

    let content = '';
    content += `package ${packageName}\n\n`;
    content += `import (\n`;
    content += `\t"context"\n`;
    content += `\t"encoding/json"\n`;
    content += `\t"fmt"\n`;
    content += `\t"strings"\n`;
    content += `\t"sync"\n`;
    content += `\t"time"\n`;
    content += `\t"net/url"\n`;
    content += `\t"github.com/gorilla/websocket"\n`;
    content += `\t"${moduleName}/models"\n`;
    content += `)\n\n`;

    // Channel struct
    content += `// ${channelPascal}Channel represents connection and handlers for channel '${nameSource}'\n`;
    content += `type ${channelPascal}Channel struct {\n`;
    content += `\tclient       *Client\n`;
    content += `\tisConnected  bool\n`;
    content += `\taddrTemplate string\n`;
    content += `\tmu           sync.RWMutex\n`;
    content += `\t// handler maps keyed by message name\n`;
    content += `\tmsgHandlers  map[string]func(context.Context, []byte) error\n`;
    content += `}\n\n`;

    // Constructor
    content += `// New${channelPascal}Channel constructs a channel bound to a client\n`;
    content += `func New${channelPascal}Channel(client *Client) *${channelPascal}Channel {\n`;
    content += `\treturn &${channelPascal}Channel{\n`;
    content += `\t\tclient:       client,\n`;
    content += `\t\taddrTemplate: "${addr}",\n`;
    content += `\t\tmsgHandlers:  make(map[string]func(context.Context, []byte) error),\n`;
    content += `\t}\n`;
    content += `}\n\n`;

    // Connect
    content += `// Connect resolves the channel address and establishes a WebSocket connection\n`;
    content += `func (ch *${channelPascal}Channel) Connect(ctx context.Context${connectParamsSig ? ', ' + connectParamsSig : ''}) error {\n`;
    content += `\tch.mu.Lock()\n`;
    content += `\tdefer ch.mu.Unlock()\n`;
    content += `\tif ch.isConnected {\n`;
    content += `\t\treturn fmt.Errorf("channel already connected")\n`;
    content += `\t}\n`;
    content += `\tbase := ch.client.serverManager.GetActiveServerURL()\n`;
    content += `\tif base == "" {\n`;
    content += `\t\treturn fmt.Errorf("no active server configured")\n`;
    content += `\t}\n`;
    content += `\tpath := ch.addrTemplate\n`;
    content += `${connectReplaceCode ? connectReplaceCode + '\n' : ''}`;
    // Normalize query: drop any empty query parameters like "streams=" and trim trailing '?'
    content += `\tif i := strings.Index(path, "?"); i >= 0 {\n`;
    content += `\t\tbasePath := path[:i]\n`;
    content += `\t\tq := path[i+1:]\n`;
    content += `\t\tparts := strings.Split(q, "&")\n`;
    content += `\t\tkept := make([]string, 0, len(parts))\n`;
    content += `\t\tfor _, p := range parts {\n`;
    content += `\t\t\tif p == "" { continue }\n`;
    content += `\t\t\tkv := strings.SplitN(p, "=", 2)\n`;
    content += `\t\t\tif len(kv) == 2 && kv[1] == "" { continue }\n`;
    content += `\t\t\tkept = append(kept, p)\n`;
    content += `\t\t}\n`;
    content += `\t\tif len(kept) > 0 {\n`;
    content += `\t\t\tpath = basePath + "?" + strings.Join(kept, "&")\n`;
    content += `\t\t} else {\n`;
    content += `\t\t\tpath = basePath\n`;
    content += `\t\t}\n`;
    content += `\t}\n`;
    content += `\tfull := strings.TrimRight(base, "/") + path\n`;
    content += `\tch.client.connMu.RLock()\n`;
    content += `\tclConn := ch.client.conn\n`;
    content += `\tch.client.connMu.RUnlock()\n`;
    content += `\tif clConn == nil {\n`;
    content += `\t\tu, err := url.Parse(full)\n`;
    content += `\t\tif err != nil { return fmt.Errorf("invalid URL: %w", err) }\n`;
    content += `\t\tdialer := websocket.DefaultDialer\n`;
    content += `\t\tdialer.HandshakeTimeout = 10 * time.Second\n`;
    content += `\t\tconn, _, err := dialer.DialContext(ctx, u.String(), nil)\n`;
    content += `\t\tif err != nil { return fmt.Errorf("websocket dial failed: %w", err) }\n`;
    content += `\t\tch.client.connMu.Lock()\n`;
    content += `\t\tch.client.conn = conn\n`;
    content += `\t\tch.client.isConnected = true\n`;
    content += `\t\tch.client.connMu.Unlock()\n`;
    content += `\t}\n`;
    content += `\t// register handlers and start shared read loop\n`;
    content += `\tch.client.RegisterHandlers("${nameSource}", ch.msgHandlers)\n`;
    content += `\tch.client.ensureReadLoop(ctx)\n`;
    content += `\tch.isConnected = true\n`;
    content += `\treturn nil\n`;
    content += `}\n\n`;

    // Disconnect cancels the read loop first to avoid lock-order inversions,
    // then removes channel handlers. It respects ctx via Client.Wait(ctx).
    content += `// Disconnect tears down channel handlers and cancels the client's read loop\n`;
    content += `func (ch *${channelPascal}Channel) Disconnect(ctx context.Context) error {\n`;
    content += `\t// Stop the read loop and underlying connection early to avoid handler lock contention\n`;
    content += `\tch.client.StopReadLoop()\n`;
    content += `\t// Wait for the read loop to exit or the context to cancel\n`;
    content += `\tif err := ch.client.Wait(ctx); err != nil && err != context.Canceled { return err }\n`;
    content += `\t// Remove handlers for this channel\n`;
    content += `\tch.client.handlersMu.Lock()\n`;
    content += `\tdelete(ch.client.handlers, "${nameSource}")\n`;
    content += `\tch.client.handlersMu.Unlock()\n`;
    content += `\t// Mark channel as disconnected\n`;
    content += `\tch.mu.Lock()\n`;
    content += `\tch.isConnected = false\n`;
    content += `\tch.mu.Unlock()\n`;
    content += `\treturn nil\n`;
    content += `}\n\n`;

    // Shared read loop is managed by Client; this channel only registers handlers.

    // Track emitted handler method names to avoid duplicates across sections
    const emittedHandlerNames = new Set();

    // Generate send operation methods
    sendOps.forEach(op => {
      const opId = op.id ? op.id() : '';
      // Prefer x-extension override for channel method name when present.
      // Check root.operations[opId] first, then components.operations[opId], then op.json().
      let opJsonMeta = {};
      try {
        if (root && root.operations && Object.prototype.hasOwnProperty.call(root.operations, opId)) {
          opJsonMeta = root.operations[opId] || {};
        } else if (root && root.components && root.components.operations && Object.prototype.hasOwnProperty.call(root.components.operations, opId)) {
          opJsonMeta = root.components.operations[opId] || {};
        } else if (typeof op.json === 'function') {
          opJsonMeta = op.json() || {};
        }
      } catch (e) { /* ignore */ }
      const methodOverride = (() => {
        try {
          if (!opJsonMeta || typeof opJsonMeta !== 'object') return '';
          const keys = ['x-channel-method', 'x-method-name', 'x-go-method'];
          for (const k of keys) {
            const v = opJsonMeta[k];
            if (typeof v === 'string' && v.trim()) return v.trim();
          }
        } catch (e) {}
        return '';
      })();
      const methodBase = methodOverride || opId || 'Send';
      const methodName = toPascalCase(methodBase);
      // Extract first request message payload type name
      let reqModelName = 'interface{}';
      // Collect top-level const assignments from the request payload schema
      const constAssignments = [];
      // Helper: safe Go field name from property key (honors x-go-name when present)
      function goFieldNameFromKey(key, propSchema) {
        try {
          const override = propSchema && (propSchema['x-go-name'] || (typeof propSchema.extension === 'function' && propSchema.extension && propSchema.extension('x-go-name')));
          if (override) {
            let n = toPascalCase(String(override));
            if (/^[0-9]/.test(n)) n = 'X' + n;
            return n;
          }
        } catch (e) {}
        let n = toPascalCase(String(key || 'Field'));
        if (/^[0-9]/.test(n)) n = 'X' + n;
        return n;
      }
      // Helper: convert JS value to a Go literal
      function goLiteral(val) {
        const t = typeof val;
        if (t === 'string') {
          const escaped = String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          return `"${escaped}"`;
        }
        if (t === 'number' || t === 'bigint') return String(val);
        if (t === 'boolean') return val ? 'true' : 'false';
        const s = String(val);
        const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${escaped}"`;
      }
      try {
        const msgs = op.messages();
        if (msgs && msgs.length > 0) {
          const m = msgs[0];
          const mName = m.name ? (m.name() || m.id && m.id()) : (m.id && m.id());
          const displayPascal = toPascalCase(mName || '');
          const byDisplay = compNameToStruct[displayPascal];
          const byKey = chanMsgKeyToStruct[displayPascal];
          const resolvedStruct = byKey || byDisplay;
          if (resolvedStruct) {
            reqModelName = `models.${resolvedStruct}`;
          } else {
            const modelType = toPascalCase(channelPascal + (mName || 'Request'));
            reqModelName = `models.${modelType}`;
          }
          // Attempt to collect top-level const fields from the payload schema
          try {
            // Preferred: via model API
            if (typeof m.payload === 'function') {
              const payload = m.payload();
              if (payload) {
                let props;
                try { props = typeof payload.properties === 'function' ? payload.properties() : payload.properties; } catch (e) { props = undefined; }
                if (props) {
                  let entries = [];
                  try {
                    if (typeof props.all === 'function') {
                      const allProps = props.all();
                      entries = Object.entries(allProps || {});
                    } else if (props instanceof Map) {
                      entries = Array.from(props.entries());
                    } else if (typeof props === 'object') {
                      entries = Object.entries(props);
                    }
                  } catch (e) {}
                  entries.forEach(([k, sch]) => {
                    try {
                      let cval;
                      if (sch && typeof sch.const === 'function') cval = sch.const();
                      else if (sch && Object.prototype.hasOwnProperty.call(sch, 'const')) cval = sch.const;
                      if (cval !== undefined) {
                        constAssignments.push({ field: goFieldNameFromKey(k, sch), value: goLiteral(cval) });
                      }
                    } catch (e) {}
                  });
                }
              }
            }
            // Fallback: via raw JSON and $ref resolution
            if (constAssignments.length === 0 && typeof m.json === 'function') {
              const mj = m.json();
              if (mj) {
                let pschema = mj.payload;
                if (pschema && pschema.$ref && typeof pschema.$ref === 'string') {
                  const ref = pschema.$ref;
                  if (ref.startsWith('#/components/schemas/')) {
                    const tail = ref.split('/').pop();
                    if (root && root.components && root.components.schemas && root.components.schemas[tail]) {
                      pschema = root.components.schemas[tail];
                    }
                  }
                }
                const props = pschema && pschema.properties;
                if (props && typeof props === 'object') {
                  Object.entries(props).forEach(([k, sch]) => {
                    if (!sch) return;
                    const cval = sch.const;
                    if (cval !== undefined) {
                      constAssignments.push({ field: goFieldNameFromKey(k, sch), value: goLiteral(cval) });
                    }
                  });
                }
              }
            }
          } catch (e) { /* ignore const extraction errors */ }
        }
      } catch (e) {}

      // Prepare reply model and precheck for id-based response handlers
      let replyModelType = '';
      let replyPreCheck = '';
      let reqIDField = 'Id';
      try {
        // infer request id field name
        const msgs0 = op.messages && op.messages();
        if (msgs0 && msgs0.length) {
          const m0 = msgs0[0];
          const mj0 = (typeof m0.json === 'function') ? m0.json() : null;
          let ps0 = mj0 && mj0.payload;
          if (ps0 && ps0.$ref && typeof ps0.$ref === 'string' && ps0.$ref.startsWith('#/components/schemas/')) {
            const tail0 = ps0.$ref.split('/').pop();
            if (root && root.components && root.components.schemas && root.components.schemas[tail0]) {
              ps0 = root.components.schemas[tail0];
            }
          }
          const pr = ps0 && ps0.properties;
          if (pr && pr.id) reqIDField = goFieldNameFromKey('id', pr.id);
        }
      } catch (e) {}
      try {
        const reply = op.reply && op.reply();
        if (reply && reply.messages) {
          const rmsgs = reply.messages();
          if (rmsgs && rmsgs.length) {
            const rm = rmsgs[0];
            const rName = rm.name ? (rm.name() || rm.id && rm.id()) : (rm.id && rm.id());
            const handlerName = toPascalCase(rName || 'Reply');
            const displayPascal = toPascalCase(rName || '');
            const byDisplay = compNameToStruct[displayPascal];
            const byKey = chanMsgKeyToStruct[handlerName];
            const resolvedStruct = byKey || byDisplay;
            replyModelType = resolvedStruct ? `models.${resolvedStruct}` : `models.${toPascalCase(channelPascal + (rName || 'Reply'))}`;
            const mjr = (typeof rm.json === 'function') ? rm.json() : null;
            let psr = mjr && mjr.payload;
            if (psr && psr.$ref && typeof psr.$ref === 'string' && psr.$ref.startsWith('#/components/schemas/')) {
              const tail = psr.$ref.split('/').pop();
              if (root && root.components && root.components.schemas) psr = root.components.schemas[tail] || psr;
            }
            const props = psr && psr.properties;
            if (props && props.error) {
              replyPreCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"error\"]; !ok { return fmt.Errorf(\"not error response\") }\n`;
            } else if (props && props.result) {
              const r = props.result;
              if (r && r.type === 'array') {
                replyPreCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif v, ok := probe[\"result\"]; !ok || len(v) == 0 || v[0] != '[' { return fmt.Errorf(\"not array result\") }\n`;
              } else if (r && (r.type === 'string' || r.type === 'boolean' || (r.oneOf && r.oneOf.length))) {
                replyPreCheck = `\n\t\tvar probe map[string]interface{}\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"result\"]; !ok { return fmt.Errorf(\"no result field\") }\n`;
              } else {
                replyPreCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"result\"]; !ok { return fmt.Errorf(\"no result field\") }\n`;
              }
            }
          }
        }
      } catch (e) {}

      content += `// ${methodName} sends a message for operation '${opId}' on ${nameSource}\n`;
      content += replyModelType
        ? `func (ch *${channelPascal}Channel) ${methodName}(ctx context.Context, req *${reqModelName}, handler *func(context.Context, *${replyModelType}) error) error {\n`
        : `func (ch *${channelPascal}Channel) ${methodName}(ctx context.Context, req *${reqModelName}) error {\n`;
      // function signature already emitted above based on replyModelType
      content += `\tch.client.connMu.RLock()\n`;
      content += `\tconn := ch.client.conn\n`;
      content += `\tch.client.connMu.RUnlock()\n`;
      content += `\tif conn == nil { return fmt.Errorf("not connected") }\n`;
      if (replyModelType) {
        content += `\tif handler != nil && *handler != nil {\n`;
        content += `\t\tidStr := fmt.Sprintf(\"%v\", req.${reqIDField})\n`;
        // store one-shot handler in client-level pendingByID to avoid per-channel map aliasing issues
        content += `\t\tch.client.pendingByID.Store(idStr, func(ctx context.Context, b []byte) error {\n`;
        content += replyPreCheck;
        content += `\t\t\tvar v ${replyModelType}\n`;
        content += `\t\t\tif err := json.Unmarshal(b, &v); err != nil { return err }\n`;
        content += `\t\t\tif handler == nil || *handler == nil { return nil }\n`;
        content += `\t\t\treturn (*handler)(ctx, &v)\n`;
        content += `\t\t})\n`;
        content += `\t}\n`;
      }
      if (constAssignments.length > 0) {
        content += `\t// Apply const constraints from schema\n`;
        constAssignments.forEach(a => {
          content += `\treq.${a.field} = ${a.value}\n`;
        });
      }
      content += `\tdata, err := json.Marshal(req)\n`;
      content += `\tif err != nil { return fmt.Errorf("marshal request: %w", err) }\n`;
      content += `\treturn conn.WriteMessage(websocket.TextMessage, data)\n`;
      content += `}\n\n`;

      // Reply handlers omitted: using per-request id-based responses
      if (false) try {
        const reply = op.reply && op.reply();
        if (reply && reply.messages) {
          const rmsgs = reply.messages();
          if (rmsgs && rmsgs.length) {
            rmsgs.forEach(rm => {
              const rName = rm.name ? (rm.name() || rm.id && rm.id()) : (rm.id && rm.id());
              const handlerName = toPascalCase(rName || 'Reply');
              const displayPascal = toPascalCase(rName || '');
              const byDisplay = compNameToStruct[displayPascal];
              const byKey = chanMsgKeyToStruct[handlerName];
              const resolvedStruct = byKey || byDisplay;
              const modelType = resolvedStruct ? `models.${resolvedStruct}` : `models.${toPascalCase(channelPascal + (rName || 'Reply'))}`;
              // Build a lightweight predicate for reply dispatch based on schema shape
              let preCheck = '';
              try {
                const mj = (typeof rm.json === 'function') ? rm.json() : null;
                let ps = mj && mj.payload;
                if (ps && ps.$ref && typeof ps.$ref === 'string' && ps.$ref.startsWith('#/components/schemas/')) {
                  const tail = ps.$ref.split('/').pop();
                  if (root && root.components && root.components.schemas) ps = root.components.schemas[tail] || ps;
                }
                const props = ps && ps.properties;
                if (props && props.error) {
                  // error response
                  preCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"error\"]; !ok { return fmt.Errorf(\"not error response\") }\n`;
                } else if (props && props.result) {
                  const r = props.result;
                  if (r && r.type === 'array') {
                    preCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif v, ok := probe[\"result\"]; !ok || len(v) == 0 || v[0] != '[' { return fmt.Errorf(\"not array result\") }\n`;
                  } else if (r && (r.type === 'string' || r.type === 'boolean' || (r.oneOf && r.oneOf.length))) {
                    preCheck = `\n\t\tvar probe map[string]interface{}\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"result\"]; !ok { return fmt.Errorf(\"no result field\") }\n`;
                  } else {
                    // null or unknown -> just check for presence of id/result
                    preCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"result\"]; !ok { return fmt.Errorf(\"no result field\") }\n`;
                  }
                }
              } catch (e) {}
              if (!emittedHandlerNames.has(handlerName)) {
                emittedHandlerNames.add(handlerName);
                content += `// Handle${handlerName} registers a handler for replies of '${opId}'\n`;
                content += `func (ch *${channelPascal}Channel) Handle${handlerName}(fn func(context.Context, *${modelType}) error) {\n`;
                content += `\tif ch.msgHandlers == nil { ch.msgHandlers = make(map[string]func(context.Context, []byte) error) }\n`;
                content += `\tch.msgHandlers["${rName}"] = func(ctx context.Context, b []byte) error {\n`;
                content += preCheck;
                content += `\t\tvar v ${modelType}\n`;
                content += `\t\tif err := json.Unmarshal(b, &v); err != nil { return err }\n`;
                content += `\t\treturn fn(ctx, &v)\n`;
                content += `\t}\n`;
                content += `}\n\n`;
              }
            });
          }
        }
      } catch (e) {}
    });

    // Generate receive message handlers
    receiveOps.forEach(op => {
      try {
        const msgs = op.messages();
        if (msgs && msgs.length) {
          msgs.forEach(m => {
            const mName = m.name ? (m.name() || m.id && m.id()) : (m.id && m.id());
            const displayPascal = toPascalCase(mName || '');
            const byDisplay = compNameToStruct[displayPascal];
            // Try to resolve by the channel message key as PascalCase (preserves 'Event' suffix from spec keys)
            // Fall back to display name mapping when necessary
            // Note: handler name should align with model struct when available (e.g., AggregateTradeEvent)
            let tempKey = displayPascal; // legacy key attempt
            const byKey = chanMsgKeyToStruct[tempKey];
            const resolvedStruct = byKey || byDisplay;
            const modelType = resolvedStruct ? `models.${resolvedStruct}` : `models.${toPascalCase(channelPascal + (mName || 'Message'))}`;
            // Prefer struct name for handler naming to keep 'Event' suffix (consistent across modules)
            const handlerName = resolvedStruct || toPascalCase(mName || 'Message');
            // Pre-compute alias keys for client-side routing
            // Prefer spec-driven flags over name-based heuristics
            let isCombinedWrapperFlag = false;
            let wrapperAliasKey = '';
            try {
              const mjMeta = (typeof m.json === 'function') ? m.json() : null;
              if (mjMeta) {
                // x-wrapper: true | 'combined' | { type: 'combined' }
                const w = mjMeta['x-wrapper'];
                if (w === true || w === 'combined' || (w && typeof w === 'object' && (w.type === 'combined' || w.type === true))) {
                  isCombinedWrapperFlag = true;
                }
                if (mjMeta['x-handler-key'] && typeof mjMeta['x-handler-key'] === 'string') {
                  wrapperAliasKey = String(mjMeta['x-handler-key']);
                }
              }
            } catch (e) {}
            // Backward-compat fallback
            if (!isCombinedWrapperFlag) {
              isCombinedWrapperFlag = (mName === 'combinedMarketStreamsEvent');
            }
            let expectedEventTypeAlias = '';
            let isArrayFormat = false;
            let isErrorMessageFlag = false;
            let errorAliasKey = 'error';
            let noEventTypeFlag = false;
            try {
              const mj0 = (typeof m.json === 'function') ? m.json() : null;
              if (mj0) {
                if (mj0['x-event-type']) expectedEventTypeAlias = mj0['x-event-type'];
                if (mj0['x-response-format'] && String(mj0['x-response-format']).toLowerCase() === 'array') {
                  isArrayFormat = true;
                }
                if (mj0['x-error'] === true) isErrorMessageFlag = true;
                if (typeof mj0['x-handler-key'] === 'string' && mj0['x-handler-key'].trim()) {
                  errorAliasKey = String(mj0['x-handler-key']).trim();
                }
                if (mj0['x-no-event-type'] === true || mj0['x-no-event-type'] === 'true') {
                  noEventTypeFlag = true;
                }
                let ps0 = mj0.payload;
                if (!expectedEventTypeAlias && ps0 && ps0.$ref && typeof ps0.$ref === 'string' && ps0.$ref.startsWith('#/components/schemas/')) {
                  const tail0 = ps0.$ref.split('/').pop();
                  if (root && root.components && root.components.schemas && root.components.schemas[tail0]) {
                    ps0 = root.components.schemas[tail0];
                  }
                }
                // If payload type is array, flag isArrayFormat
                if (!isArrayFormat && ps0 && ps0.type === 'array') {
                  isArrayFormat = true;
                }
                const props0 = ps0 && ps0.properties;
                if (props0 && Object.prototype.hasOwnProperty.call(props0, 'error')) isErrorMessageFlag = true;
                if (!expectedEventTypeAlias && props0 && props0.e && props0.e.const) expectedEventTypeAlias = props0.e.const;
                // Also support nested event.e.const in payload
                if (!expectedEventTypeAlias && props0 && props0.event && props0.event.properties && props0.event.properties.e && props0.event.properties.e.const) {
                  expectedEventTypeAlias = props0.event.properties.e.const;
                }
              }
            } catch (e) {}
            // Compute pre-check for event dispatch
            let preCheck = '';
            try {
              const mj = (typeof m.json === 'function') ? m.json() : null;
              // event wrapper special-case: use x-wrapper-keys if present
              let isCombinedWrapper = false;
              let streamKey = 'stream';
              let dataKey = 'data';
              try {
                const mjMeta = (typeof m.json === 'function') ? m.json() : null;
                if (mjMeta) {
                  const w = mjMeta['x-wrapper'];
                  if (w === true || w === 'combined' || (w && typeof w === 'object' && (w.type === 'combined' || w.type === true))) {
                    isCombinedWrapper = true;
                  }
                  const wk = mjMeta['x-wrapper-keys'];
                  if (wk && typeof wk === 'object') {
                    if (wk.stream) streamKey = String(wk.stream);
                    if (wk.data) dataKey = String(wk.data);
                  }
                }
              } catch (e) {}
              if (!isCombinedWrapper) {
                isCombinedWrapper = (mName === 'combinedMarketStreamsEvent');
              }
              if (isCombinedWrapper) {
                const esk = streamKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                const edk = dataKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                preCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"${esk}\"]; !ok { return fmt.Errorf(\"not combined wrapper\") }\n\t\tif _, ok := probe[\"${edk}\"]; !ok { return fmt.Errorf(\"not combined wrapper\") }\n`;
              } else {
                // Try to grab event type from x-event-type or payload e.const (including nested event.e)
                let expectedEventType = '';
                if (mj && mj['x-event-type']) expectedEventType = mj['x-event-type'];
                let ps = mj && mj.payload;
                if (!expectedEventType && ps) {
                  if (ps.$ref && typeof ps.$ref === 'string' && ps.$ref.startsWith('#/components/schemas/')) {
                    const tail = ps.$ref.split('/').pop();
                    if (root && root.components && root.components.schemas) ps = root.components.schemas[tail] || ps;
                  }
                  const props = ps && ps.properties;
                  if (props && props.e && props.e.const) expectedEventType = props.e.const;
                  // Also consider nested event.e.const
                  if (!expectedEventType && props && props.event && props.event.properties && props.event.properties.e && props.event.properties.e.const) {
                    expectedEventType = props.event.properties.e.const;
                  }
                }
                // Error message pre-check takes priority over event checks
                if (isErrorMessageFlag) {
                  preCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"error\"]; !ok { return fmt.Errorf(\"not error message\") }\n`;
                } else if (isArrayFormat) {
                  // Array payload: inspect first element's event type or required fields for no-event-type
                  if (expectedEventType) {
                    const esc = String(expectedEventType).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    preCheck = `\n\t\tvar arr []json.RawMessage\n\t\tif err := json.Unmarshal(b, &arr); err != nil { return err }\n\t\tif len(arr) == 0 { return fmt.Errorf(\"empty array\") }\n\t\tvar typ map[string]interface{}\n\t\tif err := json.Unmarshal(arr[0], &typ); err != nil { return err }\n\t\tvar ev string\n\t\tif v, ok := typ[\"e\"].(string); ok { ev = v } else if evobj, ok := typ[\"event\"].(map[string]interface{}); ok { if vv, ok2 := evobj[\"e\"].(string); ok2 { ev = vv } }\n\t\tif ev != \"${esc}\" { return fmt.Errorf(\"unexpected event type\") }\n`;
                  } else if (noEventTypeFlag) {
                    // Required field validation on first element
                    let reqKeys = [];
                    try {
                      let ps2 = mj && mj.payload;
                      if (ps2 && ps2.$ref && typeof ps2.$ref === 'string' && ps2.$ref.startsWith('#/components/schemas/')) {
                        const tail2 = ps2.$ref.split('/').pop();
                        if (root && root.components && root.components.schemas && root.components.schemas[tail2]) {
                          ps2 = root.components.schemas[tail2];
                        }
                      }
                      if (ps2 && ps2.type === 'array') {
                        const it2 = ps2.items || {};
                        let sch2 = it2;
                        if (it2.$ref && typeof it2.$ref === 'string' && it2.$ref.startsWith('#/components/schemas/')) {
                          const tail3 = it2.$ref.split('/').pop();
                          if (root && root.components && root.components.schemas && root.components.schemas[tail3]) {
                            sch2 = root.components.schemas[tail3];
                          }
                        }
                        if (Array.isArray(sch2 && sch2.required)) reqKeys = sch2.required.slice();
                      }
                    } catch (e) {}
                    const conds = (reqKeys || []).map(k => `if _, ok := first[\"${String(k).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}\"]; !ok { return fmt.Errorf(\"missing field\") }`).join('\n\t\t');
                    preCheck = `\n\t\tvar arr []json.RawMessage\n\t\tif err := json.Unmarshal(b, &arr); err != nil { return err }\n\t\tif len(arr) == 0 { return fmt.Errorf(\"empty array\") }\n\t\tvar first map[string]json.RawMessage\n\t\tif err := json.Unmarshal(arr[0], &first); err != nil { return err }\n\t\t${conds}\n`;
                  } else {
                    preCheck = `\n\t\tvar arr []json.RawMessage\n\t\tif err := json.Unmarshal(b, &arr); err != nil { return err }\n\t\tif len(arr) == 0 { return fmt.Errorf(\"empty array\") }\n`;
                  }
                } else {
                  if (expectedEventType) {
                    const esc = String(expectedEventType).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    preCheck = `\n\t\tvar typ map[string]interface{}\n\t\tif err := json.Unmarshal(b, &typ); err != nil { return err }\n\t\tvar ev string\n\t\tif v, ok := typ[\"e\"].(string); ok { ev = v } else if evobj, ok := typ[\"event\"].(map[string]interface{}); ok { if vv, ok2 := evobj[\"e\"].(string); ok2 { ev = vv } }\n\t\tif ev != \"${esc}\" { return fmt.Errorf(\"unexpected event type\") }\n`;
                  } else if (noEventTypeFlag) {
                    // Validate by required fields for x-no-event-type messages
                    let reqKeys = [];
                    try {
                      let ps2 = mj && mj.payload;
                      if (ps2 && ps2.$ref && typeof ps2.$ref === 'string' && ps2.$ref.startsWith('#/components/schemas/')) {
                        const tail2 = ps2.$ref.split('/').pop();
                        if (root && root.components && root.components.schemas && root.components.schemas[tail2]) {
                          ps2 = root.components.schemas[tail2];
                        }
                      }
                      if (ps2 && ps2.type === 'array') {
                        const it2 = ps2.items || {};
                        let sch2 = it2;
                        if (it2.$ref && typeof it2.$ref === 'string' && it2.$ref.startsWith('#/components/schemas/')) {
                          const tail3 = it2.$ref.split('/').pop();
                          if (root && root.components && root.components.schemas && root.components.schemas[tail3]) {
                            sch2 = root.components.schemas[tail3];
                          }
                        }
                        if (Array.isArray(sch2 && sch2.required)) reqKeys = sch2.required.slice();
                      } else {
                        if (Array.isArray(ps2 && ps2.required)) reqKeys = ps2.required.slice();
                      }
                    } catch (e) {}
                    const conds = (reqKeys || []).map(k => `if _, ok := probe[\"${String(k).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}\"]; !ok { return fmt.Errorf(\"missing field\") }`).join('\n\t\t');
                    preCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\t${conds}\n`;
                  } else {
                    // generic event presence check: has top-level 'e' or nested 'event.e'
                    preCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"e\"]; !ok {\n\t\t\tvar nested map[string]json.RawMessage\n\t\t\tif raw, ok2 := probe[\"event\"]; !ok2 { return fmt.Errorf(\"missing event type\") } else {\n\t\t\t\tif err := json.Unmarshal(raw, &nested); err != nil { return err }\n\t\t\t\tif _, ok3 := nested[\"e\"]; !ok3 { return fmt.Errorf(\"missing event type\") }\n\t\t\t}\n\t\t}\n`;
                  }
                }
              }
            } catch (e) {}
            // Compose handler documentation from spec extensions (patterns/examples/speeds)
            let docLines = [];
            try {
              const docsMeta = (typeof m.json === 'function') ? m.json() : null;
              const toArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
              if (docsMeta) {
                const patList = [
                  ...toArr(docsMeta['x-stream-pattern']),
                  ...(Array.isArray(docsMeta['x-stream-patterns']) ? docsMeta['x-stream-patterns'] : []),
                ].filter(Boolean).map(String);
                const exList = toArr(docsMeta['x-stream-example']).filter(Boolean).map(String);
                const spList = toArr(docsMeta['x-update-speed']).filter(Boolean).map(String);
                if (patList.length) {
                  docLines.push('// Patterns:');
                  patList.forEach(p => { docLines.push(`//   - ${p}`); });
                }
                if (exList.length) {
                  docLines.push('// Examples:');
                  exList.forEach(e => { docLines.push(`//   - ${e}`); });
                }
                if (spList.length) {
                  docLines.push('// Update speeds:');
                  spList.forEach(s => { docLines.push(`//   - ${s}`); });
                }
              }
            } catch (e) { /* ignore doc extraction errors */ }
            if (!emittedHandlerNames.has(handlerName)) {
              emittedHandlerNames.add(handlerName);
              if (docLines.length) { content += docLines.join('\n') + `\n`; }
              content += `// Handle${handlerName} registers a handler for message '${mName}' on ${nameSource}\n`;
              content += `func (ch *${channelPascal}Channel) Handle${handlerName}(fn func(context.Context, *${modelType}) error) {\n`;
              content += `\tif fn == nil { return }\n`;
              content += `\tif ch.msgHandlers == nil { ch.msgHandlers = make(map[string]func(context.Context, []byte) error) }\n`;
            // Prefer alias keys for events and wrappers to avoid duplicate handlers
            if (isCombinedWrapperFlag) {
              const aliasKey = wrapperAliasKey || 'wrap:combined';
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tch.msgHandlers["${aliasKey}"] = func(ctx context.Context, b []byte) error {\n`;
              content += preCheck;
              content += `\t\tvar v ${modelType}\n`;
              content += `\t\tif err := json.Unmarshal(b, &v); err != nil { return err }\n`;
              content += `\t\treturn fn(ctx, &v)\n`;
              content += `\t}\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              // unregister
              content += `}\n`;
              content += `\nfunc (ch *${channelPascal}Channel) Unregister${handlerName}() {\n`;
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tdelete(ch.msgHandlers, "${aliasKey}")\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              content += `}\n\n`;
            } else if (isErrorMessageFlag) {
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tch.msgHandlers[\"${errorAliasKey}\"] = func(ctx context.Context, b []byte) error {\n`;
              content += preCheck;
              content += `\t\tvar v ${modelType}\n`;
              content += `\t\tif err := json.Unmarshal(b, &v); err != nil { return err }\n`;
              content += `\t\treturn fn(ctx, &v)\n`;
              content += `\t}\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              content += `}\n`;
              content += `\nfunc (ch *${channelPascal}Channel) Unregister${handlerName}() {\n`;
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tdelete(ch.msgHandlers, \"${errorAliasKey}\")\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              content += `}\n\n`;
            } else if (expectedEventTypeAlias) {
              const alias = isArrayFormat ? `evt:${expectedEventTypeAlias}:array` : `evt:${expectedEventTypeAlias}`;
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tch.msgHandlers[\"${alias}\"] = func(ctx context.Context, b []byte) error {\n`;
              content += preCheck;
              content += `\t\tvar v ${modelType}\n`;
              content += `\t\tif err := json.Unmarshal(b, &v); err != nil { return err }\n`;
              content += `\t\treturn fn(ctx, &v)\n`;
              content += `\t}\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              content += `}\n`;
              content += `\nfunc (ch *${channelPascal}Channel) Unregister${handlerName}() {\n`;
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tdelete(ch.msgHandlers, \"${alias}\")\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              content += `}\n\n`;
            } else {
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tch.msgHandlers[\"${mName}\"] = func(ctx context.Context, b []byte) error {\n`;
              content += preCheck;
              content += `\t\tvar v ${modelType}\n`;
              content += `\t\tif err := json.Unmarshal(b, &v); err != nil { return err }\n`;
              content += `\t\treturn fn(ctx, &v)\n`;
              content += `\t}\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              content += `}\n`;
              content += `\nfunc (ch *${channelPascal}Channel) Unregister${handlerName}() {\n`;
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tdelete(ch.msgHandlers, \"${mName}\")\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              content += `}\n\n`;
            }
            }
          });
        }
      } catch (e) {}
    });

    // Additional unwrapped event handlers for combined streams (spec-driven)
    try {
      const chKey = (typeof ch.id === 'function' && ch.id()) || '';
      const chJson = (root && root.channels && chKey && root.channels[chKey]) ? root.channels[chKey] : null;
      const unwrappedList = chJson && chJson['x-unwrapped-event-messages'];
      if (Array.isArray(unwrappedList) && unwrappedList.length) {
        unwrappedList.forEach((msgKey) => {
          try {
            const compMsg = root && root.components && root.components.messages && root.components.messages[msgKey];
            if (!compMsg) return;
            const msgName = compMsg.name || msgKey;
            // Use struct/schema key to preserve 'Event' suffix in handler naming
            const structName = toPascalCase(msgKey);
            const handlerName = structName;
            const modelType = `models.${structName}`;
            // Determine expected event type alias from message metadata or payload schema
            let expectedEventTypeAlias = '';
            let isArrayFormat = false;
            let isErrorMessageFlag = false;
            let errorAliasKey = 'error';
            try {
              if (compMsg['x-event-type']) expectedEventTypeAlias = compMsg['x-event-type'];
              if (compMsg['x-response-format'] && String(compMsg['x-response-format']).toLowerCase() === 'array') isArrayFormat = true;
              if (compMsg['x-error'] === true) isErrorMessageFlag = true;
              if (typeof compMsg['x-handler-key'] === 'string' && compMsg['x-handler-key'].trim()) {
                errorAliasKey = String(compMsg['x-handler-key']).trim();
              }
              let ps0 = compMsg.payload;
              if (!expectedEventTypeAlias && ps0 && ps0.$ref && typeof ps0.$ref === 'string' && ps0.$ref.startsWith('#/components/schemas/')) {
                const tail0 = ps0.$ref.split('/').pop();
                if (root && root.components && root.components.schemas && root.components.schemas[tail0]) {
                  ps0 = root.components.schemas[tail0];
                }
              }
              if (!isArrayFormat && ps0 && ps0.type === 'array') isArrayFormat = true;
              const props0 = ps0 && ps0.properties;
              if (props0 && Object.prototype.hasOwnProperty.call(props0, 'error')) isErrorMessageFlag = true;
              if (!expectedEventTypeAlias && props0 && props0.e && props0.e.const) expectedEventTypeAlias = props0.e.const;
              // Also support nested event.e.const in payload
              if (!expectedEventTypeAlias && props0 && props0.event && props0.event.properties && props0.event.properties.e && props0.event.properties.e.const) {
                expectedEventTypeAlias = props0.event.properties.e.const;
              }
            } catch (e) {}
            // Pre-check
            let preCheck = '';
            // Error payloads take priority over event checks
            if (isErrorMessageFlag) {
              preCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"error\"]; !ok { return fmt.Errorf(\"not error message\") }\n`;
            } else if (isArrayFormat) {
              if (expectedEventTypeAlias) {
                const esc = String(expectedEventTypeAlias).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                preCheck = `\n\t\tvar arr []json.RawMessage\n\t\tif err := json.Unmarshal(b, &arr); err != nil { return err }\n\t\tif len(arr) == 0 { return fmt.Errorf(\"empty array\") }\n\t\tvar typ map[string]interface{}\n\t\tif err := json.Unmarshal(arr[0], &typ); err != nil { return err }\n\t\tvar ev string\n\t\tif v, ok := typ[\"e\"].(string); ok { ev = v } else if evobj, ok := typ[\"event\"].(map[string]interface{}); ok { if vv, ok2 := evobj[\"e\"].(string); ok2 { ev = vv } }\n\t\tif ev != \"${esc}\" { return fmt.Errorf(\"unexpected event type\") }\n`;
              } else {
                preCheck = `\n\t\tvar arr []json.RawMessage\n\t\tif err := json.Unmarshal(b, &arr); err != nil { return err }\n\t\tif len(arr) == 0 { return fmt.Errorf(\"empty array\") }\n`;
              }
            } else {
              if (expectedEventTypeAlias) {
                const esc = String(expectedEventTypeAlias).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                preCheck = `\n\t\tvar typ map[string]interface{}\n\t\tif err := json.Unmarshal(b, &typ); err != nil { return err }\n\t\tvar ev string\n\t\tif v, ok := typ[\"e\"].(string); ok { ev = v } else if evobj, ok := typ[\"event\"].(map[string]interface{}); ok { if vv, ok2 := evobj[\"e\"].(string); ok2 { ev = vv } }\n\t\tif ev != \"${esc}\" { return fmt.Errorf(\"unexpected event type\") }\n`;
              } else {
                preCheck = `\n\t\tvar probe map[string]json.RawMessage\n\t\tif err := json.Unmarshal(b, &probe); err != nil { return err }\n\t\tif _, ok := probe[\"e\"]; !ok {\n\t\t\tvar nested map[string]json.RawMessage\n\t\t\tif raw, ok2 := probe[\"event\"]; !ok2 { return fmt.Errorf(\"missing event type\") } else {\n\t\t\t\tif err := json.Unmarshal(raw, &nested); err != nil { return err }\n\t\t\t\tif _, ok3 := nested[\"e\"]; !ok3 { return fmt.Errorf(\"missing event type\") }\n\t\t\t}\n\t\t}\n`;
              }
            }
            if (!emittedHandlerNames.has(handlerName)) {
              emittedHandlerNames.add(handlerName);
              // Compose documentation for unwrapped event
              try {
                const toArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
                const patList = [
                  ...toArr(compMsg['x-stream-pattern']),
                  ...(Array.isArray(compMsg['x-stream-patterns']) ? compMsg['x-stream-patterns'] : []),
                ].filter(Boolean).map(String);
                const exList = toArr(compMsg['x-stream-example']).filter(Boolean).map(String);
                const spList = toArr(compMsg['x-update-speed']).filter(Boolean).map(String);
                const docLines = [];
                if (patList.length) { docLines.push('// Patterns:'); patList.forEach(p => docLines.push(`//   - ${p}`)); }
                if (exList.length) { docLines.push('// Examples:'); exList.forEach(e => docLines.push(`//   - ${e}`)); }
                if (spList.length) { docLines.push('// Update speeds:'); spList.forEach(s => docLines.push(`//   - ${s}`)); }
                if (docLines.length) { content += docLines.join('\n') + `\n`; }
              } catch (e) { /* ignore doc extraction errors */ }
              content += `// Handle${handlerName} registers a handler for unwrapped event '${msgKey}' on ${nameSource}\n`;
              content += `func (ch *${channelPascal}Channel) Handle${handlerName}(fn func(context.Context, *${modelType}) error) {\n`;
              content += `\tif fn == nil { return }\n`;
              content += `\tif ch.msgHandlers == nil { ch.msgHandlers = make(map[string]func(context.Context, []byte) error) }\n`;
            if (isErrorMessageFlag) {
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tch.msgHandlers[\"${errorAliasKey}\"] = func(ctx context.Context, b []byte) error {\n`;
            } else if (expectedEventTypeAlias) {
              const alias = isArrayFormat ? `evt:${expectedEventTypeAlias}:array` : `evt:${expectedEventTypeAlias}`;
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tch.msgHandlers[\"${alias}\"] = func(ctx context.Context, b []byte) error {\n`;
            } else {
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tch.msgHandlers[\"${msgKey}\"] = func(ctx context.Context, b []byte) error {\n`;
            }
            content += preCheck;
            content += `\t\tvar v ${modelType}\n`;
            content += `\t\tif err := json.Unmarshal(b, &v); err != nil { return err }\n`;
            content += `\t\treturn fn(ctx, &v)\n`;
            content += `\t}\n`;
            content += `\tch.client.handlersMu.Unlock()\n`;
            content += `}\n`;
            // Unregister counterpart
            if (isErrorMessageFlag) {
              content += `\nfunc (ch *${channelPascal}Channel) Unregister${handlerName}() {\n`;
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tdelete(ch.msgHandlers, \"${errorAliasKey}\")\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              content += `}\n\n`;
            } else if (expectedEventTypeAlias) {
              const alias = isArrayFormat ? `evt:${expectedEventTypeAlias}:array` : `evt:${expectedEventTypeAlias}`;
              content += `\nfunc (ch *${channelPascal}Channel) Unregister${handlerName}() {\n`;
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tdelete(ch.msgHandlers, \"${alias}\")\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              content += `}\n\n`;
            } else {
              content += `\nfunc (ch *${channelPascal}Channel) Unregister${handlerName}() {\n`;
              content += `\tch.client.handlersMu.Lock()\n`;
              content += `\tdelete(ch.msgHandlers, \"${msgKey}\")\n`;
              content += `\tch.client.handlersMu.Unlock()\n`;
              content += `}\n\n`;
            }
            }
          } catch (e) { /* ignore per-msg errors */ }
        });
      }
    } catch (e) { /* ignore unwrapped generation errors */ }

    files.push(
      <File name={fileName}>
        <Text>{content}</Text>
      </File>
    );
  }

  return files;
}
