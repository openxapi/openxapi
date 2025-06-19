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
- ✅ **Automatic Authentication**: Detects authentication requirements from API specifications
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
    // Example: Get exchange information, order book, etc.
}
\`\`\`

### 2. HMAC Authentication

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
}
\`\`\`

### 3. RSA Authentication

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

### 4. Ed25519 Authentication (Recommended)

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
2. **Adds Credentials**: Automatically adds \`apiKey\` parameter for authenticated requests
3. **Generates Timestamp**: Adds current timestamp for signed requests
4. **Signs Request**: Generates and adds the required signature using your chosen method
5. **Sends Request**: Transmits the properly authenticated request

## Signing Methods Comparison

| Method | Key Size | Performance | Security | Recommended |
|--------|----------|-------------|----------|-------------|
| HMAC-SHA256 | 32+ bytes | Fastest | High | Good for high-frequency trading |
| RSA | 2048+ bits | Moderate | High | Standard corporate use |
| Ed25519 | 32 bytes | Fast | Very High | **Recommended** - Best balance |

## Error Handling

The client provides clear error messages for authentication issues:

\`\`\`go
err := client.SendSomeAuthenticatedRequest(request, handler)
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

## Security Best Practices

1. **Store Keys Securely**: Never hardcode API keys in your source code
2. **Use Environment Variables**: Store credentials in environment variables
3. **Rotate Keys Regularly**: Follow Binance's recommendations for key rotation
4. **Use Ed25519**: Preferred for new implementations
5. **Monitor API Usage**: Keep track of your API usage and rate limits

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