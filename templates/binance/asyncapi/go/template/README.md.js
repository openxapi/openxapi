import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const moduleName = params.moduleName || 'binance-websocket-client';

  return (
    <File name="README.md">
      <Text>
{`# Binance WebSocket API Client with Authentication

This Go client provides comprehensive support for Binance's WebSocket API with built-in authentication for all security types.

## Features

- ✅ **Multiple Authentication Methods**: HMAC-SHA256, RSA, and Ed25519 signing
- ✅ **Context-Based Authentication**: Per-request authentication via Go's context.Context
- ✅ **Automatic Authentication**: Detects authentication requirements from API specifications
- ✅ **Flexible Auth Strategy**: Client-level or per-request authentication
- ✅ **Type-Safe**: Generated Go structs with proper types
- ✅ **Concurrent-Safe**: Thread-safe operations with proper locking
- ✅ **OneOf Support**: Automatic handling of multiple response types
- ✅ **Comprehensive Testing**: Unit tests and benchmarks included

## Authentication Types

Binance WebSocket API supports four authentication types:

| Type | Description | Signature Required |
|------|-------------|-------------------|
| \`NONE\` | Public market data | No |
| \`USER_STREAM\` | User data stream management | No |
| \`USER_DATA\` | Private account information | Yes |
| \`TRADE\` | Trading operations | Yes |

The client automatically detects the required authentication type based on the API endpoint.

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
    
    // Use public endpoints (no authentication required)
    // All methods now require context as first parameter
    // Example: Get exchange information, order book, etc.
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
    
    // Now you can use authenticated endpoints
    // The client will automatically sign requests as needed
    request := &models.AccountCommissionAccountCommissionRatesRequest{}
    client.SendAccountCommission(ctx, request, responseHandler)
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
    
    // Use per-request auth
    request := &models.AccountCommissionAccountCommissionRatesRequest{}
    client.SendAccountCommission(authCtx, request, responseHandler)
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
    
    // Trading operations use trading auth
    orderRequest := &models.OrderPlaceOrderRequest{}
    client.SendOrderPlace(tradingCtx, orderRequest, orderResponseHandler)
    
    // Account info uses read-only auth
    accountRequest := &models.AccountStatusAccountStatusRequest{}
    client.SendAccountStatus(readOnlyCtx, accountRequest, accountResponseHandler)
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
    
    // Connect and use authenticated endpoints
    ctx := context.Background()
    if err := client.Connect(ctx); err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer client.Disconnect()
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
    
    // Connect and use authenticated endpoints
    ctx := context.Background()
    if err := client.Connect(ctx); err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer client.Disconnect()
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

The client provides clear error messages for authentication issues:

\`\`\`go
ctx := context.Background()
err := client.SendSomeAuthenticatedRequest(ctx, request, handler)
if err != nil {
    if strings.Contains(err.Error(), "authentication required") {
        log.Println("Please set up authentication credentials")
    } else if strings.Contains(err.Error(), "failed to sign request") {
        log.Println("Check your API credentials")
    } else {
        log.Printf("Other error: %v", err)
    }
}
\`\`\`

### Context Authentication Errors

If authentication is required but not provided in either context or client:

\`\`\`go
// This will return an error for authenticated operations
ctx := context.Background() // No auth in context
client := NewClient()       // No auth on client

request := &models.AccountCommissionAccountCommissionRatesRequest{}
err := client.SendAccountCommission(ctx, request, responseHandler)
// Returns: "authentication required for USER_DATA request but no auth provided in context or client"
\`\`\`

### Response Handlers

Response handlers work the same way regardless of authentication method:

\`\`\`go
responseHandler := func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
    if err != nil {
        log.Printf("Error: %v", err)
        return err
    }
    
    log.Printf("Received response: %+v", response)
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
client.SendAccountCommission(ctx, request, responseHandler)
\`\`\`

All client methods now require a \`context.Context\` as the first parameter. This enables:
- Per-request authentication
- Request cancellation and timeouts
- Request tracing and observability

### Authentication Migration Strategies

**Strategy 1: Minimal Changes (Backward Compatible)**
\`\`\`go
// Add context.Background() to existing calls
ctx := context.Background()
client.SendAccountCommission(ctx, request, responseHandler)
\`\`\`

**Strategy 2: Enhanced with Per-Request Auth**
\`\`\`go
// Create per-request auth contexts
authCtx, _ := auth.ContextWithValue(context.Background())
client.SendAccountCommission(authCtx, request, responseHandler)
\`\`\`

## Security Best Practices

1. **Store Keys Securely**: Never hardcode API keys in your source code
2. **Use Environment Variables**: Store credentials in environment variables
3. **Rotate Keys Regularly**: Follow Binance's recommendations for key rotation
4. **Use Ed25519**: Preferred for new implementations
5. **Monitor API Usage**: Keep track of your API usage and rate limits
6. **Use Context Timeouts**: Set appropriate timeouts for requests
7. **Separate Auth by Purpose**: Use different API keys for trading vs. read-only operations

## Example Environment Setup

\`\`\`bash
export BINANCE_API_KEY="your-api-key"
export BINANCE_SECRET_KEY="your-secret-key"
# Or for file-based keys:
export BINANCE_PRIVATE_KEY_PATH="/path/to/private-key.pem"
\`\`\`

\`\`\`go
// Load from environment
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

### Using Context with Timeouts

\`\`\`go
// Create context with timeout
ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()

// Use timeout context with authentication
auth := NewAuth("your-api-key")
auth.SetSecretKey("your-secret-key")
authCtx, err := auth.ContextWithValue(ctx)
if err != nil {
    log.Fatal(err)
}

request := &models.AccountCommissionAccountCommissionRatesRequest{}
client.SendAccountCommission(authCtx, request, responseHandler)
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

## Testing

Run the included tests to verify everything works:

\`\`\`bash
go test -v
go test -bench=. # Run benchmarks
\`\`\`

## Support

For issues or questions:
1. Check the Binance API documentation
2. Review the included example code
3. Run the test suite to verify your setup

## License

This generated client follows your project's license terms.
`}
      </Text>
    </File>
  );
} 