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
  const singleChanKey = singleEntry ? singleEntry[0] : '';
  const combinedChanKey = combinedEntry ? combinedEntry[0] : '';
  const singleChanAddr = singleEntry ? addrOf(singleEntry[1]) : '';
  const combinedChanAddr = combinedEntry ? addrOf(combinedEntry[1]) : '';
  const singleChanPascal = toPascalCase(singleChanKey || 'Channel');
  const combinedChanPascal = toPascalCase(combinedChanKey || 'Channel');
  const singleArgs = extractPlaceholders(singleChanAddr).map(p => {
    if (p === 'streamName') return '"btcusdt@trade"';
    if (p === 'streams') return '"btcusdt@trade/btcusdt@ticker"';
    if (p.toLowerCase().includes('timeunit')) return '"" // or "?timeUnit=MICROSECOND"';
    if (p.toLowerCase().includes('listenkey')) return '"<listenKey>"';
    return '""';
  }).join(', ');
  const combinedArgs = extractPlaceholders(combinedChanAddr).map(p => {
    if (p === 'streams') return '"btcusdt@trade/btcusdt@ticker"';
    if (p.toLowerCase().includes('timeunit')) return '"" // or "?timeUnit=MICROSECOND"';
    return '""';
  }).join(', ');
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
- Combined-stream wrapper routing
- Stream-name builders from x-stream-pattern(s), examples, and speeds
- Server management (multiple endpoints, active server switching)

## Install

go get ${moduleName}

## Quick Start

### 1) Create client and configure server

\`\`\`go
import (
  "context"
  "log"
  ws "${moduleName}"
  wsmodels "${moduleName}/models"
)

func main() {
  client := ws.NewClient()

  // Add a server and activate it (edit URL as needed)
  _ = client.AddOrUpdateServer(
    "mainnet",
    "${serverURLHint}",
    "Binance WebSocket Server",
    "Mainnet WebSocket server",
  )
  _ = client.SetActiveServer("mainnet")
  ctx := context.Background()
  // ...
}
\`\`\`

### 2) Connect (single stream or combined)

Connect using generated channels (per AsyncAPI channel):

- Single stream: /ws/{streamName}
- Combined: /stream?streams={streams}

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
\`\`\`

### 3) Build stream names and subscribe

Use generated builders from stream patterns and speeds.

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
if err := client.Subscribe(ctx, streams); err != nil {
  log.Fatalf("subscribe failed: %v", err)
}
\`\`\`

### 4) Wait and shutdown

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

Example (typed speeds where available):

\`\`\`go
// Build with speed as a regular param
s, err := ws.BuildPartialDepthEventStream(
  1,
  map[string]string{"symbol": "BTC-210630-9000-P", "levels": "10", "speed": "100ms"},
)
// Or use typed params, then convert to values
ps := ws.PartialDepthEventStreamParams{
  Symbol: "BTC-210630-9000-P",
  Levels: 10,
  Speed:  "100ms", // speed is just another param when defined in x-stream-params
}
s2, err := ws.BuildPartialDepthEventStream(1, ps.Values())
\`\`\`

## Handler Registration

- Register per-channel handlers using \`Handle<Event>(func(ctx, *models.Event) error)\`.
- Combined stream wrappers are routed via alias keys; unwrapped events are dispatched by event type.
- RegisterHandlers replaces the handler map for a channel key (subsequent calls overwrite the previous map for that channel).

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
- The SDK normalizes empty query parameters for connect paths (avoids "/stream?streams=").
- Handlers should be registered before connect to avoid missing early messages.

## License

MIT
`}
      </Text>
    </File>
  );
}
