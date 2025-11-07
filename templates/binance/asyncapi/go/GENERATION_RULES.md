# AsyncAPI Go Template Generation Rules

These rules describe how the Binance AsyncAPI Go template renders SDKs from an AsyncAPI 3.0 specification. Every identifier, file, and behaviour must be derived from the spec (including its `x-*` extensions); no module-specific branches or hardcoded stream names are allowed.

## 1. Guiding Principles

- **Spec-driven** – Servers, channels, operations, messages, `$ref`s, enums, and `x-*` extensions must be the single source of truth.
- **Exchange agnostic** – Never key templates by module name, listen-key format, or path prefix. If special handling is required, express it in the spec via metadata (`x-event`, `x-handler-key`, `x-stream-*`, etc.).
- **Deterministic output** – The same spec must always generate the same files. Avoid randomness, timestamps, or environment-specific behaviour (other than the explicit template parameters).
- **Single connection** – Generated channels share the client’s WebSocket connection and dispatch loop; there is no `Client.Connect()` convenience wrapper.

## 2. Template Entry Points

`template/index.js` exports the renderers below. Changing file responsibilities requires updating both the code and README/CLAUDE docs.

| Renderer | Responsibility |
|----------|----------------|
| `client.go.js` | Builds the shared `Client`, read loop, mailbox, handler registry, `ServerManager`, and dispatcher heuristics. |
| `server_manager.go.js` | Provides `ServerManager` + `ServerInfo` used by the client. |
| `channels.js` | Emits one `<channel>_channel.go` per AsyncAPI channel with connect/disconnect, operations, and handler registration. |
| `models.js` | Generates message/models structs, enums, and helper types from payload schemas. |
| `models/models.go.js` | Contains shared helpers (`MessageID`, `ResponseRegistry`, `ParseOneOfResult`, etc.). |
| `streams.go.js` | Produces stream metadata, typed params structs, speed enums, and builder helpers based on `x-stream-*`. |
| `signing.go.js`, `signing_test.go.js` | Emit signing helpers and their unit tests. |
| `README.md.js` | Emits the SDK README with module/package metadata. |

## 3. Client & Dispatcher Rules

1. **Server discovery** – On `NewClientWithOptions`, seed `ServerManager` entries using `#/servers`. The first server becomes active by default. URLs are trimmed and validated.
2. **ServerManager API** – Generated client must expose `AddServer`, `AddOrUpdateServer`, `RemoveServer`, `UpdateServer`, `SetActiveServer`, `GetActiveServer`, `GetServer`, `ListServers`, and `GetCurrentURL`.
3. **ClientOptions** – Currently only `HandlerWorkers` is supported. Default worker count is `runtime.NumCPU()` if unspecified.
4. **Connection lifecycle** – Channel `Connect` populates the shared `Client.conn` if nil, flips `isConnected`, registers handlers, and ensures the read loop is running. `Disconnect` tears down channel handlers and closes the shared connection through `Client.StopReadLoop`.
5. **Read loop & mailbox** – The read loop reads raw frames, pushes them into an unbounded mailbox, and worker goroutines call `dispatchMessage`. Never allow handler latency to block `ReadMessage`.
6. **Handler registry** – `Client.RegisterHandlers` stores per-channel handler maps and expands comma-separated `x-event-type` aliases (including `:array` suffixes for array payloads).
7. **Wrapper aliases** – Build `wrapperAliases` from messages flagged with `x-wrapper`/`x-handler-key`. These keys are skipped during final fan-out to avoid double-processing wrapper handlers.
8. **Dispatch order**:
   1. JSON decode envelope once.
   2. Route explicit errors first (payloads containing `error`) and fulfil pending RPC handlers by `id`.
   3. Route wrapper `stream` + `data` payloads using `x-wrapper-keys` metadata.
   4. Route `evt:*` handlers via `e` (or nested `event.e` when nested event structs exist).
   5. Route messages flagged with `x-no-event-type` using the generated candidate table (`noEvtCandidates`).
   6. Fulfil any remaining `pendingByID` handlers.
   7. Final fan-out to every registered handler except wrapper aliases.
9. **RPC replies** – `pendingByID` is a `sync.Map` keyed by request `id`. Replies call the stored handler and delete the entry before invocation.
10. **Logging** – If no handlers consume a message, log `unhandled message: …`.

## 4. Channels, Operations, and Handlers

1. **File naming** – Each AsyncAPI channel produces `<channel_key_or_address>_channel.go` (snake_case). Struct name is `<ChannelName>Channel` (PascalCase).
2. **Struct fields** – Minimum fields: `client *Client`, `isConnected bool`, `addrTemplate string`, `mu sync.RWMutex`, and `msgHandlers map[string]func(context.Context, []byte) error`.
3. **Connect** – Accepts `context.Context` plus address template params in order of appearance. Replaces `{placeholders}`, normalises `/` + query strings, dials the shared client connection if needed, sets `isConnected`, applies handlers, and starts the read loop.
4. **Disconnect** – Removes handlers, flips `isConnected`, and stops the read loop via `Client`.
5. **Send operations**:
   - Method name: `Send<OperationName>` (CamelCase of operation id/key).
   - Signature: `func (ch *FooChannel) SendBar(ctx context.Context, req *models.Baz, handler *func(ctx context.Context, *models.Reply, error) error) error` (handler pointer omitted when no reply).
   - Enforce all `const` fields declared in the payload schema before marshalling.
   - Marshal with `encoding/json` and `WriteMessage`.
   - When replies exist:
     - Require an identifiable `id` field (string or integer-ish). Store `pendingByID` handler using `fmt.Sprintf("%v", req.<IdField>)`.
     - Decode the response envelope, detect embedded errors (`error` field or explicit error message), and pass either `(result, nil)` or `(nil, error)` to the user handler.
6. **Receive operations & message handlers**:
   - `Handle<Event>` + `Unregister<Event>` are generated per message referenced by the channel (including `x-unwrapped-event-messages`).
   - Handler keys:
     - Prefer component message keys when the payload references `#/components/messages`.
     - Use `x-handler-key` when provided.
     - When `x-event-type` is present:
       - String → key `evt:<value>` (or `evt:<value>:array` when payload is an array or `x-response-format: array`).
       - Array → register one handler per value.
     - `x-unwrapped-event-messages` on the channel enumerates additional component messages (or `$ref`s) to register as handlers even if they don't appear directly in the channel’s `messages`.
   - Error payloads (`x-error: true` or schemas containing an `error` property) register under their handler key but short-circuit dispatch in `client.go`.
7. **Spec metadata** – `channels.js` must respect:
   - `x-response-format: array` → toggles `:array` suffix.
   - `x-no-event-type: true` → mark message for classifier generation.
   - `x-handler-key` on both channel-local and component messages.
   - `x-unwrapped-event-messages` arrays consisting of message keys or `$ref` strings.

## 5. Models & Schema Handling

1. **Per-message structs** – Every message payload (channel-local or component) becomes `models/<name>.go` with:
   - PascalCase struct name derived from the message key or referenced component.
   - JSON tags that honour `required` vs optional properties.
   - Field naming rules:
     - `x-go-name` (any of `x-go-name`, `x-go_name`, `x-go-Name`) overrides the field.
     - When `x-use-desc-naming` is true (defaults true for `x-event` payloads), use description text to derive the Go field name.
     - Otherwise, derive from the JSON property name.
   - Non-letter-leading names get an `X` prefix to remain exported.
2. **Schema deduplication** – Use schema signatures (sorted JSON) to avoid generating duplicates. Component schemas referenced via `$ref` should map back to their canonical file names.
3. **Nested structs & arrays** – Inline objects become anonymous structs; arrays become `[]Type` (recursing on `$ref` when necessary).
4. **MessageID type** – `models/models.go` defines `MessageID` supporting numeric, string, or null identifiers. Request models referencing `id` should use this type.
5. **ResponseRegistry** – `models/models.go` contains helpers for registering and creating event types, plus `ParseOneOfResult` scaffolding. Templates should populate the registry when the spec supplies enough metadata (currently placeholder methods exist for future enhancements).
6. **Stream param aliases** – Schema references discovered in `x-stream-params` trigger alias generation (e.g., `type DepthSpeed string` with enum constants) so `streams.go` can import `models`.

## 6. Streams Metadata

1. Consider only messages with `x-event: true`.
2. For each such message:
   - Collect `x-stream-pattern` (string) and `x-stream-patterns` (array) into `<Event>StreamPatterns`.
   - Collect `x-stream-example` values into `<Event>StreamExamples`.
   - Collect `x-update-speed` values into `<Event>UpdateSpeeds` plus typed alias `type <Event>Speed string` with constants and `Valid<Event>Speeds`.
3. Generate typed params when `x-stream-params` is present:
   - Create `<Event>StreamParams` struct with PascalCase fields.
   - Field types come from referenced component schemas (import `models` when needed). Primitive schemas map to Go primitives.
   - Provide `Values() map[string]string` to turn non-zero fields into placeholder maps.
4. Builders:
   - `Build<Event>Stream(patternIndex int, values map[string]string)` returns a single stream name.
   - `Build<Event>Streams(values map[string]string)` attempts all patterns and returns the list of successfully built streams.
   - Both helpers rely on `buildFromPattern`, which validates placeholder coverage.

## 7. Signing Utilities

- `signing.go` must emit:
  - `AuthType` (NONE, TRADE, USER_DATA, USER_STREAM, SIGNED) plus `RequiresSignature`.
  - `KeyType` (HMAC, RSA, ED25519) and `Auth` accessor/mutator helpers for secrets and private keys.
  - `RequestSigner` that:
    - Extracts auth types by parsing message names containing `(TRADE)`, `(USER_DATA)`, etc.
    - Signs payloads by lexicographically ordering parameters, adding `timestamp`, `apiKey`, and `signature`.
    - Supports HMAC-SHA256, RSA (PKCS1/PKCS8), and Ed25519.
- `signing_test.go` covers auth detection, signature generation, and error paths. Keep these tests in sync with helper changes to guarantee CLI users receive verified code.

## 8. Spec Extensions Reference

| Extension | Applied To | Purpose in Templates |
|-----------|------------|----------------------|
| `x-event` | message | Marks payloads as events (enables description-based naming, stream metadata extraction). |
| `x-event-type` | message | String or array used to generate handler keys `evt:<value>` (with `:array` when array payloads). |
| `x-handler-key` | message | Overrides the dispatch key; also affects wrapper alias detection. |
| `x-wrapper` | message | Identifies wrapper/envelope messages (values: `true`, `"combined"`, `{ type: "combined" }`). |
| `x-wrapper-keys` | message | Provides wrapper field names (`stream`, `data`). |
| `x-unwrapped-event-messages` | channel | Additional component messages (keys or `$ref`s) to register as handlers even when transported through a wrapper. |
| `x-response-format` | message | When `"array"`, handler registration expects array payloads and uses the `:array` suffix. |
| `x-error` | message | Marks payloads as error envelopes so the dispatcher short-circuits to error handlers. |
| `x-no-event-type` | message | Instructs `client.go` to build classifier entries for payloads missing `e`. |
| `x-use-desc-naming` | message | Forces/denies description-based field naming. Defaults to `true` for `x-event` payloads. |
| `x-go-name` | schema property | Overrides the Go field name for an individual property. |
| `x-stream-pattern` / `x-stream-patterns` | message | Template strings (with `{placeholders}`) for stream names. |
| `x-stream-example` | message | Example stream names matching the patterns. |
| `x-update-speed` | message | List of supported update speeds; becomes typed constants. |
| `x-stream-params` | message | Map of placeholder names to schemas. Used to generate param models, typed constants, and `StreamParams` structs. |

### x-stream-params Details

- For each entry under `x-stream-params`:
  1. Generate a model alias if the schema is a `$ref` under `#/components/schemas`. Include enum constants when present (`DepthSpeed100ms`, etc.).
  2. Add a field to `<Event>StreamParams` using that model type (or Go primitive for inline schemas).
  3. `Streams.go` imports `models` only when at least one param references a component schema.

### Wrapper & Unwrapped Messages

- Channels that carry combined streams should:
  - Flag wrapper messages with `x-wrapper` + `x-wrapper-keys`.
  - List inner events under `x-unwrapped-event-messages` (message keys or `$ref`s). The generator follows `$ref`s into `#/components/messages` and registers handlers as if the events were first-class channel messages.

### No Hardcoded Files

- Remove legacy hardcoded helpers (e.g., `SpotStreamsWebSocketHandlers.js`). All Go output must flow through `client.go`, `channels`, `models`, `streams`, and signing templates.
- Do not reintroduce global `Connect` helpers—the only connection APIs live on channel structs.

---

Implementation reminders:
- Keep templates pure (no network IO or filesystem mutations).
- Document complex transformations inline with concise comments.
- Leave `__transpiled/` untouched unless you intentionally rebuild the transpiled bundle alongside template changes.
