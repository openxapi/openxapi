# Binance AsyncAPI Go WebSocket Client Template — Assistant Notes

## Overview

This template converts any Binance AsyncAPI v3 document into a typed Go WebSocket SDK. All identifiers, files, and behaviours are derived directly from the spec: servers, channels, operations, payload schemas, and `x-*` extensions drive every decision. Updating `specs/binance/asyncapi/{module}.yaml` and rerunning the generator is the only required step to refresh the SDK for spot, UM/CM futures, options, portfolio margin, or any future module.

## Directory Layout

```
templates/binance/asyncapi/go/
├── README.md                 # User-facing instructions
├── package.json              # npm scripts + generator metadata
├── template/                 # AsyncAPI React entry points
│   ├── index.js              # Exports all renderers
│   ├── client.go.js          # Shared client, server manager bootstrap, dispatcher
│   ├── channels.js           # Per-channel Go files (connect/send/handlers)
│   ├── models.js             # Payload + helper model generation
│   ├── models/models.go.js   # Shared models package utilities (MessageID, registry)
│   ├── server_manager.go.js  # Multi-server registry used by the generated client
│   ├── signing.go.js         # Auth/AuthType helpers + request signing utilities
│   ├── signing_test.go.js    # Unit tests for signing helpers
│   ├── streams.go.js         # Stream metadata + builders derived from x-stream-* fields
│   └── README.md.js          # README emitted with each generated SDK
├── components/               # Legacy helper partials kept for reference (not wired in)
└── __transpiled/             # Optional transpiled bundle produced by AsyncAPI CLI (leave untouched)
```

Only the React templates inside `template/` are executed by the AsyncAPI generator. The `components/` directory holds older generic helpers; keep them for historical reference but do not add new logic there unless they are re-wired through `template/index.js`.

## Template Entry Points

- `template/index.js` exports all renderers so `asyncapi generate fromTemplate …` produces the complete SDK in one run.
- `client.go.js` builds the shared `Client` type. It:
  - Instantiates `ServerManager` entries derived from `#/servers`.
  - Exposes `ClientOptions` (currently `HandlerWorkers`) to tune the dispatch pipeline.
  - Registers channel handler maps via `RegisterHandlers` and expands comma-delimited `x-event-type` aliases.
  - Creates an unbounded mailbox + worker pool so JSON parsing/dispatch never blocks the WebSocket read loop.
  - Tracks RPC-style replies via `pendingByID`, routes wrapper responses using `x-handler-key`, and falls back to `x-no-event-type` heuristics when an `e` field is absent.
  - Understands `x-wrapper`, `x-wrapper-keys`, `x-error`, and `x-unwrapped-event-messages` to unwrap combined streams.
- `channels.js` emits one Go file per channel. Each file contains:
  - `<ChannelName>Channel` struct with `Connect`, `Disconnect`, handler registration, and per-operation send helpers.
  - Automatic substitution for address path params, query normalization, and shared connection reuse through `Client`.
  - Operation methods (`SendFoo`) that enforce schema `const` values, marshal payloads, and (when replies exist) register one-shot callbacks keyed by the payload `id`.
  - `Handle<Event>` / `Unregister<Event>` helpers whose keys are driven by component message names, `x-handler-key`, `x-event-type`, or `x-unwrapped-event-messages`.
- `models.js` + `models/models.go.js` create the `models` package:
  - Every message payload (channel-local or component) becomes a Go struct with JSON tags, deduplicated via schema signatures.
  - Description-based field naming is used for `x-event` payloads unless overridden by `x-go-name`.
  - Shared helpers such as `MessageID`, `ResponseRegistry`, and `ParseOneOfResult` live in `models.go`.
- `streams.go.js` inspects component messages flagged with `x-event` and stream metadata (`x-stream-pattern`, `x-stream-example`, `x-stream-params`, `x-update-speed`) to produce stream constants, typed params structs, and builder functions.
- `signing.go.js` and `signing_test.go.js` ship helper types (`Auth`, `RequestSigner`, `AuthType`, `RequiresSignature`) plus tests. Generation scans request message names to discover which auth types exist so consumers can wire signing into their workflow.
- `README.md.js` renders the SDK README with module/package metadata passed via template params.

## Generation Flow

1. **Input** — The AsyncAPI CLI feeds the selected spec (default `specs/binance/asyncapi/spot.yaml`) into `template/index.js`.
2. **Rendering** — Each React renderer inspects the spec via `asyncapi.*()` helpers plus raw JSON access to consume `x-*` extensions.
3. **Output** — Go sources (`client.go`, `server_manager.go`, `streams.go`, `signing.go`, per-channel files, and `models/`), plus README and signing tests, are written to `OUTPUT_DIR`.

## Development Workflow

- Edit the React templates; never edit generated Go code inside `output/` or `test/project`.
- Keep logic spec-driven. Avoid conditionals on module names, listen-key formats, or hardcoded stream names—derive everything from the spec.
- After modifications run `npm install` (if dependencies changed) and `npm run test` to regenerate into `test/project`, initialise a `go.mod`, and `go build` the output.
- The generator trusts the spec. When debugging, inspect `specs/binance/asyncapi/*.yaml` and ensure `x-event`, `x-handler-key`, `x-stream-*`, enums, and consts express the intended behaviour.

## Environment Variables & Scripts

| Variable | Purpose | Default |
|----------|---------|---------|
| `ASYNCAPI_CLI` | AsyncAPI CLI binary | `asyncapi` |
| `SPEC_FILE` | Spec to generate from | `../../../../specs/binance/asyncapi/spot.yaml` |
| `OUTPUT_DIR` | Destination for generated files | `./output` |
| `MODULE_NAME` | Go module path (`-p moduleName`) | `github.com/openxapi/binance-go/ws` |
| `PACKAGE_NAME` | Go package name (`-p packageName`) | `spot` |
| `VERSION` | SDK version/README badge | `0.1.0` |
| `AUTHOR` | README metadata | `openxapi` |
| `MODULE` | Convenience selector for `npm run generate:module` | `spot` |

| Script | Description |
|--------|-------------|
| `npm run generate` | Generate using the current env var overrides. |
| `npm run generate:module` | Resolve defaults from `generator-configs/binance/asyncapi/go/<MODULE>.json` if available, then run `asyncapi generate …`. |
| `npm run test` | Clean `test/project`, regenerate, initialise/tidy `go.mod`, and `go build` the sample client. |
| `npm run test:clean` | Remove `test/project`. |
| `npm run test:generate` | Generate into `test/project` without building. |
| `npm run test:build` | Build whatever is currently under `test/project`. |
| `npm run example` | Generate and run `go run ./...` within `test/project`. |

## Spec-Driven Behaviours Worth Knowing

- **Servers** — `client.go` inspects `#/servers` and seeds `ServerManager`. Template substitutions inside server URLs are resolved through `ServerManager.ResolveServerURL`.
- **Handlers** — Messages with `x-event-type` (string or array) generate handler aliases `evt:<value>` (and `evt:<value>:array` for array payloads). `x-handler-key` overrides the dispatch key entirely. `x-unwrapped-event-messages` on a channel enumerates additional component messages that should be handled even when wrapped inside combined streams.
- **Wrappers & Errors** — `x-wrapper`, `x-wrapper-keys`, and `x-error` influence wrapper aliasing and error dispatch. Wrapper alias keys are registered globally (`wrapperAliases`) to avoid duplicate handler invocation.
- **No-event payloads** — Messages marked with `x-no-event-type` build a field-score classifier so the client can route payloads that lack an `e` field.
- **Streams** — `x-stream-pattern`, `x-stream-example`, `x-stream-params`, and `x-update-speed` populate `streams.go` with typed params structs, speed enums, and builder helpers.
- **Models** — `x-go-name` or `x-go-name` style hints override default Go field names. When absent, `x-use-desc-naming` (defaults `true` for `x-event` messages) allows description-driven field names to keep generated structs ergonomic.
- **RPC replies** — Operations that declare replies cause `channels.js` to accept a handler pointer. The handler is invoked when a response arrives with the matching `id`, and receives either a parsed reply model or a decoded error wrapper.

## Debugging Checklist

1. Compare the AsyncAPI document with the official Binance docs (`samples/` holds cached copies). Ensure required params, enums, and consts are correct.
2. Run `npm run test:generate` and inspect `test/project` to see exactly what the template emitted.
3. Use `npm run test:build` or `npm run example` to compile/run the generated client.
4. When a handler is missing, double-check `x-event`, `x-handler-key`, `x-event-type`, and `x-unwrapped-event-messages`.
5. For stream builder issues, verify every placeholder is declared under `x-stream-params` and that component schemas are unique/dereferenceable.

## Contributing Notes

- Keep files ASCII and let gofmt format generated Go.
- Document complex template logic inline with concise comments.
- Leave `__transpiled/` untouched unless you intentionally regenerate the transpiled bundle as part of the change.
- Prefer pure React/JS helpers; avoid shelling out or performing speculative filesystem IO inside templates.

## External Tests

Full end-to-end coverage for the generated SDKs lives in [`github.com/openxapi/integration-tests`](https://github.com/openxapi/integration-tests) under `binance/asyncapi/`. Update those tests only after the underlying spec and templates are correct.
