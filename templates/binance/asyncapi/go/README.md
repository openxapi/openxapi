# Binance AsyncAPI Go WebSocket Client Template

This template generates **Go WebSocket clients** for Binance's WebSocket API based on AsyncAPI 3.0 specifications. It provides comprehensive support for **oneOf response types**, **async response management**, **enhanced error handling**, and **high-performance event processing**.

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
| `PACKAGE_NAME` | Go package name | `spot` |
| `MODULE_NAME` | Go module name | `github.com/openxapi/binance-go/ws` |
| `CLIENT_VERSION` | Client version | `0.1.0` |
| `AUTHOR` | Author name | `openxapi` |

## Features

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
- ✅ **Module-Based Generation**: Support for different Binance API modules

## Error Handling

### APIError Structure

The client includes a comprehensive error handling system that automatically detects and processes API errors based on HTTP-like status codes:

```go
type APIError struct {
    Status  int    `json:"status"`  // HTTP-like status code (400, 403, 429, etc.)
    Code    int    `json:"code"`    // Binance-specific error code
    Message string `json:"msg"`     // Error message
    ID      string `json:"id"`      // Request ID that caused the error
}
```

### Error Detection

The client automatically detects API errors when:
- Response `status` field is not `200` 
- Response contains an `error` field with `code` and `msg`

### Error Handling Examples

```go
// Example 1: Basic error handling with automatic JSON parsing
responseHandler := func(response *models.PingTestConnectivityResponse, err error) error {
    if err != nil {
        if apiErr, ok := IsAPIError(err); ok {
            log.Printf("API Error: Status=%d, Code=%d, Message=%s", 
                apiErr.Status, apiErr.Code, apiErr.Message)
            return nil // Error handled
        }
        return err // Other error types
    }
    
    // Response is automatically parsed - no JSON unmarshaling needed!
    log.Printf("Ping successful: ID=%s, Status=%d", response.Id, response.Status)
    return nil
}

// Example 2: Handling specific error types
responseHandler := func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
    if err != nil {
        if apiErr, ok := IsAPIError(err); ok {
            switch apiErr.Status {
            case 400:
                log.Printf("Bad request: %s", apiErr.Message)
            case 403:
                log.Printf("Forbidden - WAF blocked: %s", apiErr.Message)
            case 409:
                log.Printf("Partial failure: %s", apiErr.Message)
            case 418:
                log.Printf("Auto-banned for rate limit violation: %s", apiErr.Message)
            case 429:
                log.Printf("Rate limit exceeded: %s", apiErr.Message)
            default:
                log.Printf("API error: %s", apiErr.Error())
            }
            return nil // Error handled
        }
        return err // Other error types
    }
    
    // Response is ready to use - already parsed!
    log.Printf("Commission rates: %+v", response.Result)
    return nil
}
```

### Response Handler Signature

All response handlers receive parsed response objects, not raw bytes:

```go
func(response *models.SomeResponseType, err error) error
```

This provides a user-friendly API where you can directly access response fields without manual JSON unmarshaling.

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

## High-Performance Features

### Optimized Client Architecture

The client is designed for high-performance scenarios:

- **Pre-allocated Buffers**: JSON parsing uses pre-allocated buffers to reduce garbage collection
- **sync.Map**: Response handlers use sync.Map for better concurrent performance
- **Separate Mutexes**: Response list and client state use separate mutexes to reduce contention
- **Capacity Pre-allocation**: Response lists are pre-allocated with capacity to minimize reallocations

### Concurrent Safety

All client operations are thread-safe:

- Response handlers use RWMutex for concurrent access
- Response history is protected with mutex
- Global response registry uses locks for safe registration
- Event handlers support concurrent registration and execution

## Usage Examples

### Basic OneOf Handling with Error Support

```go
// Subscribe to user data stream with automatic oneOf parsing and error handling
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

### Event Handler Registration

```go
// Register handlers for specific event types globally
client.HandleExecutionReportEvent(func(event *models.ExecutionReportEvent) error {
    // Handle execution report
    processOrderUpdate(event)
    return nil
})

client.HandleBalanceUpdateEvent(func(event *models.BalanceUpdateEvent) error {
    // Handle balance update
    updateBalance(event.A, event.D)
    return nil
})

// Or setup all default handlers at once
client.SetupDefaultUserDataStreamHandlers()
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

### Authentication Examples

```go
package main

import (
	"context"
	"log"
	"time"

	"github.com/openxapi/binance-go/ws/models"
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

	// Example 1: Using the ping API to test connectivity with error handling
	log.Println("Example 1: Testing connectivity with ping")
	err := client.SendPingDefault(ctx, func(response *models.PingTestConnectivityResponse, err error) error {
		if err != nil {
			if apiErr, ok := IsAPIError(err); ok {
				log.Printf("Ping API error: Status=%d, Code=%d, Message=%s", 
					apiErr.Status, apiErr.Code, apiErr.Message)
				return nil
			}
			log.Printf("Ping error: %v", err)
			return err
		}
		
		// Response is already parsed - ready to use!
		log.Printf("Ping response: ID=%s, Status=%d", response.Id, response.Status)
		return nil
	})
	if err != nil {
		log.Printf("Error sending ping: %v", err)
	}

	// Example 2: Get server time with comprehensive error handling
	log.Println("Example 2: Getting server time")
	err = client.SendTimeDefault(ctx, func(response *models.TimeCheckServerTimeResponse, err error) error {
		if err != nil {
			if apiErr, ok := IsAPIError(err); ok {
				switch apiErr.Status {
				case 429:
					log.Printf("Rate limit exceeded: %s", apiErr.Message)
				case 403:
					log.Printf("Access forbidden: %s", apiErr.Message)
				default:
					log.Printf("API error: %s", apiErr.Error())
				}
				return nil
			}
			log.Printf("Time error: %v", err)
			return err
		}
		
		// Response is automatically parsed
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
			if apiErr, ok := IsAPIError(err); ok {
				log.Printf("ExchangeInfo API error: %s", apiErr.Error())
				return nil
			}
			log.Printf("ExchangeInfo error: %v", err)
			return err
		}
		
		// Response is automatically parsed
		log.Printf("ExchangeInfo response: ID=%s, Status=%d", response.Id, response.Status)
		if len(response.Result.Symbols) > 0 {
			log.Printf("Total symbols: %d", len(response.Result.Symbols))
		}
		return nil
	})
	if err != nil {
		log.Printf("Error getting exchange info: %v", err)
	}

	// Example 4: Get order book for BTCUSDT with error handling
	log.Println("Example 4: Getting order book for BTCUSDT")
	depthRequest := &models.DepthOrderBookRequest{
		Params: models.DepthOrderBookRequestParams{
			Symbol: "BTCUSDT",
			Limit:  10,
		},
	}
	err = client.SendDepth(ctx, depthRequest, func(response *models.DepthOrderBookResponse, err error) error {
		if err != nil {
			if apiErr, ok := IsAPIError(err); ok {
				log.Printf("Depth API error: %s", apiErr.Error())
				return nil
			}
			log.Printf("Depth error: %v", err)
			return err
		}
		
		// Response is automatically parsed
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
			log.Printf("Response %d: %+v", i+1, response)
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
├── client.go              # Main WebSocket client with oneOf support and error handling
├── signing.go             # Request signing utilities (HMAC, RSA, Ed25519)
├── signing_test.go        # Signing tests and benchmarks
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

## Generation Configuration

### Template Parameters

The template supports the following parameters:

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `moduleName` | Go module name | `github.com/openxapi/binance-go/ws` | Yes |
| `packageName` | Go package name | `spot` | No |
| `version` | Client version | `0.1.0` | No |
| `author` | Author name | `openxapi` | No |

### Module-Based Configuration

The template supports module-based generation using JSON configuration files:

```json
{
  "generator": {
    "parameters": {
      "moduleName": {
        "default": "github.com/openxapi/binance-go/ws"
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

### EventHandler

Manages event handlers for different response types with optimized performance:

```go
handler := NewEventHandler()
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

### APIError Utilities

Helper functions for working with API errors:

```go
// Check if an error is an APIError
if apiErr, ok := IsAPIError(err); ok {
    // Handle API-specific error
    log.Printf("Status: %d, Code: %d, Message: %s", 
        apiErr.Status, apiErr.Code, apiErr.Message)
}

// APIError implements the error interface
fmt.Printf("Error: %s", apiErr.Error())
```

### Automatic JSON Parsing

The client automatically handles JSON parsing for all response types:

```go
// No manual JSON unmarshaling needed
func(response *models.PingTestConnectivityResponse, err error) error {
    if err != nil {
        // Handle error
        return err
    }
    
    // Response is ready to use
    log.Printf("Ping ID: %s", response.Id)
    return nil
}
```

## Authentication Features

### Supported Methods

- **HMAC-SHA256**: Fast and secure for high-frequency trading
- **RSA**: Standard corporate authentication
- **Ed25519**: Recommended for best performance and security balance

### Context-Based Authentication

```go
// Per-request authentication
auth := NewAuth("your-api-key")
auth.SetSecretKey("your-secret-key")
authCtx, _ := auth.ContextWithValue(context.Background())

// Use authenticated context
client.SendAccountCommission(authCtx, request, responseHandler)
```

### Client-Level Authentication

```go
// Authentication for all requests
auth := NewAuth("your-api-key")
auth.SetSecretKey("your-secret-key")
client := NewClientWithAuth(auth)
```

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

- **API Errors**: Automatic detection and parsing of Binance API errors
- **Status Code Handling**: Support for all HTTP-like status codes (400, 403, 409, 418, 429, 5xx)
- **Type-Safe Error Checking**: `IsAPIError()` function for type-safe error handling
- **Connection Errors**: Context support for timeouts and cancellation
- **JSON Parsing Errors**: Automatic handling with error propagation
- **OneOf Parsing Errors**: Clear diagnostics for type detection issues

### Common Status Codes

| Status | Description | Handling |
|--------|-------------|----------|
| 200 | Success | Normal response processing |
| 400 | Bad Request | Check request parameters |
| 403 | Forbidden | WAF blocked - check request format |
| 409 | Conflict | Partial success - check error details |
| 418 | I'm a teapot | Auto-banned for rate limit violations |
| 429 | Too Many Requests | Rate limit exceeded - slow down |
| 5xx | Server Error | Retry with exponential backoff |

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

### API Error Troubleshooting

```go
// Debug API errors - response is already parsed
responseHandler := func(response *models.SomeResponseType, err error) error {
    if err != nil {
        if apiErr, ok := IsAPIError(err); ok {
            log.Printf("Debug - Full API Error: %+v", apiErr)
        }
    } else if response != nil {
        log.Printf("Successful response: %+v", response)
    }
    return nil
}
```

## Dependencies

- `github.com/gorilla/websocket`: WebSocket implementation
- `github.com/google/uuid`: UUID generation for request IDs
- Standard Go libraries: `encoding/json`, `sync`, `context`, `crypto/*`, etc.

## Contributing

When adding new event types:

1. Add the schema to your AsyncAPI specification
2. Add the event type mapping in `mapEventTypeToStruct()`
3. Register the type in `RegisterAllEventTypes()`
4. Update the global handler setup in `SetupDefaultUserDataStreamHandlers()`

## License

This template follows the same license as the AsyncAPI Generator project. 