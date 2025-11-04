import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const moduleName = params.moduleName || 'github.com/openxapi/binance-go/ws';
  const version = params.version || '0.1.0';

  const spec = typeof asyncapi.json === 'function' ? asyncapi.json() : {};
  const servers = (spec && spec.servers) ? spec.servers : {};
  const messages = (spec && spec.components && spec.components.messages) ? spec.components.messages : {};
  const toPascalCase = (str) => {
    if (!str) return '';
    const spaced = String(str).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return spaced.split(/[^a-zA-Z0-9]+|\s+/).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  };
  const asArray = (v) => Array.isArray(v) ? v : (v != null ? [v] : []);
  const extractPlaceholders = (addr) => {
    const res = [];
    const re = /\{([^}]+)\}/g; let m;
    while ((m = re.exec(addr || '')) !== null) res.push(m[1]);
    return res;
  };
  const channelMap = (spec && spec.channels) ? spec.channels : {};
  const channelEntries = Object.entries(channelMap || {});
  const addrOf = (ch) => (ch && ch.address) || '';
  const singleEntry = channelEntries.find(([, ch]) => String(addrOf(ch)).includes('/ws')) || channelEntries[0];
  const combinedEntry = channelEntries.find(([, ch]) => String(addrOf(ch)).includes('/stream')) || channelEntries[1] || channelEntries[0];
  const userDataEntry = channelEntries.find(([, ch]) => /\{listenKey\}/.test(String(addrOf(ch)))) || null;
  const singleChanKey = singleEntry ? singleEntry[0] : '';
  const combinedChanKey = combinedEntry ? combinedEntry[0] : '';
  const userDataChanKey = userDataEntry ? userDataEntry[0] : '';
  const singleChanAddr = singleEntry ? addrOf(singleEntry[1]) : '';
  const combinedChanAddr = combinedEntry ? addrOf(combinedEntry[1]) : '';
  const userDataChanAddr = userDataEntry ? addrOf(userDataEntry[1]) : '';
  const singleChanPascal = toPascalCase(singleChanKey || 'Channel');
  const combinedChanPascal = toPascalCase(combinedChanKey || 'Channel');
  const userDataChanPascal = toPascalCase(userDataChanKey || 'UserDataStreams');
  // Derive a server URL hint from first server
  const firstServer = Object.values(servers || {})[0] || {};
  const serverHost = firstServer.host || firstServer.url || '';
  const serverProtocol = firstServer.protocol || (serverHost ? 'wss' : '');
  const serverPathname = firstServer.pathname || '';
  const serverURLHint = serverHost ? `${serverProtocol}://${serverHost}${serverPathname || ''}` : `${moduleName}`;
  const eventMetas = [];
  Object.entries(messages).forEach(([key, m]) => {
    if (!m || m['x-event'] !== true) return;
    const patterns = [ ...asArray(m['x-stream-pattern']), ...(Array.isArray(m['x-stream-patterns']) ? m['x-stream-patterns'] : []) ].filter(Boolean).map(String);
    if (!patterns.length) return;
    eventMetas.push({ name: toPascalCase(key), patterns, examples: asArray(m['x-stream-example']).filter(Boolean).map(String), speeds: asArray(m['x-update-speed']).filter(Boolean).map(String) });
  });

  const sampleEvent = eventMetas[0];
  const exampleStreams = eventMetas.flatMap(ev => ev.examples || []).filter(Boolean);
  const defaultSingleStream = exampleStreams[0] || 'btcusdt@trade';
  const defaultSecondStream = exampleStreams[1] || exampleStreams[0] || 'btcusdt@ticker';
  const hasErrorMessage = Object.values(messages || {}).some(m => m && m['x-error'] === true);
  let errorStructName = 'ErrorMessage';
  Object.entries(messages || {}).forEach(([key, m]) => {
    if (m && m['x-error'] === true) {
      errorStructName = toPascalCase(key);
    }
  });

  const singleArgs = extractPlaceholders(singleChanAddr).map(p => {
    if (p === 'streamName') return JSON.stringify(defaultSingleStream);
    if (p === 'streams') return JSON.stringify(`${defaultSingleStream}/${defaultSecondStream}`);
    if (p.toLowerCase().includes('timeunit')) return '"" // or "?timeUnit=MICROSECOND"';
    if (p.toLowerCase().includes('listenkey')) return '"<listenKey>"';
    return '""';
  }).join(', ');
  const combinedArgs = extractPlaceholders(combinedChanAddr).map(p => {
    if (p === 'streams') return JSON.stringify(`${defaultSingleStream}/${defaultSecondStream}`);
    if (p.toLowerCase().includes('timeunit')) return '"" // or "?timeUnit=MICROSECOND"';
    return '""';
  }).join(', ');

  // Discover operations to surface an accurate one-shot example (e.g., List Subscriptions)
  const compNameToStruct = {};
  try {
    const compMsgs = (spec && spec.components && spec.components.messages) ? spec.components.messages : {};
    Object.entries(compMsgs).forEach(([compKey, compMsg]) => {
      const display = (compMsg && (compMsg.name || compMsg.title)) || compKey;
      const displayPascal = toPascalCase(display);
      const structName = toPascalCase(compKey);
      if (displayPascal) compNameToStruct[displayPascal] = structName;
    });
  } catch (e) {}

  const ops = [];
  try { asyncapi.operations().forEach(op => ops.push(op)); } catch (e) {}
  function opInfoFor(pred) {
    try {
      const op = ops.find(pred);
      if (!op) return null;
      const id = (op.id && op.id()) || '';
      const methodName = toPascalCase(id || 'Send');
      let addr = '';
      try {
        let chan = null;
        if (typeof op.channel === 'function') chan = op.channel();
        else if (typeof op.channels === 'function') { const cs = op.channels(); chan = cs && cs[0]; }
        addr = chan && chan.address ? chan.address() : '';
      } catch (e) {}
      let reqStruct = 'interface{}';
      try {
        const msgs = op.messages && op.messages();
        if (msgs && msgs.length) {
          const m = msgs[0];
          const nm = m.name ? (m.name() || (m.id && m.id())) : (m.id && m.id());
          const byDisplay = compNameToStruct[toPascalCase(nm || '')];
          if (byDisplay) reqStruct = byDisplay;
        }
      } catch (e) {}
      let replyStruct = '';
      try {
        const reply = op.reply && op.reply();
        if (reply && reply.messages) {
          const rms = reply.messages();
          if (rms && rms.length) {
            const rm = rms[0];
            const rname = rm.name ? (rm.name() || (rm.id && rm.id())) : (rm.id && rm.id());
            const byDisplay = compNameToStruct[toPascalCase(rname || '')];
            if (byDisplay) replyStruct = byDisplay;
          }
        }
      } catch (e) {}
      return { id, methodName, addr, reqStruct, replyStruct };
    } catch (e) { return null; }
  }
  const listSingleOp = opInfoFor(o => {
    const id = (o.id && o.id()) || '';
    const idL = id.toLowerCase();
    let addr = '';
    try {
      let chan = null;
      if (typeof o.channel === 'function') chan = o.channel();
      else if (typeof o.channels === 'function') { const cs = o.channels(); chan = cs && cs[0]; }
      addr = chan && chan.address ? chan.address() : '';
    } catch (e) {}
    return idL.includes('listsubscriptions') && addr === singleChanAddr;
  });
  const listCombinedOp = opInfoFor(o => {
    const id = (o.id && o.id()) || '';
    const idL = id.toLowerCase();
    let addr = '';
    try {
      let chan = null;
      if (typeof o.channel === 'function') chan = o.channel();
      else if (typeof o.channels === 'function') { const cs = o.channels(); chan = cs && cs[0]; }
      addr = chan && chan.address ? chan.address() : '';
    } catch (e) {}
    return idL.includes('listsubscriptions') && addr === combinedChanAddr;
  });
  const combinedReqStruct = (listCombinedOp && listCombinedOp.reqStruct) ? listCombinedOp.reqStruct : 'ListSubscriptionsRequest';
  const combinedReplyStruct = (listCombinedOp && listCombinedOp.replyStruct) ? listCombinedOp.replyStruct : 'ListSubscriptionsResponse';
  const combinedMethodName = (listCombinedOp && listCombinedOp.methodName) ? listCombinedOp.methodName : 'ListSubscriptionsFromCombinedMarketStreams';
  const subscribeCombinedOp = opInfoFor(o => {
    const id = (o.id && o.id()) || '';
    const idL = id.toLowerCase();
    let addr = '';
    try {
      let chan = null;
      if (typeof o.channel === 'function') chan = o.channel();
      else if (typeof o.channels === 'function') { const cs = o.channels(); chan = cs && cs[0]; }
      addr = chan && chan.address ? chan.address() : '';
    } catch (e) {}
    return idL.includes('subscribe') && addr === combinedChanAddr;
  });
  const subscribeReqStruct = (subscribeCombinedOp && subscribeCombinedOp.reqStruct && subscribeCombinedOp.reqStruct !== 'interface{}')
    ? subscribeCombinedOp.reqStruct
    : 'SubscribeRequest';
  const subscribeMethodName = (subscribeCombinedOp && subscribeCombinedOp.methodName) ? subscribeCombinedOp.methodName : 'Subscribe';

  return (
    <File name="README.md">
      <Text>
{`# Binance WebSocket Streams SDK (Go)

Generated Go SDK for Binance WebSocket Streams modules (spot, futures, options, etc.). It supports connecting to single and combined streams, dynamic subscription management, typed event handlers, and helpers to build stream names from the spec-defined patterns.

Module: ${moduleName}
Version: ${version}

## Features

- Single and combined connections (/ws/{streamName}, /stream)
- Subscribe/Unsubscribe/ListSubscriptions over WebSocket
- Typed handler registration per event
- Request/reply helpers surface server errors through the handler's \`error\` parameter
- Combined-stream wrapper routing
- Stream-name builders from x-stream-pattern(s), examples, and speeds
- Server management (multiple endpoints, active server switching)

## Install

go get ${moduleName}

## Quick Start

### 1) Create client (server preloaded)

\`\`\`go
import (
  "context"
  "log"
  ws "${moduleName}"
  wsmodels "${moduleName}/models"
)

func main() {
  client := ws.NewClient()
  // Servers from the AsyncAPI spec are added automatically.
  // The first server is active by default — no setup required.
  // Optional: override or add another server
  // _ = client.AddOrUpdateServer("alt", "${serverURLHint}", "Alt Server", "Optional override")
  // _ = client.SetActiveServer("alt")

  ctx := context.Background()
  // ...
}
\`\`\`

### 2) Connect (single, combined, user data)

Connect using generated channels (per AsyncAPI channel):

- Market Streams (single): /ws/{streamName}
- Combined Market Streams: /stream?streams={streams}
- User Data Streams: /ws/{listenKey}

\`\`\`go
// Single stream channel
ch := ws.New${singleChanPascal}Channel(client)

// Register handler(s) before connect (recommended)
${sampleEvent ? `ch.Handle${sampleEvent.name}(func(ctx context.Context, ev *wsmodels.${sampleEvent.name}) error {
  log.Printf("event: %+v", ev)
  return nil
})` : `// ch.Handle<EventName>(func(ctx context.Context, ev *wsmodels.EventName) error { /* ... */ return nil })`}

// Connect (arguments depend on channel template)
if err := ch.Connect(ctx${singleArgs ? ', ' : ''}${singleArgs}); err != nil {
  log.Fatalf("connect failed: %v", err)
}

// Combined connection channel (connect first, then SUBSCRIBE)
comb := ws.New${combinedChanPascal}Channel(client)
if err := comb.Connect(ctx${combinedArgs ? ', ' : ''}${combinedArgs}); err != nil {
  log.Fatalf("connect combined failed: %v", err)
}
// User Data Streams channel (requires listenKey)
${userDataEntry ? `uds := ws.New${userDataChanPascal}Channel(client)
// Example handler
uds.HandleAccountUpdateEvent(func(ctx context.Context, ev *wsmodels.AccountUpdateEvent) error {
  log.Printf("account update: %+v", ev)
  return nil
})
// Connect with a valid listenKey (from REST userDataStream.start)
if err := uds.Connect(ctx, "<listenKey>"); err != nil {
  log.Fatalf("connect user data failed: %v", err)
}` : `// For user data streams, connect to /ws/{listenKey} on the generated user data channel`}
\`\`\`

### 3) Build stream names and subscribe

Use generated builders from stream patterns and speeds. Patterns, examples, and speeds are arrays when provided in the spec.

\`\`\`go
streams := []string{}

// Example: PartialDepthEvent has patterns like "{symbol}@depth{levels}" and "{symbol}@depth{levels}@{speed}"
if s, err := ws.BuildPartialDepthEventStream(1, map[string]string{
  "symbol": "BTC-210630-9000-P",
  "levels": "10",
  "speed":  "100ms",
}); err == nil {
  streams = append(streams, s)
}

// Or get all satisfiable variants for a given set of values
if many, err := ws.BuildTradeEventStreams(map[string]string{"symbol": "BTC-210630-9000-P"}); err == nil {
  streams = append(streams, many...)
}

// Subscribe on the active connection
subReq := &wsmodels.${subscribeReqStruct}{
  Id:     wsmodels.NewMessageIDInt64(1),
  Params: streams,
}
if err := comb.${subscribeMethodName}(ctx, subReq, nil); err != nil {
  log.Fatalf("subscribe failed: %v", err)
}
\`\`\`

### 4) One-shot request/response (example)

Most control actions use one-shot request/response via an id field. The SDK registers a one-time reply handler by id.

\`\`\`go
// Build request (method const set automatically by the SDK)
req := &wsmodels.${combinedReqStruct}{ Id: wsmodels.NewMessageIDInt64(1) }

// Define reply handler (note the error parameter)
onReply := func(ctx context.Context, res *wsmodels.${combinedReplyStruct}, wsErr error) error {
  if wsErr != nil {
${hasErrorMessage ? `    if apiErr, ok := wsErr.(*wsmodels.${errorStructName}); ok {
      log.Printf("request failed: %s", apiErr.Error())
    }
` : ''}
    return wsErr
  }
  log.Printf("active subscriptions: %+v", res.Result)
  return nil
}

// Send on combined channel (similar methods exist for single channel)
if err := comb.${combinedMethodName}(ctx, req, &onReply); err != nil {
  log.Fatalf("list subscriptions failed: %v", err)
}
\`\`\`

### 5) Wait and shutdown

\`\`\`go
// Block until read loop ends or context cancels
_ = client.Wait(ctx)

// Close and remove handlers for a channel
_ = ch.Disconnect(ctx)
\`\`\`

## Stream Builders and Metadata

For each event with patterns, the SDK generates:

- \`<Event>StreamPatterns\` (\`[]string\`)
- \`<Event>StreamExamples\` (\`[]string\`)
- \`<Event>UpdateSpeeds\` (\`[]string\`, when present)
- Builders:
  - \`Build<Event>Stream(patternIndex int, values map[string]string) (string, error)\`
  - \`Build<Event>Streams(values map[string]string) ([]string, error)\`
  - If the spec provides \`x-stream-params\`, typed param helpers are also generated:
    - \`type <Event>StreamParams struct { ... }\`
    - \`func (p <Event>StreamParams) Values() map[string]string\` to convert to placeholder values

Example (typed params and speeds where available):

\`\`\`go
// Build with speed as a regular param
s, err := ws.BuildPartialDepthEventStream(
  1,
  map[string]string{"symbol": "BTC-210630-9000-P", "levels": "10", "speed": "100ms"},
)
// Or use typed params, then convert to values
ps := ws.PartialDepthEventStreamParams{
  Symbol: "BTC-210630-9000-P",
  Levels: wsmodels.DepthLevels10,
  Speed:  wsmodels.DepthSpeed100ms, // speed is just another param when defined in x-stream-params
}
s2, err := ws.BuildPartialDepthEventStream(1, ps.Values())

// More typed params examples (types are generated from x-stream-params):
// - KlineEvent: Symbol (string), Interval (models.Interval)
ks := ws.KlineEventStreamParams{
  Symbol:   "BTC-200630-9000-P",
  Interval: wsmodels.Interval("1m"),
}
ksVals := ks.Values()
_ = ksVals

// - MarkPriceEvent: UnderlyingAsset (models.UnderlyingAsset)
mps := ws.MarkPriceEventStreamParams{UnderlyingAsset: wsmodels.UnderlyingAsset("ETH")}
_ = mps
\`\`\`

## Handler Registration

- Register per-channel event handlers using \`Handle<Event>(func(ctx, *models.Event) error)\`.
- Request/reply methods accept handlers of the form \`func(context.Context, *models.Reply, error) error\`; check the error argument before using the reply payload.
- Combined stream wrappers are routed via alias keys; unwrapped events are dispatched by event type.
- RegisterHandlers replaces the handler map for a channel key (subsequent calls overwrite the previous map for that channel).

${hasErrorMessage ? `
## Error Responses

Request/reply error payloads are decoded into \`*wsmodels.${errorStructName}\`, which implements \`error\`. Always check the handler's error argument before using the reply value:

\`\`\`go
errAware := func(ctx context.Context, res *wsmodels.${combinedReplyStruct}, wsErr error) error {
  if wsErr != nil {
    log.Printf("request failed: %v", wsErr)
    return wsErr
  }
  // handle success
  return nil
}
\`\`\`

There is no separate \`HandleErrorMessage\` hook; server errors flow directly to the request handler.
` : ''}

## Performance & Dispatch

- Incoming frames are read on a dedicated loop and dispatched asynchronously to a worker pool.
- Slow user handlers do not block \`ReadMessage()\`; an unbounded in-memory queue buffers messages between the reader and workers.
- Defaults: workers = \`runtime.NumCPU()\`. Messages are never dropped.
- Customize workers via \`NewClientWithOptions(&ws.ClientOptions{ HandlerWorkers: N })\`.

\`\`\`go
client := ws.NewClientWithOptions(&ws.ClientOptions{
  HandlerWorkers: 8,
})
\`\`\`

## Server Management

The client carries a \`ServerManager\` to manage endpoints:

- \`AddServer(name, url, title, description)\`
- \`AddOrUpdateServer(...)\`, \`UpdateServer(...)\`, \`RemoveServer(name)\`
- \`SetActiveServer(name)\`, \`GetActiveServer()\`, \`GetActiveServerURL()\`

## Selected Event Metadata

Below are selected patterns/examples/speeds from this spec. Use them with the generated builders:
`}
      </Text>
      {eventMetas.length ? (
        <Text>
{eventMetas.slice(0, 8).map(ev => {
  const pats = ev.patterns.map(p => `  - ${p}`).join('\n');
  const exs = ev.examples.length ? ev.examples.map(e => `  - ${e}`).join('\n') : '  - (none)';
  const sps = ev.speeds.length ? `\n  Update Speeds:\n${ev.speeds.map(s => `  - ${s}`).join('\n')}` : '';
  return `- ${ev.name}\n  Patterns:\n${pats}\n  Examples:\n${exs}${sps}`;
}).join('\n\n')}
        </Text>
      ) : null}
      <Text>
{`
## Notes

- For combined connections, connect without \`streams\` and use \`SUBSCRIBE\`/\`UNSUBSCRIBE\` to manage streams.
- User Data Streams use a dedicated connection (\`/ws/{listenKey}\`) and are not mixed into combined market streams.
- The SDK normalizes empty query parameters for connect paths (avoids "/stream?streams=").
- Servers from the spec are preloaded and first is active; override only if needed.
- Handlers should be registered before connect to avoid missing early messages.

## License

MIT
`}
      </Text>
    </File>
  );
}
