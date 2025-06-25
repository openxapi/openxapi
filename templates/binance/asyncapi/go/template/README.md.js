import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const moduleName = params.moduleName || 'github.com/openxapi/binance-go/ws';
  const packageName = params.packageName || 'spot';
  const version = params.version || '0.1.0';
  const author = params.author || 'openxapi';

  return (
    <File name="README.md">
      <Text>
{`# Binance WebSocket API Client with Enhanced Authentication

This Go client provides comprehensive support for Binance's WebSocket API with built-in authentication for all security types, enhanced error handling, automatic JSON parsing, and high-performance event processing.

## Features

- ✅ **Multiple Authentication Methods**: HMAC-SHA256, RSA, and Ed25519 signing
- ✅ **Context-Based Authentication**: Per-request authentication via Go's context.Context
- ✅ **Automatic Authentication**: Detects authentication requirements from API specifications
- ✅ **Flexible Auth Strategy**: Client-level or per-request authentication
- ✅ **Enhanced Error Handling**: Comprehensive API error handling with HTTP-like status codes
- ✅ **Automatic JSON Parsing**: Response handlers receive parsed objects, not raw bytes
- ✅ **Type-Safe**: Generated Go structs with proper types and validation
- ✅ **High-Performance**: Optimized with sync.Map, pre-allocated buffers, and concurrent-safe operations
- ✅ **OneOf Support**: Automatic handling of multiple response types in single endpoints
- ✅ **Event-Driven Architecture**: Advanced event handling with global handlers and history tracking
- ✅ **Comprehensive Testing**: Unit tests, benchmarks, and integration examples included
- ✅ **Thread-Safe**: All operations are concurrent-safe with proper locking mechanisms

## Authentication Types

Binance WebSocket API supports four authentication types:

| Type | Description | Signature Required |
|------|-------------|-------------------|
| \`NONE\` | Public market data | No |
| \`USER_STREAM\` | User data stream management | No |
| \`USER_DATA\` | Private account information | Yes |
| \`TRADE\` | Trading operations | Yes |

The client automatically detects the required authentication type based on the API endpoint.

## Error Handling

### APIError Structure

The client includes a comprehensive error handling system that automatically detects and processes API errors based on HTTP-like status codes:

\`\`\`go
type APIError struct {
    Status  int    \`json:"status"\`  // HTTP-like status code (400, 403, 429, etc.)
    Code    int    \`json:"code"\`    // Binance-specific error code
    Message string \`json:"msg"\`     // Error message
    ID      string \`json:"id"\`      // Request ID that caused the error
}

// Check if an error is an APIError
if apiErr, ok := IsAPIError(err); ok {
    // Handle API-specific error
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
}
\`\`\`

### Response Handler Signature

All response handlers receive parsed response objects, not raw bytes:

\`\`\`go
func(response *models.SomeResponseType, err error) error
\`\`\`

This provides a user-friendly API where you can directly access response fields without manual JSON unmarshaling.

## Quick Start

### 1. Basic Usage (Public Endpoints)

\`\`\`go
package main

import (
    "context"
    "log"
    "${moduleName}"
)

func main() {
    // Create client for public endpoints
    client := NewClient()
    
    ctx := context.Background()
    if err := client.Connect(ctx); err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer client.Disconnect()
    
    // Use public endpoints with automatic JSON parsing
    err := client.SendPingDefault(ctx, func(response *models.PingTestConnectivityResponse, err error) error {
        if err != nil {
            if apiErr, ok := IsAPIError(err); ok {
                log.Printf("Ping API error: Status=%d, Code=%d, Message=%s", 
                    apiErr.Status, apiErr.Code, apiErr.Message)
                return nil
            }
            return err
        }
        
        // Response is automatically parsed - ready to use!
        log.Printf("Ping successful: ID=%s, Status=%d", response.Id, response.Status)
        return nil
    })
    if err != nil {
        log.Printf("Error sending ping: %v", err)
    }
}
\`\`\`

### 2. Client-Level Authentication (HMAC)

\`\`\`go
package main

import (
    "context"
    "log"
    "${moduleName}"
)

func main() {
    // Create HMAC auth
    auth := NewAuth("your-api-key")
    auth.SetSecretKey("your-secret-key")
    client := NewClientWithAuth(auth)
    
    ctx := context.Background()
    if err := client.Connect(ctx); err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer client.Disconnect()
    
    // Now you can use authenticated endpoints with automatic JSON parsing
    request := &models.AccountCommissionAccountCommissionRatesRequest{}
    err := client.SendAccountCommission(ctx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
        if err != nil {
            if apiErr, ok := IsAPIError(err); ok {
                log.Printf("Account commission API error: %s", apiErr.Error())
                return nil
            }
            return err
        }
        
        // Response is automatically parsed - ready to use!
        log.Printf("Account commission: %+v", response.Result)
        return nil
    })
    if err != nil {
        log.Printf("Error getting account commission: %v", err)
    }
}
\`\`\`

### 3. Per-Request Authentication

\`\`\`go
package main

import (
    "context"
    "log"
    "${moduleName}"
)

func main() {
    // Create client without authentication
    client := NewClient()
    
    ctx := context.Background()
    if err := client.Connect(ctx); err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer client.Disconnect()
    
    // Create authentication for specific request
    auth := NewAuth("your-api-key")
    auth.SetSecretKey("your-secret-key")
    authCtx, err := auth.ContextWithValue(context.Background())
    if err != nil {
        log.Fatalf("Failed to create auth context: %v", err)
    }
    
    // Use per-request auth with automatic JSON parsing
    request := &models.AccountCommissionAccountCommissionRatesRequest{}
    err = client.SendAccountCommission(authCtx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
        if err != nil {
            if apiErr, ok := IsAPIError(err); ok {
                switch apiErr.Status {
                case 401:
                    log.Printf("Authentication failed: %s", apiErr.Message)
                case 403:
                    log.Printf("Access forbidden: %s", apiErr.Message)
                case 429:
                    log.Printf("Rate limit exceeded: %s", apiErr.Message)
                default:
                    log.Printf("API error: %s", apiErr.Error())
                }
                return nil
            }
            return err
        }
        
        // Response is automatically parsed - ready to use!
        log.Printf("Account commission: %+v", response.Result)
        return nil
    })
    if err != nil {
        log.Printf("Error getting account commission: %v", err)
    }
}
\`\`\`

### 4. Different Auth for Different Requests

\`\`\`go
package main

import (
    "context"
    "log"
    "${moduleName}"
)

func main() {
    client := NewClient()
    
    ctx := context.Background()
    if err := client.Connect(ctx); err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer client.Disconnect()
    
    // Create different auth instances
    tradingAuth := NewAuth("trading-api-key")
    tradingAuth.SetSecretKey("trading-secret")
    
    readOnlyAuth := NewAuth("readonly-api-key")
    readOnlyAuth.SetSecretKey("readonly-secret")
    
    // Use different auth for different operations
    tradingCtx, _ := tradingAuth.ContextWithValue(context.Background())
    readOnlyCtx, _ := readOnlyAuth.ContextWithValue(context.Background())
    
    // Trading operations use trading auth with automatic JSON parsing
    orderRequest := &models.OrderPlaceOrderRequest{}
    err := client.SendOrderPlace(tradingCtx, orderRequest, func(response *models.OrderPlaceOrderResponse, err error) error {
        if err != nil {
            if apiErr, ok := IsAPIError(err); ok {
                if apiErr.Status == 429 {
                    log.Printf("Trading rate limit exceeded: %s", apiErr.Message)
                    return nil
                }
                log.Printf("Trading error: %s", apiErr.Error())
                return nil
            }
            return err
        }
        
        // Response is automatically parsed - ready to use!
        log.Printf("Order placed: %+v", response.Result)
        return nil
    })
    if err != nil {
        log.Printf("Error placing order: %v", err)
    }
    
    // Account info uses read-only auth with automatic JSON parsing
    accountRequest := &models.AccountStatusAccountStatusRequest{}
    err = client.SendAccountStatus(readOnlyCtx, accountRequest, func(response *models.AccountStatusAccountStatusResponse, err error) error {
        if err != nil {
            if apiErr, ok := IsAPIError(err); ok {
                log.Printf("Account status error: %s", apiErr.Error())
                return nil
            }
            return err
        }
        
        // Response is automatically parsed - ready to use!
        log.Printf("Account status: %+v", response.Result)
        return nil
    })
    if err != nil {
        log.Printf("Error getting account status: %v", err)
    }
}
\`\`\`

### 5. RSA Authentication

\`\`\`go
package main

import (
    "context"
    "log"
    "os"
    "${moduleName}"
)

func main() {
    // Load RSA private key from PEM file
    pemData, err := os.ReadFile("path/to/your/private-key.pem")
    if err != nil {
        log.Fatalf("Failed to read PEM file: %v", err)
    }
    
    // Create RSA auth
    auth := NewAuth("your-api-key")
    if err := auth.SetPrivateKey(pemData); err != nil {
        log.Fatalf("Failed to set private key: %v", err)
    }
    client := NewClientWithAuth(auth)
    
    // Connect and use authenticated endpoints with automatic JSON parsing
    ctx := context.Background()
    if err := client.Connect(ctx); err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer client.Disconnect()
    
    // Example authenticated request with automatic JSON parsing
    request := &models.AccountCommissionAccountCommissionRatesRequest{}
    err = client.SendAccountCommission(ctx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
        if err != nil {
            if apiErr, ok := IsAPIError(err); ok {
                log.Printf("RSA auth error: %s", apiErr.Error())
                return nil
            }
            return err
        }
        
        // Response is automatically parsed - ready to use!
        log.Printf("Account commission: %+v", response.Result)
        return nil
    })
    if err != nil {
        log.Printf("Error with RSA auth: %v", err)
    }
}
\`\`\`

### 6. Ed25519 Authentication (Recommended)

\`\`\`go
package main

import (
    "context"
    "log"
    "os"
    "${moduleName}"
)

func main() {
    // Load Ed25519 private key from PEM file
    pemData, err := os.ReadFile("path/to/your/ed25519-key.pem")
    if err != nil {
        log.Fatalf("Failed to read PEM file: %v", err)
    }
    
    // Create Ed25519 auth (recommended for best performance)
    auth := NewAuth("your-api-key")
    if err := auth.SetPrivateKey(pemData); err != nil {
        log.Fatalf("Failed to set private key: %v", err)
    }
    client := NewClientWithAuth(auth)
    
    // Connect and use authenticated endpoints with automatic JSON parsing
    ctx := context.Background()
    if err := client.Connect(ctx); err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer client.Disconnect()
    
    // Example authenticated request with comprehensive error handling and automatic JSON parsing
    request := &models.AccountCommissionAccountCommissionRatesRequest{}
    err = client.SendAccountCommission(ctx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
        if err != nil {
            if apiErr, ok := IsAPIError(err); ok {
                switch apiErr.Status {
                case 400:
                    log.Printf("Bad request with Ed25519: %s", apiErr.Message)
                case 401:
                    log.Printf("Ed25519 authentication failed: %s", apiErr.Message)
                case 403:
                    log.Printf("Ed25519 access forbidden: %s", apiErr.Message)
                case 429:
                    log.Printf("Ed25519 rate limit: %s", apiErr.Message)
                default:
                    log.Printf("Ed25519 API error: %s", apiErr.Error())
                }
                return nil
            }
            return err
        }
        
        // Response is automatically parsed - ready to use!
        log.Printf("Ed25519 account commission: %+v", response.Result)
        return nil
    })
    if err != nil {
        log.Printf("Error with Ed25519 auth: %v", err)
    }
}
\`\`\`

## Event Handling and OneOf Support

### Setting Up Event Handlers

\`\`\`go
package main

import (
    "context"
    "log"
    "${moduleName}"
)

func main() {
    client := NewClient()
    
    ctx := context.Background()
    if err := client.Connect(ctx); err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer client.Disconnect()
    
    // Setup individual event handlers for different event types
    client.HandleExecutionReportEvent(func(event *models.ExecutionReportEvent) error {
        log.Printf("Order update: Symbol=%s, Side=%s, Status=%s", event.S, event.Side, event.X)
        return nil
    })
    
    client.HandleBalanceUpdateEvent(func(event *models.BalanceUpdateEvent) error {
        log.Printf("Balance update: Asset=%s, Delta=%s", event.A, event.D)
        return nil
    })
    
    client.HandleOutboundAccountPositionEvent(func(event *models.OutboundAccountPositionEvent) error {
        log.Printf("Account position update: Event time=%d", event.E)
        return nil
    })
    
    // Or setup all default handlers at once
    client.SetupDefaultUserDataStreamHandlers()
    
    // Subscribe to user data stream (requires authentication)
    auth := NewAuth("your-api-key")
    auth.SetSecretKey("your-secret-key")
    authCtx, _ := auth.ContextWithValue(context.Background())
    
    request := &models.UserDataStreamSubscribeRequest{}
    err := client.SendUserDataStreamSubscribe(authCtx, request, func(response *models.UserDataStreamSubscribeResponse, err error) error {
        if err != nil {
            if apiErr, ok := IsAPIError(err); ok {
                log.Printf("UserDataStream error: %s", apiErr.Error())
                return nil
            }
            return err
        }
        
        log.Printf("UserDataStream subscribed: %+v", response.Result)
        return nil
    })
    if err != nil {
        log.Printf("Error subscribing to user data stream: %v", err)
    }
}
\`\`\`

### Response History Management

\`\`\`go
// Get all received responses
history := client.GetResponseHistory()
log.Printf("Received %d responses", len(history))

// Clear history when needed
client.ClearResponseHistory()

// Access specific responses
for i, response := range history {
    log.Printf("Response %d: %+v", i+1, response)
}
\`\`\`

## Authentication Flow

The client automatically handles authentication for you:

1. **Detects Authentication Type**: Extracts the required authentication type from the API endpoint name
2. **Resolves Authentication**: Uses context-based auth first, then falls back to client-level auth
3. **Adds Credentials**: Automatically adds \`apiKey\` parameter for authenticated requests
4. **Generates Timestamp**: Adds current timestamp for signed requests
5. **Signs Request**: Generates and adds the required signature using your chosen method
6. **Sends Request**: Transmits the properly authenticated request

## Authentication Priority

Authentication is resolved in the following priority order:

1. **Context Authentication**: Authentication passed via \`ContextBinanceAuth\` in the request context
2. **Client Authentication**: Authentication set on the client instance during creation
3. **Error**: If neither is available and the operation requires authentication, an error is returned

## Context Keys

The client uses the following context keys for per-request configuration:

- \`ContextBinanceAuth\`: Used to pass \`Auth\` instances for per-request authentication

## Signing Methods Comparison

| Method | Key Size | Performance | Security | Recommended |
|--------|----------|-------------|----------|-------------|
| HMAC-SHA256 | 32+ bytes | Fastest | High | Good for high-frequency trading |
| RSA | 2048+ bits | Moderate | High | Standard corporate use |
| Ed25519 | 32 bytes | Fast | Very High | **Recommended** - Best balance |

## Error Handling

The client provides clear error messages for authentication issues and API errors:

### Authentication Errors

\`\`\`go
ctx := context.Background()
err := client.SendSomeAuthenticatedRequest(ctx, request, func(response *models.SomeResponseType, err error) error {
    if err != nil {
        if strings.Contains(err.Error(), "authentication required") {
            log.Println("Please set up authentication credentials")
        } else if strings.Contains(err.Error(), "failed to sign request") {
            log.Println("Check your API credentials")
        } else if apiErr, ok := IsAPIError(err); ok {
            log.Printf("API error: Status=%d, Message=%s", apiErr.Status, apiErr.Message)
        } else {
            log.Printf("Other error: %v", err)
        }
    } else {
        // Response is automatically parsed - ready to use!
        log.Printf("Success: %+v", response.Result)
    }
    return nil
})
\`\`\`

### Context Authentication Errors

If authentication is required but not provided in either context or client:

\`\`\`go
// This will return an error for authenticated operations
ctx := context.Background() // No auth in context
client := NewClient()       // No auth on client

request := &models.AccountCommissionAccountCommissionRatesRequest{}
err := client.SendAccountCommission(ctx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
    if err != nil {
        log.Printf("Error: %v", err)
        // Returns: "authentication required for USER_DATA request but no auth provided in context or client"
    }
    return nil
})
\`\`\`

### Common API Error Status Codes

| Status | Description | Typical Response |
|--------|-------------|------------------|
| 200 | Success | Process response normally |
| 400 | Bad Request | Check request parameters |
| 401 | Unauthorized | Check API key and signature |
| 403 | Forbidden | WAF blocked or insufficient permissions |
| 409 | Conflict | Partial success, check error details |
| 418 | I'm a teapot | Auto-banned for rate limit violations |
| 429 | Too Many Requests | Rate limit exceeded, slow down |
| 5xx | Server Error | Retry with exponential backoff |

### Response Handlers

Response handlers work the same way regardless of authentication method, with automatic JSON parsing:

\`\`\`go
responseHandler := func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
    if err != nil {
        if apiErr, ok := IsAPIError(err); ok {
            log.Printf("API Error: Status=%d, Code=%d, Message=%s, ID=%s", 
                apiErr.Status, apiErr.Code, apiErr.Message, apiErr.ID)
            return nil // Error handled
        }
        log.Printf("Other error: %v", err)
        return err
    }
    
    // Response is automatically parsed - ready to use!
    log.Printf("Received response: %+v", response.Result)
    return nil
}
\`\`\`

## Migration Guide

### From Previous Version (Adding Context Support)

**Old method signatures:**
\`\`\`go
client.SendAccountCommission(request, responseHandler)
\`\`\`

**New method signatures:**
\`\`\`go
client.SendAccountCommission(ctx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
    // Handle both success and error cases - response is automatically parsed!
    return nil
})
\`\`\`

All client methods now require a \`context.Context\` as the first parameter and response handlers receive parsed response objects. This enables:
- Per-request authentication
- Request cancellation and timeouts
- Request tracing and observability
- Proper error handling
- Automatic JSON parsing

### Authentication Migration Strategies

**Strategy 1: Minimal Changes (Backward Compatible)**
\`\`\`go
// Add context.Background() to existing calls and enjoy automatic JSON parsing
ctx := context.Background()
client.SendAccountCommission(ctx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
    if err != nil {
        log.Printf("Error: %v", err)
        return err
    }
    // Response is ready to use - no JSON unmarshaling needed!
    log.Printf("Success: %+v", response.Result)
    return nil
})
\`\`\`

**Strategy 2: Enhanced with Per-Request Auth and Error Handling**
\`\`\`go
// Create per-request auth contexts with comprehensive error handling
authCtx, _ := auth.ContextWithValue(context.Background())
client.SendAccountCommission(authCtx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
    if err != nil {
        if apiErr, ok := IsAPIError(err); ok {
            log.Printf("API Error: %+v", apiErr)
            return nil
        }
        return err
    }
    
    // Response is automatically parsed - ready to use!
    log.Printf("Success: %+v", response.Result)
    return nil
})
\`\`\`

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

## Security Best Practices

1. **Store Keys Securely**: Never hardcode API keys in your source code
2. **Use Environment Variables**: Store credentials in environment variables
3. **Rotate Keys Regularly**: Follow Binance's recommendations for key rotation
4. **Use Ed25519**: Preferred for new implementations
5. **Monitor API Usage**: Keep track of your API usage and rate limits
6. **Use Context Timeouts**: Set appropriate timeouts for requests
7. **Separate Auth by Purpose**: Use different API keys for trading vs. read-only operations
8. **Handle Errors Gracefully**: Always check for API errors and handle them appropriately

## Example Environment Setup

\`\`\`bash
export BINANCE_API_KEY="your-api-key"
export BINANCE_SECRET_KEY="your-secret-key"
# Or for file-based keys:
export BINANCE_PRIVATE_KEY_PATH="/path/to/private-key.pem"
\`\`\`

\`\`\`go
// Load from environment with error handling and automatic JSON parsing
apiKey := os.Getenv("BINANCE_API_KEY")
secretKey := os.Getenv("BINANCE_SECRET_KEY")

if apiKey == "" || secretKey == "" {
    log.Fatal("API credentials not set in environment")
}

auth := NewAuth(apiKey)
auth.SetSecretKey(secretKey)
client := NewClientWithAuth(auth)
\`\`\`

## Advanced Usage Examples

### Using Context with Timeouts and Error Handling

\`\`\`go
// Create context with timeout
ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()

// Use timeout context with authentication, error handling, and automatic JSON parsing
auth := NewAuth("your-api-key")
auth.SetSecretKey("your-secret-key")
authCtx, err := auth.ContextWithValue(ctx)
if err != nil {
    log.Fatal(err)
}

request := &models.AccountCommissionAccountCommissionRatesRequest{}
err = client.SendAccountCommission(authCtx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
    if err != nil {
        if apiErr, ok := IsAPIError(err); ok {
            log.Printf("Timeout or API error: %s", apiErr.Error())
            return nil
        }
        log.Printf("Other error: %v", err)
        return err
    }
    
    // Response is automatically parsed - ready to use!
    log.Printf("Success within timeout: %+v", response.Result)
    return nil
})
\`\`\`

### Multiple Clients with Different Auth

\`\`\`go
// Create separate clients for different purposes
tradingClient := NewClientWithAuth(tradingAuth)
readOnlyClient := NewClientWithAuth(readOnlyAuth)

// Or use same client with different context auth
client := NewClient()
tradingCtx, _ := tradingAuth.ContextWithValue(context.Background())
readOnlyCtx, _ := readOnlyAuth.ContextWithValue(context.Background())
\`\`\`

### Debugging API Errors

\`\`\`go
// Debug handler for troubleshooting API errors with automatic JSON parsing
debugHandler := func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
    if err != nil {
        if apiErr, ok := IsAPIError(err); ok {
            log.Printf("=== API ERROR DEBUG ===")
            log.Printf("Status: %d", apiErr.Status)
            log.Printf("Code: %d", apiErr.Code)
            log.Printf("Message: %s", apiErr.Message)
            log.Printf("Request ID: %s", apiErr.ID)
            log.Printf("======================")
            return nil
        }
        log.Printf("Non-API error: %v", err)
        return err
    }
    
    // Response is automatically parsed - ready to use!
    log.Printf("Success response: %+v", response.Result)
    return nil
}
\`\`\`

## Testing

Run the included tests to verify everything works:

\`\`\`bash
go test -v
go test -bench=. # Run benchmarks
\`\`\`

## Package Information

- **Module**: ${moduleName}
- **Package**: ${packageName}
- **Version**: ${version}
- **Author**: ${author}

## Support

For issues or questions:
1. Check the Binance API documentation
2. Review the included example code
3. Run the test suite to verify your setup
4. Use the debugging examples above to troubleshoot API errors

## License

This generated client follows your project's license terms.
`}
      </Text>
    </File>
  );
} 