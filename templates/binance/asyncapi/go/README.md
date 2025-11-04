# Binance AsyncAPI Go WebSocket Client Template

This AsyncAPI template generates a **Go WebSocket client** for Binance. All code is produced directly from the AsyncAPI 3.0 specification – no module-specific logic or hardcoded handlers are embedded in the templates. Whenever the spec changes (for spot, futures, options, portfolio margin, or any future module), rerun the generator and the client adapts automatically.

## Quick Start

### Prerequisites

- Node.js 22+ (LTS recommended for ES module compatibility)
- AsyncAPI CLI v2.8+
- Go 1.21+

Install AsyncAPI CLI:

```bash
npm install -g @asyncapi/cli
```

### Basic Generation

```bash
npm run generate
```

By default the script reads `../../../../specs/binance/asyncapi/spot.yaml` and writes the client to `./output` using the module/package metadata shown below. Override any of the inputs with environment variables when needed. Every file that is produced – channels, handlers, models, and stream helpers – is inferred from the spec structure.

### Custom Generation

```bash
# Pick a different spec (e.g. USD-M futures)
SPEC_FILE=../../../../specs/binance/asyncapi/umfutures.yaml npm run generate

# Change where files are written
OUTPUT_DIR=./dist npm run generate

# Override module metadata
MODULE_NAME=github.com/example/binance/ws \
PACKAGE_NAME=binancews \
VERSION=0.2.0 \
AUTHOR="Example Dev" \
npm run generate

# Use a specific AsyncAPI CLI binary
ASYNCAPI_CLI=/usr/local/bin/asyncapi MODULE_NAME=github.com/example/binance/ws npm run generate
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ASYNCAPI_CLI` | AsyncAPI CLI command | `asyncapi` |
| `SPEC_FILE` | Path to AsyncAPI specification | `../../../../specs/binance/asyncapi/spot.yaml` |
| `OUTPUT_DIR` | Output directory for generated code | `./output` |
| `PACKAGE_NAME` | Go package name | `spot` |
| `MODULE_NAME` | Go module name | `github.com/openxapi/binance-go/ws` |
| `AUTHOR` | Author name | `openxapi` |

## Template Parameters

The template supports the following parameters:

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `moduleName` | Go module name | `github.com/openxapi/binance-go/ws` | Yes |
| `packageName` | Go package name | `spot` | No |
| `version` | Client version | `0.1.0` | No |
| `author` | Author name | `openxapi` | No |

## How the Template Works

- **Spec driven** – channel files, handler registration functions, request/response helpers, typed stream builders, and models all come from the AsyncAPI definition. No file is tied to a fixed module.
- **Channels first** – every AsyncAPI channel produces its own Go file, connection helpers, and handler registry derived from channel operations.
- **Message aware** – request/response payloads and oneOf combinations rely on component messages and schemas. Event detection uses `x-event`, `x-event-type`, and schema metadata where available.
- **Streams support** – if the spec exposes `x-stream-pattern`, `x-stream-example`, or `x-stream-params`, the generator emits typed helpers in `streams.go` without any hardcoded stream names.
- **Extensible** – new Binance modules or in-spec extensions automatically influence generated code without template edits.

## Generated Code Structure

The template generates the following file structure:

```
output/
├── client.go              # Main WebSocket client
├── signing.go             # Request signing utilities (HMAC, RSA, Ed25519)
├── signing_test.go        # Signing tests and benchmarks
├── go.mod                 # Go module file
├── models/
│   ├── models.go         # Common utilities and response registry
│   ├── *.go              # Various event and response types
│   └── user_data_stream_subscribe_result.go  # OneOf wrapper type
└── README.md             # Generated client documentation
```

## Development and Testing

### Run Tests

```bash
npm run test
```

This will:
1. Clean previous test artifacts
2. Generate a test client
3. Build the Go client

### Test Generated Client with Go

```bash
npm run test
```

This runs the end-to-end template test: remove the previous build, generate a client using the current spec/configuration, initialise a temporary Go module, and build the generated sources.

### Clean Test Files

```bash
npm run test:clean
```

Use `npm run test:generate` or `npm run test:build` individually when troubleshooting the generator or build process. `npm run example` leaves the generated client in `test/project` and runs `go run` so you can experiment with the output.

Integration tests for the generated SDKs live in [`github.com/openxapi/integration-tests`](https://github.com/openxapi/integration-tests) under `binance/asyncapi/`. Those suites cover connectivity, metadata, and streaming behaviour across Binance modules, ensuring the spec-driven template remains compatible.

## Available npm Scripts

| Script | Description |
|--------|-------------|
| `npm run generate` | Generate a client using the current spec and parameter defaults |
| `npm run test` | Clean, regenerate, and build the sample client |
| `npm run test:clean` | Remove the `test/project` workspace |
| `npm run test:generate` | Generate into `test/project` without building |
| `npm run test:build` | Build the previously generated client |
| `npm run example` | Generate into `test/project` and run `go run` |

## Direct AsyncAPI CLI Usage

You can also use AsyncAPI CLI directly:

```bash
# Basic generation
asyncapi generate fromTemplate \
  ../../../../specs/binance/asyncapi/spot.yaml \
  ./ \
  --output ./output \
  --force-write \
  -p moduleName=github.com/openxapi/binance-go/ws \
  -p packageName=spot \
  -p version=0.1.0 \
  -p author=openxapi

# Custom parameters
asyncapi generate fromTemplate \
  /path/to/your/spec.yaml \
  /path/to/template \
  --output /path/to/output \
  --force-write \
  -p moduleName=your-module-name \
  -p packageName=your-package \
  -p version=1.0.0 \
  -p author="Your Name"
```

## Template Features

The generated Go client includes the following features:

- ✅ **AsyncAPI 3.0 Compatible**: Full support for AsyncAPI 3.0 specifications
- ✅ **Spec-Driven Generation**: All handlers, channels, and models derive directly from the spec
- ✅ **OneOf Support**: Automatic handling of multiple response types in a single endpoint
- ✅ **High-Performance Architecture**: Optimized with sync.Map, pre-allocated buffers, and concurrent-safe operations
- ✅ **Enhanced Error Handling**: Comprehensive API error handling with HTTP-like status codes
- ✅ **Automatic JSON Parsing**: Response handlers receive parsed objects, not raw bytes
- ✅ **Type-Safe Go Client**: Generated Go structs with proper types and validation
- ✅ **Event-Driven Architecture**: Support for WebSocket event handling with global handlers
- ✅ **Response History**: Track all received messages with queryable history
- ✅ **Gorilla WebSocket**: Built on reliable WebSocket implementation
- ✅ **Thread-Safe**: Concurrent-safe operations with proper locking mechanisms
- ✅ **Context-Based Authentication**: Per-request authentication via Go's context.Context
- ✅ **Multiple Authentication Methods**: HMAC-SHA256, RSA, and Ed25519 signing
- ✅ **Environment Variable Support**: Configurable via environment variables
- ✅ **ES Module Compatible**: Modern JavaScript module system for template components
- ✅ **Integration Test Ready**: Works seamlessly with existing integration test frameworks

## AsyncAPI Specification Requirements

For oneOf support, your AsyncAPI spec should structure response schemas like:

```yaml
channels:
  userDataStream_subscribe:
    messages:
      receiveMessage:
        payload:
          properties:
            result:
              oneOf:
                - $ref: '#/components/schemas/ExecutionReportEvent'
                - $ref: '#/components/schemas/BalanceUpdateEvent'
                # ... other event types
```

## Troubleshooting

### AsyncAPI CLI Not Found

If you get "command not found" errors, install the AsyncAPI CLI:

```bash
npm install -g @asyncapi/cli
```

Or use a custom path:

```bash
ASYNCAPI_CLI=/path/to/asyncapi npm run generate
```

### Permission Errors

Make sure the output directory is writable:

```bash
chmod 755 /path/to/output
```

### Build Errors

Ensure Go is installed and in your PATH:

```bash
go version
```

For module path issues, update the module name:

```bash
MODULE_NAME=github.com/your-org/your-client npm run generate
```

## Dependencies

Generated code dependencies:

- `github.com/gorilla/websocket`: WebSocket implementation
- `github.com/google/uuid`: UUID generation
- Go standard libraries: `encoding/json`, `sync`, `context`, `crypto/*`, etc.

## Contributing

Updates to generated behaviour should start from the AsyncAPI document. Add channels, messages, schemas, and `x-*` extensions in the spec and rerun the template. If template changes are required, keep them spec-driven and avoid reintroducing module-specific branches.

## License

This template follows the same license as the AsyncAPI Generator project. 
