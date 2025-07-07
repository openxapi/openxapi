# Binance AsyncAPI Go WebSocket Client Template

This is an AsyncAPI template for generating **Go WebSocket clients** for Binance WebSocket API. The template is based on AsyncAPI 3.0 specifications and supports generating type-safe, high-performance Go WebSocket client code.

## Quick Start

### Prerequisites

- Node.js 16+ 
- AsyncAPI CLI
- Go 1.19+

Install AsyncAPI CLI:

```bash
npm install -g @asyncapi/cli
```

### Basic Generation

```bash
npm run generate
```

This will generate the Go client using default parameters:
- Spec file: `../../../../specs/binance/asyncapi/spot.yaml`
- Output directory: `./output`
- Package name: `spot`
- Module name: `github.com/openxapi/binance-go/ws`

### Module-Based Generation

```bash
# Generate specific module (spot, futures, options, etc.)
MODULE=spot npm run generate:module

# Test specific module
MODULE=spot npm run test:module
```

### Custom Generation

Customize generation using environment variables:

```bash
# Custom output directory
OUTPUT_DIR=/path/to/output npm run generate

# Use custom spec file
SPEC_FILE=/path/to/custom.yaml npm run generate

# Custom module and package names
MODULE_NAME=my-binance-client PACKAGE_NAME=client npm run generate

# Use custom AsyncAPI CLI
ASYNCAPI_CLI=/usr/local/bin/asyncapi npm run generate

# Set author information
AUTHOR="Your Name" npm run generate

# Combine multiple parameters
OUTPUT_DIR=./my-client \
MODULE_NAME=binance-ws \
PACKAGE_NAME=websocket \
AUTHOR="Developer Name" \
npm run generate
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

## Module Configuration

The template supports module-based generation using JSON configuration files located in `generator-configs/binance/asyncapi/go/`:

```json
{
  "generator": {
    "parameters": {
      "moduleName": {
        "default": "github.com/openxapi/binance-go/ws/spot"
      },
      "packageName": {
        "default": "spot"
      },
      "version": {
        "default": "0.1.0"
      },
      "author": {
        "default": "openxapi"
      }
    }
  }
}
```

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

### Test Specific Module

```bash
MODULE=spot npm run test:module
```

### Clean Test Files

```bash
npm run test:clean
```

### Generate Test Client Only

```bash
npm run test:generate
```

### Build Test Client Only

```bash
npm run test:build
```

### Run Example

```bash
npm run example
```

### Integration Tests

Integration tests have been moved to a dedicated repository:
- **Repository**: [github.com/openxapi/integration-tests](https://github.com/openxapi/integration-tests)
- **Location**: `binance/asyncapi/` for Binance WebSocket tests

To run integration tests:
```bash
# Clone the integration tests repository
git clone https://github.com/openxapi/integration-tests.git
cd integration-tests

# Run specific tests
make test-spot        # Binance Spot WebSocket tests
make test-umfutures   # Binance USD-M Futures WebSocket tests
make test-all         # All integration tests
```

## Available npm Scripts

| Script | Description |
|--------|-------------|
| `npm run generate` | Generate client using default parameters |
| `npm run generate:module` | Generate client based on module configuration |
| `npm run test` | Run complete test workflow |
| `npm run test:clean` | Clean test files |
| `npm run test:generate` | Generate test client only |
| `npm run test:build` | Build test client only |
| `npm run test:module` | Test specific module |
| `npm run test:module:generate` | Generate test client for specific module |
| `npm run example` | Generate and run example code |
| `npm run example:module` | Run example for specific module |

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

When adding new event types:

1. Add the schema to your AsyncAPI specification
2. Add the event type mapping in `mapEventTypeToStruct()`
3. Register the type in `RegisterAllEventTypes()`
4. Update the global handler setup in `SetupDefaultUserDataStreamHandlers()`

## License

This template follows the same license as the AsyncAPI Generator project. 