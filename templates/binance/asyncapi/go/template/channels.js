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
    content += `\t"log"\n`;
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

    // Disconnect closes the shared client connection and removes handlers for this channel
    content += `// Disconnect closes the underlying client connection and removes channel handlers\n`;
    content += `func (ch *${channelPascal}Channel) Disconnect(ctx context.Context) error {\n`;
    content += `\tch.mu.Lock()\n`;
    content += `\tdefer ch.mu.Unlock()\n`;
    content += `\t// remove handlers for this channel\n`;
    content += `\tch.client.handlersMu.Lock()\n`;
    content += `\tdelete(ch.client.handlers, "${nameSource}")\n`;
    content += `\tch.client.handlersMu.Unlock()\n`;
    content += `\t// close client connection\n`;
    content += `\tch.client.connMu.Lock()\n`;
    content += `\tif ch.client.conn != nil { _ = ch.client.conn.Close(); ch.client.conn = nil }\n`;
    content += `\tch.client.isConnected = false\n`;
    content += `\tch.client.connMu.Unlock()\n`;
    content += `\tch.isConnected = false\n`;
    content += `\treturn nil\n`;
    content += `}\n\n`;

    // Shared read loop is managed by Client; this channel only registers handlers.

    // Generate send operation methods
    sendOps.forEach(op => {
      const opId = op.id ? op.id() : '';
      const opName = toPascalCase(opId || 'Send');
      // Extract first request message payload type name
      let reqModelName = 'interface{}';
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
        }
      } catch (e) {}

      content += `// ${opName} sends a message for operation '${opId}' on ${nameSource}\n`;
      content += `func (ch *${channelPascal}Channel) ${opName}(ctx context.Context, req *${reqModelName}) error {\n`;
      content += `\tch.client.connMu.RLock()\n`;
      content += `\tconn := ch.client.conn\n`;
      content += `\tch.client.connMu.RUnlock()\n`;
      content += `\tif conn == nil { return fmt.Errorf("not connected") }\n`;
      content += `\tdata, err := json.Marshal(req)\n`;
      content += `\tif err != nil { return fmt.Errorf("marshal request: %w", err) }\n`;
      content += `\treturn conn.WriteMessage(websocket.TextMessage, data)\n`;
      content += `}\n\n`;

      // Reply handlers if any
      try {
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
              content += `// Handle${handlerName} registers a handler for replies of '${opId}'\n`;
              content += `func (ch *${channelPascal}Channel) Handle${handlerName}(fn func(context.Context, *${modelType}) error) {\n`;
              content += `\tif ch.msgHandlers == nil { ch.msgHandlers = make(map[string]func(context.Context, []byte) error) }\n`;
              content += `\tch.msgHandlers["${rName}"] = func(ctx context.Context, b []byte) error {\n`;
              content += `\t\tvar v ${modelType}\n`;
              content += `\t\tif err := json.Unmarshal(b, &v); err != nil { return err }\n`;
              content += `\t\treturn fn(ctx, &v)\n`;
              content += `\t}\n`;
              content += `}\n\n`;
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
            const handlerName = toPascalCase(mName || 'Message');
            const displayPascal = toPascalCase(mName || '');
            const byDisplay = compNameToStruct[displayPascal];
            const byKey = chanMsgKeyToStruct[handlerName];
            const resolvedStruct = byKey || byDisplay;
            const modelType = resolvedStruct ? `models.${resolvedStruct}` : `models.${toPascalCase(channelPascal + (mName || 'Message'))}`;
            content += `// Handle${handlerName} registers a handler for message '${mName}' on ${nameSource}\n`;
            content += `func (ch *${channelPascal}Channel) Handle${handlerName}(fn func(context.Context, *${modelType}) error) {\n`;
            content += `\tif ch.msgHandlers == nil { ch.msgHandlers = make(map[string]func(context.Context, []byte) error) }\n`;
            content += `\tch.msgHandlers["${mName}"] = func(ctx context.Context, b []byte) error {\n`;
            content += `\t\tvar v ${modelType}\n`;
            content += `\t\tif err := json.Unmarshal(b, &v); err != nil { return err }\n`;
            content += `\t\treturn fn(ctx, &v)\n`;
            content += `\t}\n`;
            content += `}\n\n`;
          });
        }
      } catch (e) {}
    });

    files.push(
      <File name={fileName}>
        <Text>{content}</Text>
      </File>
    );
  }

  return files;
}
