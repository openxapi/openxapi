# Binance AsyncAPI WebSocket Client Template

This template generates a Go WebSocket client for Binance's WebSocket API based on AsyncAPI specifications. It provides comprehensive support for **oneOf response types** and **async response management**.

## Features

- ✅ **AsyncAPI 3.0 Compatible**: Full support for AsyncAPI 3.0 specifications
- ✅ **OneOf Support**: Automatic handling of multiple response types in a single endpoint
- ✅ **Async Response Management**: Global response list and type-safe handlers
- ✅ **Type-Safe Go Client**: Generated Go structs with proper types
- ✅ **Event-Driven Architecture**: Support for WebSocket event handling
- ✅ **Response History**: Track all received messages with queryable history
- ✅ **Gorilla WebSocket**: Built on reliable WebSocket implementation
- ✅ **Thread-Safe**: Concurrent-safe operations with proper locking

## New OneOf Features

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

## Generated Files Structure

```
client.go           # Main WebSocket client with oneOf support
models/
├── models.go       # Common utilities and response registry
├── execution_report_event.go
├── balance_update_event.go
├── outbound_account_position_event.go
├── list_status_event.go
├── listen_key_expired_event.go
├── external_lock_update_event.go
└── user_data_stream_subscribe_result.go  # OneOf wrapper type
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