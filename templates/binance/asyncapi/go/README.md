# Binance AsyncAPI Go WebSocket Client Template

This template generates **Go WebSocket clients** for Binance's WebSocket API based on AsyncAPI 3.0 specifications. It provides comprehensive support for **oneOf response types** and **async response management**.

> **Note**: This template is specifically designed for Go language. For other languages, use the corresponding language-specific templates.

## Quick Start

### Basic Generation

```bash
npm run generate
```

This will generate the Go client using default parameters:
- Spec file: `../../../../specs/binance/asyncapi/spot.yaml`
- Output directory: `./output`
- Server: `production`
- Package name: `main`
- Module name: `binance-websocket-client`

### Custom Generation

You can customize the generation using environment variables:

```bash
# Generate to custom output directory
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
| `SERVER` | Server environment to use | `production` |
| `PACKAGE_NAME` | Go package name | `main` |
| `MODULE_NAME` | Go module name | `binance-websocket-client` |
| `CLIENT_VERSION` | Client version | `0.1.0` |
| `AUTHOR` | Author name | (empty) |

## Features

- ✅ **AsyncAPI 3.0 Compatible**: Full support for AsyncAPI 3.0 specifications
- ✅ **OneOf Support**: Automatic handling of multiple response types in a single endpoint
- ✅ **Async Response Management**: Global response list and type-safe handlers
- ✅ **Type-Safe Go Client**: Generated Go structs with proper types
- ✅ **Event-Driven Architecture**: Support for WebSocket event handling
- ✅ **Response History**: Track all received messages with queryable history
- ✅ **Gorilla WebSocket**: Built on reliable WebSocket implementation
- ✅ **Thread-Safe**: Concurrent-safe operations with proper locking
- ✅ **Environment Variable Support**: Configurable via environment variables

## OneOf Features

### What is OneOf?

OneOf allows a single field to accept multiple different schema types. For example, in Binance's User Data Stream, the `result` field can contain:

- `OutboundAccountPositionEvent`
- `BalanceUpdateEvent` 
- `ExecutionReportEvent`
- `ListStatusEvent`
- `ListenKeyExpiredEvent`
- `ExternalLockUpdateEvent`

### Automatic Type Detection

The client automatically detects the event type based on distinctive fields (like the `e` field in Binance events) and parses the response into the correct Go struct.

## Usage Examples

### Basic OneOf Handling

```go
// Subscribe to user data stream with automatic oneOf parsing
err := client.UserDataStreamSubscribeWithOneOfHandler(func(result interface{}, responseType string) error {
    switch responseType {
    case "ExecutionReportEvent":
        if event, ok := result.(*models.ExecutionReportEvent); ok {
            log.Printf("Order update: %s %s", event.S, event.X)
        }
    case "BalanceUpdateEvent":
        if event, ok := result.(*models.BalanceUpdateEvent); ok {
            log.Printf("Balance update: %s %s", event.A, event.D)
        }
    }
    return nil
})
```

### Global Response Handlers

```go
// Register handlers for specific event types globally
client.RegisterGlobalHandler("ExecutionReportEvent", func(data interface{}) error {
    if event, ok := data.(*models.ExecutionReportEvent); ok {
        // Handle execution report
        processOrderUpdate(event)
    }
    return nil
})

client.RegisterGlobalHandler("BalanceUpdateEvent", func(data interface{}) error {
    if event, ok := data.(*models.BalanceUpdateEvent); ok {
        // Handle balance update
        updateBalance(event.A, event.D)
    }
    return nil
})
```

### Response History Management

```go
// Get all received responses
history := client.GetResponseHistory()
log.Printf("Received %d responses", len(history))

// Clear history when needed
client.ClearResponseHistory()
```

### Manual OneOf Parsing

```go
data := []byte(`{"result": {"e": "executionReport", ...}}`)
result, responseType, err := ParseOneOfMessage(data)
if err == nil {
    log.Printf("Parsed %s: %+v", responseType, result)
}
```

### Using the Generated Client

After generation, you can use the client in your Go project:

```go
package main

import (
	"context"
	"log"
	"time"
	"encoding/json"

	"binance-websocket-client/models"
)

func main() {
	// Example 1: Create a client without authentication (for public endpoints)
	client := NewClient()
	
	// Example 2: Create a client with HMAC authentication
	// auth := NewAuth("your-api-key")
	// auth.SetSecretKey("your-secret-key")
	// client := NewClientWithAuth(auth)
	
	// Example 3: Create a client with RSA authentication
	// auth := NewAuth("your-api-key")
	// auth.SetPrivateKeyPath("path/to/your/rsa-key.pem")
	// // Optional: auth.SetPassphrase("your-passphrase") if key is encrypted
	// client := NewClientWithAuth(auth)
	
	// Example 4: Create a client with Ed25519 authentication
	// auth := NewAuth("your-api-key")
	// auth.SetPrivateKeyPath("path/to/your/ed25519-key.pem")
	// // Optional: auth.SetPassphrase("your-passphrase") if key is encrypted
	// client := NewClientWithAuth(auth)
	
	// Example 5: Create a client with private key from byte array
	// pemData := []byte(`-----BEGIN RSA PRIVATE KEY-----
	// ... your RSA private key here ...
	// -----END RSA PRIVATE KEY-----`)
	// auth := NewAuth("your-api-key")
	// if err := auth.SetPrivateKey(pemData); err != nil {
	// 	log.Fatalf("Error setting private key: %v", err)
	// }
	// client := NewClientWithAuth(auth)
	
	// Connect to the WebSocket server
	ctx := context.Background()
	if err := client.Connect(ctx); err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect()

	// Setup default handlers for all user data stream event types
	client.SetupDefaultUserDataStreamHandlers()

	// Example 1: Using the ping API to test connectivity
	log.Println("Example 1: Testing connectivity with ping")
	err := client.SendPingDefault(ctx, func(response *models.PingTestConnectivityResponse, err error) error {
		if err != nil {
			log.Printf("Ping error: %v", err)
			return err
		}
		log.Printf("Ping response: ID=%s, Status=%d", response.Id, response.Status)
		return nil
	})
	if err != nil {
		log.Printf("Error sending ping: %v", err)
	}

	// Example 2: Get server time
	log.Println("Example 2: Getting server time")
	err = client.SendTimeDefault(ctx, func(response *models.TimeCheckServerTimeResponse, err error) error {
		if err != nil {
			log.Printf("Time error: %v", err)
			return err
		}
		log.Printf("Time response: ID=%s, Status=%d", response.Id, response.Status)
		if response.Result.ServerTime != 0 {
			serverTime := time.UnixMilli(response.Result.ServerTime)
			log.Printf("Server time: %s", serverTime.Format("2006-01-02 15:04:05"))
		}
		return nil
	})
	if err != nil {
		log.Printf("Error getting server time: %v", err)
	}

	// Example 3: Get exchange information
	log.Println("Example 3: Getting exchange information")
	err = client.SendExchangeInfoDefault(ctx, func(response *models.ExchangeInfoExchangeInformationResponse, err error) error {
		if err != nil {
			log.Printf("ExchangeInfo error: %v", err)
			return err
		}
		log.Printf("ExchangeInfo response: ID=%s, Status=%d", response.Id, response.Status)
		if len(response.Result.Symbols) > 0 {
			log.Printf("Total symbols: %d", len(response.Result.Symbols))
		}
		return nil
	})
	if err != nil {
		log.Printf("Error getting exchange info: %v", err)
	}

	// Example 4: Get order book for BTCUSDT
	log.Println("Example 4: Getting order book for BTCUSDT")
	depthRequest := &models.DepthOrderBookRequest{
		Params: models.DepthOrderBookRequestParams{
			Symbol: "BTCUSDT",
			Limit:  10,
		},
	}
	err = client.SendDepth(ctx, depthRequest, func(response *models.DepthOrderBookResponse, err error) error {
		if err != nil {
			log.Printf("Depth error: %v", err)
			return err
		}
		log.Printf("Depth response: ID=%s, Status=%d", response.Id, response.Status)
		if response.Result.LastUpdateId != 0 {
			log.Printf("Last update ID: %d", response.Result.LastUpdateId)
		}
		if len(response.Result.Bids) > 0 {
			log.Printf("Number of bids: %d", len(response.Result.Bids))
		}
		if len(response.Result.Asks) > 0 {
			log.Printf("Number of asks: %d", len(response.Result.Asks))
		}
		return nil
	})
	if err != nil {
		log.Printf("Error getting depth: %v", err)
	}

	// Example 5: Working with the global response history
	log.Println("Example 5: Response history")
	time.Sleep(2 * time.Second)
	history := client.GetResponseHistory()
	log.Printf("Total responses received: %d", len(history))
	
	// Display last few responses
	for i, response := range history {
		if i >= len(history)-3 { // Show last 3 responses
			if responseBytes, err := json.Marshal(response); err == nil {
				responseStr := string(responseBytes)
				if len(responseStr) > 200 {
					responseStr = responseStr[:200] + "..."
				}
				log.Printf("Response %d: %s", i+1, responseStr)
			}
		}
	}

	// Clean up response history
	client.ClearResponseHistory()
	log.Println("Response history cleared")

	// Keep the connection alive for a while to receive events
	log.Println("Listening for events for 10 seconds...")
	time.Sleep(10 * time.Second)
	log.Println("Example completed")
}
```

## Generated Client Structure

The template generates the following structure:

```
output/
├── client.go              # Main WebSocket client with oneOf support
├── go.mod                 # Go module file
├── models/
│   ├── models.go         # Common utilities and response registry
│   ├── execution_report_event.go
│   ├── balance_update_event.go
│   ├── outbound_account_position_event.go
│   ├── list_status_event.go
│   ├── listen_key_expired_event.go
│   ├── external_lock_update_event.go
│   └── user_data_stream_subscribe_result.go  # OneOf wrapper type
├── signing.go            # Request signing utilities
├── signing_test.go       # Signing tests
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



## Key Components

### ResponseRegistry

Manages all possible response types and provides factory methods for creating instances:

```go
// Register a new response type
models.GlobalRegistry.RegisterType("MyEventType", MyEvent{}, func() interface{} {
    return &MyEvent{}
})

// Create instance dynamically
instance, err := models.GlobalRegistry.CreateInstance("MyEventType")
```

### GlobalResponseHandler

Manages global handlers for different response types:

```go
handler := NewGlobalResponseHandler()
handler.RegisterHandler("ExecutionReportEvent", myHandler)
```

### OneOf Wrapper Types

Generated oneOf wrapper types provide type-safe access:

```go
var result UserDataStreamSubscribeResult
err := json.Unmarshal(data, &result)

// Type-safe getters
if event, ok := result.AsExecutionReportEvent(); ok {
    // Handle execution report
}
```

## Configuration

The template supports the following parameters:

- `server`: WebSocket server to connect to (default: first server in spec)
- `packageName`: Go package name (default: `main`)
- `moduleName`: Go module name (default: `binance-websocket-client`)

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

## Event Type Detection

The template automatically detects event types using these patterns:

1. **Field `e`**: Primary event type indicator (Binance standard)
2. **Field `event`**: Alternative event type field
3. **Field `type`**: Generic type field
4. **Field `eventType`**: Explicit event type field

Event types are mapped to Go struct names automatically:

- `executionReport` → `ExecutionReportEvent`
- `balanceUpdate` → `BalanceUpdateEvent`
- `outboundAccountPosition` → `OutboundAccountPositionEvent`

## Thread Safety

All client operations are thread-safe:

- Response handlers use RWMutex for concurrent access
- Response history is protected with mutex
- Global response registry uses locks for safe registration

## Error Handling

The template provides comprehensive error handling:

- Connection errors with context support
- JSON parsing errors with detailed messages
- Type conversion errors with fallback handling
- OneOf parsing errors with clear diagnostics

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

- `github.com/gorilla/websocket`: WebSocket implementation
- Standard Go libraries: `encoding/json`, `sync`, `context`, etc.

## Contributing

When adding new event types:

1. Add the schema to your AsyncAPI specification
2. Add the event type mapping in `mapEventTypeToStruct()`
3. Register the type in `RegisterAllEventTypes()`
4. Update the global handler setup in `SetupDefaultUserDataStreamHandlers()`

## License

This template follows the same license as the AsyncAPI Generator project. 