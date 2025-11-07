# Binance AsyncAPI Go WebSocket Client Template

This template generates a fully typed Go WebSocket client from any Binance AsyncAPI 3.0 specification. The entire SDK—client, channels, models, streams helpers, signing utilities, and README—derives directly from the spec, so adding or updating modules (spot, UM/CM futures, options, portfolio margin, etc.) is as simple as editing `specs/binance/asyncapi/<module>.yaml` and rerunning the generator.

## Quick Start

### Prerequisites

- Node.js 22+ (ESM support is required for AsyncAPI React templates)
- AsyncAPI CLI v2.8+ (`npm install -g @asyncapi/cli`)
- Go 1.21+

Install dependencies and verify tools:

```bash
cd templates/binance/asyncapi/go
npm install
asyncapi --version
go version
```

### Basic Generation

```bash
npm run generate
```

By default this reads `../../../../specs/binance/asyncapi/spot.yaml`, writes the SDK to `./output`, and injects the metadata below. Override any input with environment variables:

```bash
SPEC_FILE=../../../../specs/binance/asyncapi/umfutures.yaml \
OUTPUT_DIR=./dist \
MODULE_NAME=github.com/example/binance/ws \
PACKAGE_NAME=umfutures \
VERSION=0.2.0 \
AUTHOR="Example Dev" \
npm run generate
```

### Module-Aware Generation

The `generate:module` script resolves defaults from `generator-configs/binance/asyncapi/go/<MODULE>.json` when present:

```bash
# Generate UM futures client using its generator config defaults
MODULE=umfutures npm run generate:module
```

If the config is missing, it falls back to the usual environment variables.

## Available npm Scripts

| Script | Description |
|--------|-------------|
| `npm run generate` | Generate using the current `SPEC_FILE`, `OUTPUT_DIR`, and metadata environment variables. |
| `npm run generate:module` | Select a module via `MODULE=spot|umfutures|…` and use config-driven defaults when available. |
| `npm run test` | Clean `test/project`, regenerate, initialise/tidy `go.mod`, and `go build` the generated client. |
| `npm run test:clean` | Remove `test/project`. |
| `npm run test:generate` | Generate into `test/project` without building. |
| `npm run test:build` | Build the last generated project. |
| `npm run example` | Generate and run `go run ./...` inside `test/project` for a quick smoke test. |

## Environment Variables → Template Parameters

| Variable | Description | Default |
|----------|-------------|---------|
| `ASYNCAPI_CLI` | AsyncAPI CLI binary | `asyncapi` |
| `SPEC_FILE` | AsyncAPI document to render | `../../../../specs/binance/asyncapi/spot.yaml` |
| `OUTPUT_DIR` | Destination for generated files | `./output` |
| `MODULE_NAME` | Go module path (`-p moduleName=…`) | `github.com/openxapi/binance-go/ws` |
| `PACKAGE_NAME` | Go package name (`-p packageName=…`) | `spot` |
| `VERSION` | SDK version string | `0.1.0` |
| `AUTHOR` | README metadata | `openxapi` |
| `MODULE` | Module selector consumed by `npm run generate:module` | `spot` |

The corresponding AsyncAPI parameters are:

| Parameter | Required | Default | Purpose |
|-----------|----------|---------|---------|
| `moduleName` | ✅ | `github.com/openxapi/binance-go/ws` | Injected into imports (e.g., `moduleName/models`). |
| `packageName` | ❌ | `spot` | Package name for all generated Go files. |
| `version` | ❌ | `0.1.0` | Shown in README badges or `go.mod` when emitted. |
| `author` | ❌ | `openxapi` | README metadata. |

## Generated Output Structure

```
output/
├── client.go               # Shared client + dispatcher
├── server_manager.go       # Multi-server registry used by client
├── streams.go              # Stream metadata, typed params, builders
├── signing.go              # Auth/AuthType helpers + request signing utilities
├── signing_test.go         # Tests for the signing helpers
├── *_channel.go            # One file per AsyncAPI channel (connect/send/handlers)
├── models/
│   ├── models.go           # MessageID, ResponseRegistry, parsing helpers
│   └── *.go                # Per-message structs + enums
└── README.md               # Generated SDK README
```

> The exact layout of channel files depends on the spec—file names follow the channel key or address (`<channel>_channel.go`).

## Client Architecture Highlights

- **Server discovery** — `client.go` enumerates `#/servers`, builds `ServerManager`, and exposes helpers to add/update/list servers at runtime.
- **Shared connection & dispatcher** — Each `<ChannelName>Channel` reuses the client’s WebSocket connection. A mailbox + worker pool (size defaults to `runtime.NumCPU()`, configurable via `ClientOptions`) keeps the read loop non-blocking.
- **Handler registration** — Channel files expose `Handle<Event>`/`Unregister<Event>` helpers. Handler keys derive from component message names, `x-handler-key`, `x-event-type`, or `x-unwrapped-event-messages`. Combined streams register both wrapper handlers and unwrapped events.
- **RPC replies** — Operations that declare replies accept a handler pointer (`*func(ctx, *Result, error) error`). The request `id` field is used to store one-shot callbacks in `pendingByID`, and replies are classified as success/error based on the decoded payload.
- **Wrapper & error awareness** — Messages flagged with `x-wrapper`, `x-wrapper-keys`, or `x-error` are treated specially: wrapper aliases are filtered during fan-out, and error payloads short-circuit handler invocation.
- **x-no-event-type routing** — When payloads do not carry an `e` field, the client uses a generated candidate table (`noEvtCandidates`) to match objects by required/property sets.
- **Streams metadata** — `streams.go` emits `<Event>StreamPatterns`, `<Event>StreamExamples`, optional `<Event>UpdateSpeeds` with typed constants, strongly-typed `StreamParams` structs based on `x-stream-params`, and builder helpers (`Build<Event>Stream`, `Build<Event>Streams`).
- **Models package** — All payload schemas become Go structs with JSON tags. `x-go-name` overrides naming, `x-use-desc-naming` (default `true` for `x-event` payloads) allows description-derived field names, and shared helpers (`MessageID`, `ResponseRegistry`, `ParseOneOfResult`) live in `models/models.go`.
- **Signing helpers** — `signing.go` defines `Auth`, `AuthType`, `RequestSigner`, and detection helpers (`GetAuthTypeFromMessageName`, `RequiresSignature`). The helpers support HMAC, RSA, and Ed25519 signing and are covered by `signing_test.go`. Wire them into the generated send methods as needed.

## AsyncAPI Spec Extensions Used by the Template

| Extension | Location | Effect |
|-----------|----------|--------|
| `x-event` (bool) | message | Marks payloads that represent events; toggles description-based field naming and stream metadata extraction. |
| `x-event-type` | message | String or array of event codes. Drives handler keys (`evt:<value>[:array]`). |
| `x-handler-key` | message | Overrides the dispatch key used by both channel handlers and wrapper alias detection. |
| `x-wrapper`, `x-wrapper-keys` | message | Marks wrapper/envelope messages and names their `stream`/`data` fields. |
| `x-unwrapped-event-messages` | channel | Lists component messages that should also get handlers even when transported through a wrapper (combined streams). Entries can be message keys or `$ref`s. |
| `x-response-format` | message | If set to `"array"`, handler aliases gain the `:array` suffix and pre-checks expect array payloads. |
| `x-error` | message | Treat the payload as an error wrapper and route it through error handlers. |
| `x-no-event-type` | message | Generate classifier rules that match payloads without an `e` field. |
| `x-use-desc-naming` | message | Override the default description-based field naming behaviour. |
| `x-go-name` | schema property | Force a specific Go field name. |
| `x-stream-pattern`, `x-stream-patterns`, `x-stream-example`, `x-stream-params`, `x-update-speed` | message | Populate `streams.go` with pattern arrays, examples, typed params structs, and optional speed enums. |

Normal JSON Schema constructs (`enum`, `const`, `$ref`) are also honoured:
- Request payload `const` values are assigned automatically before marshalling so callers do not have to set them.
- Enum schemas become typed constants in the models package when referenced from `x-stream-params`.

## Development & Testing

1. Run `npm run test` after any template change. This wipes `test/project`, regenerates the SDK, initialises a Go module, `go mod tidy`, and `go build`s the output.
2. Use `npm run test:generate` when iterating on template output and `npm run test:build` when only Go compilation is needed.
3. `npm run example` performs generation and executes `go run ./...` inside `test/project` so you can observe runtime behaviour.
4. Keep `__transpiled/` untouched unless you intentionally rebuild the transpiled template bundle.

## Troubleshooting

- **Missing handlers:** Ensure the spec sets `x-event`/`x-event-type` (or `x-handler-key`) and that combined streams list their inner events under `x-unwrapped-event-messages`.
- **Incorrect field names:** Add `x-go-name` or adjust descriptions with `x-use-desc-naming: false` when description-derived names are undesirable.
- **Stream builder errors:** Make sure every `{placeholder}` in `x-stream-pattern` has a matching entry in `x-stream-params`, and that referenced schemas live under `#/components/schemas`.
- **Auth/signature issues:** Use the helpers in `signing.go` (`RequestSigner`, `RequiresSignature`) and confirm request payload schemas expose `apiKey`, `timestamp`, and `signature` fields with the correct types.

## Integration Tests

Cross-repo, end-to-end tests live in [`github.com/openxapi/integration-tests`](https://github.com/openxapi/integration-tests) under `binance/asyncapi/`. Use those suites to validate behaviour after updating specs or templates.
