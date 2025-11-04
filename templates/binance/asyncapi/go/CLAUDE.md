# Binance AsyncAPI Go WebSocket Client Template — Assistant Notes

## Overview

This template turns any Binance AsyncAPI 3.0 document into a fully typed Go WebSocket client. All behaviour is spec-driven: channels, handlers, models, and stream builders are inferred from the specification so there is no module-specific logic or hardcoded naming. Updating the AsyncAPI document (spot, futures, options, portfolio margin, etc.) and rerunning the generator is enough to refresh the client.

## Layout

```
templates/binance/asyncapi/go/
├── README.md          # User facing instructions
├── package.json       # npm scripts + dependencies
├── template/          # AsyncAPI React templates
│   ├── client.go.js   # Core client (connection management, handlers)
│   ├── channels.js    # Per-channel files derived from spec
│   ├── models.js      # Model/materialisation orchestrator
│   ├── models/        # Shared model helpers (Go source)
│   ├── streams.go.js  # Stream helpers generated from x-stream-* metadata
│   └── README.md.js   # README emitted with the generated SDK
└── components/        # Reusable helpers used by templates
    ├── WebSocketHandlers.js
    ├── IndividualModels.js
    ├── MessageStructs.js
    └── GenericStreamsWebSocketHandlers.js
```

There is no module registry or directory-per-module logic. Everything in `components/` works across modules by interrogating the spec.

## Generation Flow

1. **Input**: AsyncAPI YAML/JSON (passed via `SPEC_FILE` or CLI arguments).
2. **Templating**: React templates call the helper components above to derive names, operations, schemas, and stream metadata.
3. **Output**: Go sources (`client.go`, per-channel files, models, stream helpers, signing utilities, README).

## Development Guidelines

- Modify React templates or helper components, never the generated Go output.
- Keep every change spec-driven; avoid adding branches keyed on module names or specific endpoints.
- Run `npm run test` after template updates to regenerate into `test/project` and build the Go code.
- When debugging, inspect the AsyncAPI document first—the templates trust the spec.
- Follow Go idioms in generated code (exported identifiers, comments, gofmt-compatible formatting).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ASYNCAPI_CLI` | Binary used to run the generator | `asyncapi` |
| `SPEC_FILE` | Path to the AsyncAPI document | `../../../../specs/binance/asyncapi/spot.yaml` |
| `OUTPUT_DIR` | Where generated files are written | `./output` |
| `MODULE_NAME` | Go module path injected via template params | `github.com/openxapi/binance-go/ws` |
| `PACKAGE_NAME` | Go package name | `spot` |
| `VERSION` | SDK version string | `0.1.0` |
| `AUTHOR` | Metadata for README/go files | `openxapi` |

## Useful npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run generate` | Generate client using current environment defaults |
| `npm run test` | Clean `test/project`, regenerate, initialise Go module, build |
| `npm run test:clean` | Remove `test/project` |
| `npm run test:generate` | Generate into `test/project` only |
| `npm run test:build` | Build previously generated project |
| `npm run example` | Generate and run `go run` inside `test/project` |

Scripts respect the environment variables listed above, so setting `SPEC_FILE` or `MODULE_NAME` once applies across the workflow.

## Template Parameters (AsyncAPI CLI)

- `moduleName` (required) – Go module path.
- `packageName` – Package for generated sources.
- `version` – SDK version for docs or go.mod if emitted.
- `author` – Metadata for README.

The generator scripts map environment variables to these parameters.

## Debugging Checklist

1. **Compare with official docs** (`samples/`): confirm parameter requirements, event naming, and authentication rules.
2. **Validate the AsyncAPI spec** (`specs/binance/asyncapi/…`): ensure messages, operations, `x-*` extensions, and enums express what the API expects.
3. **Inspect generated code** (`test/project` after running `npm run test:generate`): confirm channel files, models, and handler registration align with the spec.
4. **Update integration tests** (external repo) only after the spec and template are correct.

Common issues:
- *Missing stream handlers*: check `x-event`, `x-event-type`, and message payload schemas—handlers are derived from them.
- *Incorrect parameter coercion*: verify schema types/enums in the spec; the template mirrors whatever is defined there.
- *Auth fields absent*: ensure request payload schemas express `const`/required properties for `method`, `apiKey`, `timestamp`, etc., so the template can prepopulate them.

## Contributing Notes

- Keep source files ASCII-formatted and let gofmt handle layout.
- Document non-obvious template logic with concise comments.
- When adding helper utilities, place them under `components/` and design them to work for any AsyncAPI document.
- Regenerate `__transpiled/` artifacts only if the build tooling is part of the change; otherwise leave them untouched.

## External Tests

The canonical end-to-end tests for generated SDKs live in [`github.com/openxapi/integration-tests`](https://github.com/openxapi/integration-tests) (`binance/asyncapi/`). Use them to validate behaviour across Binance modules after spec or template changes.
