# AsyncAPI Go Template Generation Rules

This document defines how the Go WebSocket SDK templates generate code from an AsyncAPI 3.0 specification. It replaces hardcoded, exchange‑specific templates with a generic, spec‑driven approach. Use `specs/binance/asyncapi/options-streams.yaml` as a reference example while ensuring the logic remains generic and reusable for any exchange/spec.

## 0. Remove Existing Connect Methods
- Remove all top‑level `Connect`, `ConnectXxx`, and exchange/module‑specific connection helpers from current templates.
- Connection methods are generated only on per‑channel structs (see Rule 2). There is no global "catch‑all" `Client.Connect()` API.

## 1. Template Principles (Generic, Not Hardcoded)
- Do not hardcode exchange names, module names, stream names, or path patterns.
- All identifiers, files, and functions are derived from the AsyncAPI spec:
  - Servers: `#/servers/*`
  - Channels: `#/channels/*` (address + parameters)
  - Operations: `#/operations/*` with fields `action`, `channel`, `messages`, `reply.messages`
  - Messages: `#/channels/*/messages/*` and any `$ref`ed message components
- Naming is computed from spec keys/titles using consistent casing rules (see Rule 5).

## 2. Channels → Dedicated Types and Files
For each channel under `#/channels`:
- Generate a dedicated Go file containing a channel struct and methods:
  - File name: `<channel_sanitized>_channel.go` (lower snake_case from channel key or address).
  - Struct name: `<ChannelName>Channel` (CamelCase from channel key or address).
- The channel struct holds:
  - A reference to a shared low‑level WebSocket client/conn manager.
  - Channel address template (string), plus resolved server URL.
  - Registered handlers for messages associated with this channel (see Rule 4 and 6).
- Generate the following methods on the channel struct:
  - `Connect(ctx context.Context, <addressParams...>) error`
    - If the channel address declares template variables, add them as method parameters in order of appearance.
    - Resolve server URL + channel address (after applying params) and establish the connection.
    - Store connection state so message dispatching routes to this channel.
  - `Disconnect(ctx context.Context) error`
    - Gracefully close the underlying connection (if owned) and update state.
- If a server selection or variables are needed, prefer parameters on the channel constructor or Connect signature rather than global helpers.

## 3. Operations → Methods on Channel Structs
All operations under `#/operations` are attached to the channel referenced by their `channel` field.

3.1 Binding
- Resolve the operation’s `channel` to its generated `<ChannelName>Channel` struct.

3.2 Action `send`
- Generate an exported method on the bound channel struct for the operation.
  - Method name: `Send<OperationName>` (OperationName in CamelCase from operation key/id) or a verb‑first name if available.
  - Method parameters are based on the operation’s `messages` payload schema (request payload). Include any headers/properties needed by the protocol.
  - Serialize and send the message over the channel connection.
 - If the request payload schema (typically a component message referring to a `#/components/schemas/...`) contains top‑level properties with a `const` constraint, set those fields on the request object inside the generated method before marshalling. For example, if `method` has `const: SET_PROPERTY`, the generated send method must include `req.Method = "SET_PROPERTY"` so callers are not required to set it themselves. This applies for all channels that use that request schema.
- If `reply.messages` exists:
  - For each reply message, generate a handler registration method on the channel struct named `Handle<ReplyMessageName>(handler func(ctx context.Context, msg *<ModelType>) error)`.
  - The model type is generated per Rule 4.

3.3 Action `receive`
- For each message in the operation’s `messages`:
  - Add the message schema to the channel’s parsing/dispatch table.
  - Generate a handler registration method on the channel struct named `Handle<MessageName>(handler func(ctx context.Context, msg *<ModelType>) error)`.

## 4. Messages → Models in Dedicated Files
For each message defined under `#/channels/*/messages/*` (and any referenced component messages used by operations):
- Generate a model in a dedicated `.go` file under the generated `models` package.
  - File name: `<channel>_<message>_model.go` (lower snake_case).
  - Struct name: `<ChannelName><MessageName>` where both parts are CamelCase.
- The model struct is produced from the AsyncAPI message payload schema, including JSON tags and proper Go types.
- If the same message schema is used across multiple channels, deduplicate models by fully‑qualified `$id`/`name` when available; otherwise fallback to `<ChannelName><MessageName>` uniqueness.
 - Array payloads: when a message payload is an array, generate a slice type alias.
   - If `items` is `$ref: #/components/schemas/FooItem`, also emit a `FooItem` struct model from that schema and define `type Foo []FooItem`.
   - If `items` is an inline object schema, emit an inline item struct named `<Foo>Item` in the same file and define `type Foo []<Foo>Item`.
   - If `items` is a primitive, define `type Foo []<primitive>`.

## 5. Naming & File Conventions
- Channel name source: prefer the channel key (object key under `#/channels`). If only an address is present, sanitize the address pattern (strip `{}`, `/`, `@`, `:` etc.) to compute a stable name.
- Message name source: message object key under `messages`. If using `$ref`, use the referenced name.
- Casing:
  - Structs, exported methods, handler names: CamelCase.
  - Files: lower snake_case.
- Examples:
  - Channel `ticker` → file `ticker_channel.go`, struct `TickerChannel`.
  - Message `trade` on channel `ticker` → file `ticker_trade_model.go`, struct `TickerTrade`.
  - Handler method → `HandleTrade(...)` on `TickerChannel`.

## 6. Handlers & Dispatching
- Each channel struct registers handlers into the client dispatcher. Handlers include a lightweight pre‑check that filters frames before full unmarshal.
- Dispatch strategy:
  - For event messages (`x-event: true`): pre‑check reads `e` (event type) and compares to the schema’s `e.const` (or `x-event-type`). Only matching events are unmarshalled and handled.
  - For combined streams wrapper: pre‑check requires presence of the wrapper keys declared in spec (see x‑extensions below). Defaults are `stream` and `data` when not provided.
  - For RPC responses/errors: pre‑check inspects top‑level fields to reduce false positives:
    - Error: must contain `error`.
    - List subscriptions: `result` must be an array.
    - Get property: `result` must exist (boolean or string in spec).
    - Null‑ack responses (subscribe/unsubscribe/setProperty): `result` must exist (null). These are indistinguishable by payload; apps should register the specific reply they need for their flow.
- The client read loop invokes all registered handlers; only those whose pre‑check passes will run, avoiding mis‑dispatch from permissive JSON unmarshalling.

## 7. Connection & Server Resolution
- A small, generic, shared client/conn manager is generated (single file) to:
  - Manage server selection and variables from `#/servers`.
  - Create WebSocket dials given a resolved URL.
  - Provide a `New<ChannelName>Channel(client *Client)` constructor for each channel.
- Do not generate exchange‑specific helpers. All resolution is driven by the spec.

## 8. Validation & Example Spec
- The generation should support `specs/binance/asyncapi/options-streams.yaml` without special‑casing.
- Ensure that channels with path variables (e.g., stream path, time unit) surface those variables as parameters on `Connect`.
- Ensure both `send` and `receive` operations attach correctly to their channels and expose the right handler registration methods.

## 9. Backward Compatibility
- Remove legacy hardcoded files such as `SpotStreamsWebSocketHandlers.js`, `OptionsStreamsWebSocketHandlers.js`, etc.
- Migrate any remaining references to the new per‑channel API surface. There should be no top‑level `Connect*` methods in generated code.

---

Implementation note:
- Keep the templates exchange‑agnostic and let the generator pass spec data structures into the template.
- Favor small, composable template partials for channels, operations, and models to keep responsibilities clear and testable.

### Spec Extensions Used by Templates

- `x-wrapper` (on a Message): marks a message as an envelope/wrapper.
  - Values: `true` | `"combined"` | `{ type: "combined" }`.
- `x-wrapper-keys` (on a Message): names the wrapper fields.
  - Example: `{ stream: "stream", data: "data" }`.
- `x-handler-key` (on a Message): explicit key used by client/channel dispatch for that message.
  - Example: `wrap:combined`.
- `x-unwrapped-event-messages` (on a Channel): list of messages that should also generate unwrapped event handlers on that channel (useful for combined streams that carry inner events). Entries may be any of:
  - Component message keys (e.g., `bookTickerEvent`),
  - `$ref` strings to `#/components/messages/*`, or
  - `$ref` strings to channel messages under `#/channels/*/messages/*` (which may in turn `$ref` a component message).
  The generator resolves the entry to the underlying message definition and builds handlers just like regular events, including required-field validation for `x-no-event-type` messages.
  - Example: `["newSymbolInfoEvent", "openInterestEvent", ...]`.
- `x-use-desc-naming` (on a Message): controls whether field names in generated models use description-based naming instead of JSON keys.
  - When absent, defaults to `true` for messages with `x-event: true`, otherwise `false`.
  - Set to `false` for wrapper/envelope messages like combined stream wrappers so fields stay as `Stream`, `Data`, etc.

- `x-stream-pattern` / `x-stream-patterns` (on a Message): one or more stream name templates with `{placeholders}` used to construct subscription names.
  - Example: `['{symbol}@depth{levels}', '{symbol}@depth{levels}@{speed}']`
  - The generator emits `<Event>StreamPatterns []string` and `<Event>StreamExamples []string` in `streams.go`, along with builder helpers.

- `x-stream-example` (on a Message): example stream names corresponding to `x-stream-pattern`.
  - Emitted as `<Event>StreamExamples []string`.

- `x-update-speed` (on a Message): list of supported update speeds for events that support a speed suffix.
  - Emitted as `<Event>UpdateSpeeds []string`. Speed is treated as a normal placeholder (no special builder).

- `x-stream-params` (on a Message): map of placeholder names to parameter schemas (often `$ref` to `#/components/schemas/*`).
  - Example:
    ```yaml
    x-stream-params:
      symbol:          { $ref: '#/components/schemas/symbol' }
      levels:          { $ref: '#/components/schemas/depthLevels' }
      speed:           { $ref: '#/components/schemas/depthSpeed' }
    ```
  - Generation effects:
    1) Param models (in `models/`): For every schema referenced by `x-stream-params`, generate an alias type + enum constants when applicable.
       - `symbol`          → models/symbol.go: `type Symbol string`
       - `underlyingAsset` → models/underlying_asset.go: `type UnderlyingAsset string`
       - `expirationDate`  → models/expiration_date.go: `type ExpirationDate string`
       - `interval`        → models/interval.go: `type Interval string`
       - `depthLevels`     → models/depth_levels.go: `type DepthLevels int` with enum constants
       - `depthSpeed`      → models/depth_speed.go: `type DepthSpeed string` with enum constants
    2) Typed stream params (in `streams.go`): For each event/message, generate a typed params struct derived from `x-stream-params` named `<Event>StreamParams` with fields of the referenced param model type (or primitive when not `$ref`).
       - Adds a helper `func (p <Event>StreamParams) Values() map[string]string` to convert typed params into a placeholder map for builders.
    3) Builders: Use `Build<Event>Stream(idx, p.Values())` or `Build<Event>Streams(p.Values())`. Speed is just another param.

  - Notes:
    - Non-primitive schemas (objects/arrays) are not aliased as param models here; those are handled by the general model generator.
    - Enum values from the schema result in typed constants: e.g., `DepthSpeed100ms`, `DepthLevels10`.
