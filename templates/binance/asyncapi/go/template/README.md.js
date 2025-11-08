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
  const extractPlaceholders = (value) => {
    const res = [];
    const re = /\{([^}]+)\}/g;
    let match;
    while ((match = re.exec(String(value || ''))) !== null) res.push(match[1]);
    return res;
  };
  const getChannelAddress = (channel) => {
    if (!channel) return '';
    if (typeof channel.address === 'function') {
      try { return String(channel.address() || ''); } catch (e) { return ''; }
    }
    if (channel.address != null) return String(channel.address);
    if (channel.url != null) return String(channel.url);
    return '';
  };
  const getChannelTitle = (key, channel) => {
    if (channel && channel.title) return String(channel.title);
    return toPascalCase(key || 'Channel');
  };
  const normalizeAddress = (addr) => String(addr || '');
  const channelMap = (spec && spec.channels) ? spec.channels : {};
  const channelEntries = Object.entries(channelMap || {});
  const addrToKey = new Map();
  channelEntries.forEach(([key, ch]) => {
    const addr = normalizeAddress(getChannelAddress(ch));
    if (!addrToKey.has(addr)) addrToKey.set(addr, key);
  });

  const isUserDataAddress = (addr) => (String(addr || '').toLowerCase().includes('listenkey'));
  const isCombinedAddress = (addr) => {
    const lower = String(addr || '').toLowerCase();
    return lower.includes('/stream') || lower.includes('{streams}') || lower.includes('streams=');
  };
  const isSingleMarketAddress = (addr) => {
    const lower = String(addr || '').toLowerCase();
    if (!lower) return false;
    if (isUserDataAddress(lower)) return false;
    if (isCombinedAddress(lower)) return false;
    return lower.includes('/ws');
  };

  const userDataEntry = channelEntries.find(([key, ch]) => isUserDataAddress(getChannelAddress(ch))) || null;
  const singleEntry = channelEntries.find(([key, ch]) => {
    if (userDataEntry && userDataEntry[0] === key) return false;
    return isSingleMarketAddress(getChannelAddress(ch));
  }) || null;
  const combinedEntry = channelEntries.find(([key, ch]) => {
    if (userDataEntry && userDataEntry[0] === key) return false;
    if (singleEntry && singleEntry[0] === key) return false;
    return isCombinedAddress(getChannelAddress(ch));
  }) || null;
  const primaryEntry = singleEntry || channelEntries[0] || null;

  const singleChanKey = singleEntry ? singleEntry[0] : '';
  const combinedChanKey = combinedEntry ? combinedEntry[0] : '';
  const userDataChanKey = userDataEntry ? userDataEntry[0] : '';
  const primaryChanKey = primaryEntry ? primaryEntry[0] : '';

  const singleChanAddr = singleEntry ? getChannelAddress(singleEntry[1]) : '';
  const combinedChanAddr = combinedEntry ? getChannelAddress(combinedEntry[1]) : '';
  const userDataChanAddr = userDataEntry ? getChannelAddress(userDataEntry[1]) : '';
  const primaryChanAddr = primaryEntry ? getChannelAddress(primaryEntry[1]) : '';

  const singleChanPascal = toPascalCase(singleChanKey || 'Channel');
  const combinedChanPascal = toPascalCase(combinedChanKey || 'CombinedStreams');
  const userDataChanPascal = toPascalCase(userDataChanKey || 'UserDataStreams');
  const primaryChanPascal = toPascalCase(primaryChanKey || 'Channel');

  const usedChannelKeys = new Set();
  const connectLines = [];
  if (singleEntry) {
    usedChannelKeys.add(singleChanKey);
    connectLines.push(`- Market Streams (single): ${singleChanAddr || '/'}`);
  }
  if (combinedEntry) {
    usedChannelKeys.add(combinedChanKey);
    connectLines.push(`- Combined Market Streams: ${combinedChanAddr || '/stream?streams={streams}'}`);
  }
  if (userDataEntry) {
    usedChannelKeys.add(userDataChanKey);
    connectLines.push(`- User Data Streams: ${userDataChanAddr || '/ws/{listenKey}'}`);
  }
  channelEntries.forEach(([key, ch]) => {
    if (usedChannelKeys.has(key)) return;
    const addr = getChannelAddress(ch) || '/';
    connectLines.push(`- ${getChannelTitle(key, ch)}: ${addr}`);
  });
  const connectBullets = connectLines.length ? connectLines.join('\n') : '- Channels defined in the spec are exposed as Go channel structs.';

  const eventMessages = [];
  const patternEvents = [];
  Object.entries(messages || {}).forEach(([key, msg]) => {
    if (!msg || msg['x-event'] !== true) return;
    const name = toPascalCase((msg.name || msg.title || key || '').toString());
    const patterns = [
      ...asArray(msg['x-stream-pattern']),
      ...(Array.isArray(msg['x-stream-patterns']) ? msg['x-stream-patterns'] : []),
    ].filter(Boolean).map(String);
    const examples = asArray(msg['x-stream-example']).filter(Boolean).map(String);
    const speeds = asArray(msg['x-update-speed']).filter(Boolean).map(String);
    const entry = { name, patterns, examples, speeds };
    eventMessages.push(entry);
    if (patterns.length) patternEvents.push(entry);
  });
  const sampleEvent = eventMessages[0] || patternEvents[0] || null;
  const exampleStreams = patternEvents.flatMap(ev => ev.examples || []).filter(Boolean);
  const defaultSingleStream = exampleStreams[0] || 'btcusdt@trade';
  const defaultSecondStream = exampleStreams[1] || exampleStreams[0] || defaultSingleStream;

  const defaultValueForPlaceholder = (name) => {
    const lower = String(name || '').toLowerCase();
    if (lower === 'streamname') return JSON.stringify(defaultSingleStream);
    if (lower === 'streams') return JSON.stringify(`${defaultSingleStream}/${defaultSecondStream}`);
    if (lower.includes('timeunit')) return '"" // e.g., "?timeUnit=MICROSECOND"';
    if (lower.includes('listenkey')) return '"<listenKey>"';
    if (lower.includes('symbol')) return '"btcusdt"';
    if (lower.includes('pair')) return '"btcusdt"';
    if (lower.includes('speed')) return '"100ms"';
    if (lower.includes('interval')) return '"1m"';
    if (lower.includes('asset')) return '"BTC"';
    if (lower.includes('window')) return '"1h"';
    if (lower.includes('level') || lower.includes('depth')) return '"10"';
    return '""';
  };
  const connectArgsForAddress = (addr) => extractPlaceholders(addr).map(defaultValueForPlaceholder).join(', ');

  const primaryConnectArgs = primaryEntry ? connectArgsForAddress(primaryChanAddr) : '';
  const combinedConnectArgs = combinedEntry ? connectArgsForAddress(combinedChanAddr) : '';
  const userDataConnectArgs = userDataEntry ? connectArgsForAddress(userDataChanAddr) : '';

  const firstServer = Object.values(servers || {})[0] || {};
  const serverHost = firstServer.host || firstServer.url || '';
  const serverProtocol = firstServer.protocol || (serverHost ? 'wss' : '');
  const serverPathname = firstServer.pathname || '';
  const serverURLHint = serverHost ? `${serverProtocol}://${serverHost}${serverPathname || ''}` : `${moduleName}`;

  const compNameToStruct = {};
  try {
    Object.entries(messages || {}).forEach(([compKey, compMsg]) => {
      const display = (compMsg && (compMsg.name || compMsg.title)) || compKey;
      const displayPascal = toPascalCase(display);
      const structName = toPascalCase(compKey);
      if (displayPascal) compNameToStruct[displayPascal] = structName;
    });
  } catch (e) { /* ignore */ }

  const operations = [];
  try { asyncapi.operations().forEach(op => operations.push(op)); } catch (e) { /* ignore */ }
  const opIdOf = (op) => {
    try {
      if (typeof op.id === 'function') return String(op.id() || '');
      if (op.id) return String(op.id);
    } catch (e) {}
    return '';
  };
  const channelAddressForOperation = (op) => {
    try {
      let chan = null;
      if (typeof op.channel === 'function') chan = op.channel();
      else if (typeof op.channels === 'function') {
        const cs = op.channels();
        if (Array.isArray(cs)) chan = cs[0];
        else if (cs && typeof cs.values === 'function') { const arr = Array.from(cs.values()); chan = arr[0]; }
      }
      if (chan) {
        if (typeof chan.address === 'function') return String(chan.address() || '');
        if (chan.address != null) return String(chan.address);
      }
    } catch (e) {}
    return '';
  };
  const opInfoFor = (predicate) => {
    try {
      const op = operations.find(predicate);
      if (!op) return null;
      const id = opIdOf(op);
      const methodName = toPascalCase(id || 'Send');
      const addr = channelAddressForOperation(op);
      const channelKey = addrToKey.get(normalizeAddress(addr)) || '';
      let reqStruct = 'interface{}';
      try {
        if (typeof op.messages === 'function') {
          const msgs = op.messages();
          if (msgs && msgs.length) {
            const m = msgs[0];
            let nm = '';
            if (typeof m.name === 'function') nm = m.name() || '';
            else if (m.name) nm = m.name;
            else if (typeof m.id === 'function') nm = m.id() || '';
            else if (m.id) nm = m.id;
            const byDisplay = compNameToStruct[toPascalCase(nm || '')];
            if (byDisplay) reqStruct = byDisplay;
          }
        }
      } catch (e) {}
      let replyStruct = '';
      try {
        if (typeof op.reply === 'function') {
          const reply = op.reply();
          if (reply && typeof reply.messages === 'function') {
            const rms = reply.messages();
            if (rms && rms.length) {
              const rm = rms[0];
              let rname = '';
              if (typeof rm.name === 'function') rname = rm.name() || '';
              else if (rm.name) rname = rm.name;
              else if (typeof rm.id === 'function') rname = rm.id() || '';
              else if (rm.id) rname = rm.id;
              const byDisplay = compNameToStruct[toPascalCase(rname || '')];
              if (byDisplay) replyStruct = byDisplay;
            }
          }
        }
      } catch (e) {}
      return { id, methodName, addr, channelKey, reqStruct, replyStruct };
    } catch (e) { return null; }
  };

  const subscribeCombinedOp = combinedChanAddr ? opInfoFor(op => {
    const addr = channelAddressForOperation(op);
    const idL = opIdOf(op).toLowerCase();
    return normalizeAddress(addr) === normalizeAddress(combinedChanAddr) && idL.includes('subscribe');
  }) : null;
  const subscribeSingleOp = singleChanAddr ? opInfoFor(op => {
    const addr = channelAddressForOperation(op);
    const idL = opIdOf(op).toLowerCase();
    return normalizeAddress(addr) === normalizeAddress(singleChanAddr) && idL.includes('subscribe');
  }) : null;
  const listCombinedOp = combinedChanAddr ? opInfoFor(op => {
    const addr = channelAddressForOperation(op);
    const idL = opIdOf(op).toLowerCase();
    return normalizeAddress(addr) === normalizeAddress(combinedChanAddr) && idL.includes('listsubscription');
  }) : null;
  const listSingleOp = singleChanAddr ? opInfoFor(op => {
    const addr = channelAddressForOperation(op);
    const idL = opIdOf(op).toLowerCase();
    return normalizeAddress(addr) === normalizeAddress(singleChanAddr) && idL.includes('listsubscription');
  }) : null;
  const primaryNonSubscribeOp = primaryChanAddr ? opInfoFor(op => {
    const addr = channelAddressForOperation(op);
    const idL = opIdOf(op).toLowerCase();
    if (normalizeAddress(addr) !== normalizeAddress(primaryChanAddr)) return false;
    return !idL.includes('subscribe');
  }) : null;
  const fallbackPrimaryOp = primaryChanAddr ? opInfoFor(op => {
    const addr = channelAddressForOperation(op);
    return normalizeAddress(addr) === normalizeAddress(primaryChanAddr);
  }) : null;

  const subscribeOpInfo = subscribeCombinedOp || subscribeSingleOp || null;
  const subscribeChannelKey = (subscribeOpInfo && subscribeOpInfo.channelKey) ||
    (subscribeCombinedOp ? combinedChanKey :
      subscribeSingleOp ? singleChanKey :
        (combinedChanKey || singleChanKey || primaryChanKey));

  const requestOpInfo = listCombinedOp || listSingleOp || primaryNonSubscribeOp || fallbackPrimaryOp;
  const requestChannelKey = (requestOpInfo && requestOpInfo.channelKey) ||
    (listCombinedOp ? combinedChanKey :
      listSingleOp ? singleChanKey :
        primaryChanKey);

  const channelVarNameForKey = (key) => {
    if (combinedEntry && key === combinedChanKey) return 'comb';
    if (userDataEntry && key === userDataChanKey) return 'uds';
    return 'ch';
  };

  const subscribeChannelVar = channelVarNameForKey(subscribeChannelKey);
  const subscribeMethodName = subscribeOpInfo ? (subscribeOpInfo.methodName || 'Subscribe') : 'Subscribe';
  const subscribeReqStruct = (subscribeOpInfo && subscribeOpInfo.reqStruct && subscribeOpInfo.reqStruct !== 'interface{}')
    ? subscribeOpInfo.reqStruct
    : null;

  const requestChannelVar = channelVarNameForKey(requestChannelKey);
  const requestMethodName = requestOpInfo ? (requestOpInfo.methodName || 'Send') : 'Send';
  const requestReqStruct = (requestOpInfo && requestOpInfo.reqStruct && requestOpInfo.reqStruct !== 'interface{}')
    ? requestOpInfo.reqStruct
    : null;
  const requestReplyStruct = (requestOpInfo && requestOpInfo.replyStruct) ? requestOpInfo.replyStruct : '';

  const connectCodeLines = [];
  if (primaryEntry) {
    connectCodeLines.push(`// ${getChannelTitle(primaryChanKey, primaryEntry[1])} channel`);
    connectCodeLines.push(`ch := ws.New${primaryChanPascal}Channel(client)`);
    connectCodeLines.push('// Register handler(s) before connect (recommended)');
    if (sampleEvent && sampleEvent.name) {
      connectCodeLines.push(`ch.Handle${sampleEvent.name}(func(ctx context.Context, ev *wsmodels.${sampleEvent.name}) error {`);
      connectCodeLines.push('  log.Printf("event: %+v", ev)');
      connectCodeLines.push('  return nil');
      connectCodeLines.push('})');
    } else {
      connectCodeLines.push('// ch.Handle<EventName>(func(ctx context.Context, ev *wsmodels.EventName) error { return nil })');
    }
    const primaryArgsSuffix = primaryConnectArgs ? `, ${primaryConnectArgs}` : '';
    connectCodeLines.push(`if err := ch.Connect(ctx${primaryArgsSuffix}); err != nil {`);
    connectCodeLines.push('  log.Fatalf("connect failed: %v", err)');
    connectCodeLines.push('}');
  }
  if (combinedEntry) {
    if (connectCodeLines.length) connectCodeLines.push('');
    connectCodeLines.push(`// ${getChannelTitle(combinedChanKey, combinedEntry[1])} channel`);
    connectCodeLines.push(`comb := ws.New${combinedChanPascal}Channel(client)`);
    const combinedArgsSuffix = combinedConnectArgs ? `, ${combinedConnectArgs}` : '';
    connectCodeLines.push(`if err := comb.Connect(ctx${combinedArgsSuffix}); err != nil {`);
    connectCodeLines.push('  log.Fatalf("connect combined failed: %v", err)');
    connectCodeLines.push('}');
  }
  if (userDataEntry) {
    if (connectCodeLines.length) connectCodeLines.push('');
    connectCodeLines.push(`// ${getChannelTitle(userDataChanKey, userDataEntry[1])} channel (requires listenKey)`);
    connectCodeLines.push(`uds := ws.New${userDataChanPascal}Channel(client)`);
    const userDataArgsSuffix = userDataConnectArgs ? `, ${userDataConnectArgs}` : '';
    connectCodeLines.push(`if err := uds.Connect(ctx${userDataArgsSuffix}); err != nil {`);
    connectCodeLines.push('  log.Fatalf("connect user data failed: %v", err)');
    connectCodeLines.push('}');
  }
  const connectCodeBlock = connectCodeLines.length ? `\`\`\`go\n${connectCodeLines.join('\n')}\n\`\`\`` : '';

  const builderEvent = patternEvents[0] || null;
  const builderPlaceholders = builderEvent ? Array.from(new Set(builderEvent.patterns.flatMap(extractPlaceholders))) : [];
  const sampleValueForStreamPlaceholder = (name) => {
    const lower = String(name || '').toLowerCase();
    if (lower.includes('symbol') || lower.includes('pair')) return '"btcusdt"';
    if (lower.includes('asset')) return '"btc"';
    if (lower.includes('speed')) {
      if (builderEvent && builderEvent.speeds && builderEvent.speeds.length) return JSON.stringify(builderEvent.speeds[0]);
      return '"100ms"';
    }
    if (lower.includes('interval')) return '"1m"';
    if (lower.includes('window')) return '"1h"';
    if (lower.includes('limit') || lower.includes('level') || lower.includes('depth')) return '"10"';
    if (lower.includes('type')) return '"type"';
    return '"value"';
  };
  const builderParamLines = builderPlaceholders.length
    ? builderPlaceholders.map(name => `  ${JSON.stringify(name)}: ${sampleValueForStreamPlaceholder(name)},`).join('\n')
    : '  // No placeholder params required for this stream';

  let step3Section = '';
  if (patternEvents.length) {
    const builderEventName = builderEvent ? builderEvent.name : 'Event';
    const builderSingleFn = `Build${builderEventName}Stream`;
    const builderMultiFn = `Build${builderEventName}Streams`;
    const subscribeBlockLines = [];
    if (subscribeOpInfo && subscribeReqStruct) {
      subscribeBlockLines.push(`subReq := &wsmodels.${subscribeReqStruct}{`);
      subscribeBlockLines.push('  Id:     wsmodels.NewMessageIDInt64(1),');
      subscribeBlockLines.push('  Params: streams,');
      subscribeBlockLines.push('}');
      subscribeBlockLines.push(`if err := ${subscribeChannelVar}.${subscribeMethodName}(ctx, subReq, nil); err != nil {`);
      subscribeBlockLines.push('  log.Fatalf("subscribe failed: %v", err)');
      subscribeBlockLines.push('}');
    } else if (subscribeOpInfo) {
      subscribeBlockLines.push(`// Use ${subscribeChannelVar}.${subscribeMethodName} to subscribe with the appropriate request payload.`);
    } else {
      subscribeBlockLines.push('// Use the generated Subscribe/Unsubscribe helpers on the channel to manage streams.');
    }
    const subscribeBlock = subscribeBlockLines.join('\n');
    step3Section = `### 3) Build stream names and subscribe

Use the generated stream builders derived from the AsyncAPI patterns:

\`\`\`go
streams := []string{}

// Example using ${builderEventName}
if s, err := ws.${builderSingleFn}(0, map[string]string{
${builderParamLines}
}); err == nil {
  streams = append(streams, s)
}

// Generate every permutation from supplied values
if many, err := ws.${builderMultiFn}(map[string]string{
${builderParamLines}
}); err == nil {
  streams = append(streams, many...)
}

${subscribeBlock}
\`\`\`
`;
  } else {
    step3Section = `### 3) Send messages

This specification does not define stream-name patterns. Use the generated request helpers on \`${primaryChanPascal}\` (and other channels) to send operations directly. See the request/response example below for the typical flow.
`;
  }

  const hasErrorMessage = Object.values(messages || {}).some(m => m && m['x-error'] === true);
  let errorStructName = 'ErrorMessage';
  Object.entries(messages || {}).forEach(([key, m]) => {
    if (m && m['x-error'] === true) {
      errorStructName = toPascalCase(key);
    }
  });

  const requestSectionLines = [];
  if (requestOpInfo && requestReqStruct) {
    requestSectionLines.push('\`\`\`go');
    requestSectionLines.push(`req := &wsmodels.${requestReqStruct}{`);
    requestSectionLines.push('  // Populate request fields here');
    requestSectionLines.push('}');
    const handlerLines = [];
    if (requestReplyStruct) {
      handlerLines.push(`onReply := func(ctx context.Context, res *wsmodels.${requestReplyStruct}, wsErr error) error {`);
      handlerLines.push('  if wsErr != nil {');
      if (hasErrorMessage) {
        handlerLines.push(`    if apiErr, ok := wsErr.(*wsmodels.${errorStructName}); ok {`);
        handlerLines.push('      log.Printf("request failed: %s", apiErr.Error())');
        handlerLines.push('    }');
      }
      handlerLines.push('    return wsErr');
      handlerLines.push('  }');
      handlerLines.push('  log.Printf("reply: %+v", res)');
      handlerLines.push('  return nil');
      handlerLines.push('}');
      requestSectionLines.push(...handlerLines);
      requestSectionLines.push(`if err := ${requestChannelVar}.${requestMethodName}(ctx, req, &onReply); err != nil {`);
    } else {
      requestSectionLines.push(`if err := ${requestChannelVar}.${requestMethodName}(ctx, req, nil); err != nil {`);
    }
    requestSectionLines.push('  log.Fatalf("request failed: %v", err)');
    requestSectionLines.push('}');
    requestSectionLines.push('\`\`\`');
  } else {
    requestSectionLines.push('Inspect the generated client for request helpers (Subscribe, Unsubscribe, ListSubscriptions, etc.) and invoke them on the channel instance as needed.');
  }
  const requestSectionBlock = requestSectionLines.join('\n');

  const streamMetaList = patternEvents.length
    ? patternEvents.slice(0, 8).map(ev => {
        const pats = ev.patterns.map(p => `  - ${p}`).join('\n');
        const exs = ev.examples.length ? ev.examples.map(e => `  - ${e}`).join('\n') : '  - (none)';
        const sps = ev.speeds.length ? `\n  Update Speeds:\n${ev.speeds.map(s => `  - ${s}`).join('\n')}` : '';
        return `- ${ev.name}\n  Patterns:\n${pats}\n  Examples:\n${exs}${sps}`;
      }).join('\n\n')
    : '';

  return (
    <File name="README.md">
      <Text>
{`# Binance WebSocket Streams SDK (Go)

Generated Go SDK for Binance WebSocket modules (spot, market streams, user data, etc.). It supports channel helpers from the AsyncAPI spec, typed events, and request/response helpers.

Module: ${moduleName}
Version: ${version}

## Features

- Channel helpers generated directly from the AsyncAPI specification
- Subscribe/Unsubscribe/ListSubscriptions over WebSocket (when defined)
- Typed handler registration per event
- Request/reply helpers surface server errors through the handler's \`error\` parameter
- Combined-stream wrapper routing (when combined streams are available)
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

### 2) Connect

Connect using generated channels:

${connectBullets}

${connectCodeBlock}

${step3Section}

### 4) One-shot request/response (example)

${requestSectionBlock}

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
  - If the spec provides \`x-stream-params\`, typed param helpers are also generated.

${patternEvents.length ? `
## Selected Event Metadata

${streamMetaList}
` : ''}

${hasErrorMessage ? `
## Error Responses

Request/reply error payloads are decoded into \`*wsmodels.${errorStructName}\`, which implements \`error\`. Always check the handler's error argument before using the reply value.
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

## Notes

- For combined connections (when defined), connect without \`streams\` and use \`SUBSCRIBE\`/\`UNSUBSCRIBE\` to manage streams.
- User Data Streams use a dedicated connection (\`/ws/{listenKey}\`) when present and are not mixed into combined market streams.
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
