# Go WebSocket Template for AsyncAPI

This template generates a Go WebSocket client from AsyncAPI v3 specifications using the React render engine. It's specifically designed to work with WebSocket-based APIs and generates type-safe Go code with proper error handling and concurrent message processing.

## Features

- ✅ **AsyncAPI v3 Support**: Full compatibility with AsyncAPI 3.0 specifications
- ✅ **React Render Engine**: Uses the modern React render engine instead of deprecated Nunjucks
- ✅ **WebSocket Support**: Generates WebSocket clients using the popular Gorilla WebSocket library
- ✅ **Type Safety**: Automatically generates Go structs from JSON schemas
- ✅ **Concurrent Processing**: Built-in support for handling multiple WebSocket connections
- ✅ **Error Handling**: Comprehensive error handling and logging
- ✅ **Parameterized**: Configurable server endpoints and module names

## Generated Files

The template generates the following files:

- `client.go` - Main WebSocket client with connection management and message handlers
- `go.mod` - Go module file with required dependencies
- `example.go` - Example usage showing how to use the generated client

## Prerequisites

- Node.js and npm (for running the AsyncAPI generator)
- Go 1.21 or later
- AsyncAPI CLI

## Installation

1. Install the AsyncAPI CLI:
```bash
npm install -g @asyncapi/cli
```

2. Clone or download this template

## Usage

### Basic Generation

Generate a Go WebSocket client from your AsyncAPI specification:

```bash
asyncapi generate fromTemplate your-asyncapi.yml ./go-websocket-template --output ./generated-client --param server=production --param moduleName=my-websocket-client
```

### Parameters

| Parameter | Description | Required | Default | Example |
|-----------|-------------|----------|---------|---------|
| `server` | The server configuration to use from your AsyncAPI spec | Yes | - | `production` |
| `moduleName` | The Go module name for the generated client | Yes | - | `binance-websocket-client` |
| `packageName` | The Go package name | No | `main` | `client` |

### Example AsyncAPI Specification

Your AsyncAPI specification should define WebSocket servers and channels:

```yaml
asyncapi: 3.0.0
info:
  title: My WebSocket API
  version: 1.0.0

servers:
  production:
    host: api.example.com:443
    protocol: wss
    description: Production WebSocket server

channels:
  dataStream:
    address: '/ws/data'
    messages:
      dataMessage:
        $ref: '#/components/messages/DataMessage'

operations:
  subscribeToData:
    action: receive
    channel:
      $ref: '#/channels/dataStream'

components:
  messages:
    DataMessage:
      contentType: application/json
      payload:
        type: object
        properties:
          id:
            type: string
          data:
            type: object
```

## Generated Client Usage

After generation, you can use the client like this:

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"
)

func main() {
    // Create a new WebSocket client
    client := NewClient()

    // Connect with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    if err := client.Connect(ctx); err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer client.Disconnect()

    // Handle messages
    err := client.HandleSubscribeToData(func(data []byte) error {
        fmt.Printf("Received: %s\n", string(data))
        
        // Parse into struct
        var msg DataMessage
        if err := ParseMessage(data, &msg); err == nil {
            fmt.Printf("Parsed message ID: %s\n", msg.Id)
        }
        
        return nil
    })
    
    if err != nil {
        log.Fatalf("Failed to set up handler: %v", err)
    }

    // Keep the program running
    select {}
}
```

## Template Structure

```
go-websocket-template/
├── components/
│   ├── MessageStructs.js    # Generates Go structs from JSON schemas
│   └── WebSocketHandlers.js # Generates handler methods for operations
├── template/
│   ├── client.go.js         # Main client template
│   ├── go.mod.js           # Go module template
│   └── example.go.js       # Example usage template
├── test/
│   └── fixtures/
│       └── asyncapi.yml    # Test AsyncAPI specification
├── package.json            # Template configuration
└── README.md              # This file
```

## Development

To test the template during development:

```bash
# Install dependencies
npm install

# Generate test client
npm run test:generate

# Build the generated client
npm run test:build

# Run all tests
npm test
```

## Supported Protocols

- WebSocket (`ws`)
- WebSocket Secure (`wss`)

## Dependencies

The generated Go client uses:

- [Gorilla WebSocket](https://github.com/gorilla/websocket) - WebSocket implementation
- Standard Go libraries for JSON parsing, context handling, and concurrency

## Limitations

- Currently supports receive operations only (subscribing to messages)
- Designed for JSON message payloads
- Requires Go 1.21+ for generics support in `ParseMessage` function

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `npm test`
5. Submit a pull request

## License

This template is released under the MIT License.

## Related

- [AsyncAPI Specification](https://www.asyncapi.com/docs/reference/specification/v3.0.0)
- [AsyncAPI Generator](https://www.asyncapi.com/docs/tools/generator)
- [React Render Engine](https://www.asyncapi.com/docs/tools/generator/react-render-engine)
- [Gorilla WebSocket](https://github.com/gorilla/websocket) 