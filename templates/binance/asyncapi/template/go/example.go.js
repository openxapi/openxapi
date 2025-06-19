import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const moduleName = params.moduleName || 'binance-websocket-client';

  return (
    <File name="example.go">
      <Text>package main</Text>
      <Text newLines={2}>
        {`import (
\t"context"
\t"log"
\t"time"
\t"encoding/json"

\t"${moduleName}/models"
)

func main() {
\t// Create a new WebSocket client
\tclient := NewClient()
\t
\t// Connect to the WebSocket server
\tctx := context.Background()
\tif err := client.Connect(ctx); err != nil {
\t\tlog.Fatalf("Failed to connect: %v", err)
\t}
\tdefer client.Disconnect()

\t// Setup default handlers for all user data stream event types
\tclient.SetupDefaultUserDataStreamHandlers()

\t// Example 1: Using the basic userDataStream.subscribe method
\tlog.Println("Example 1: Basic userDataStream.subscribe")
\terr := client.UserDataStreamSubscribe(func(data []byte) error {
\t\tlog.Printf("Received response: %s", string(data))
\t\treturn nil
\t})
\tif err != nil {
\t\tlog.Printf("Error subscribing to user data stream: %v", err)
\t}

\t// Example 2: Using the oneOf handler for automatic type detection
\tlog.Println("Example 2: Using oneOf handler")
\terr = client.UserDataStreamSubscribeWithOneOfHandler(func(result interface{}, responseType string) error {
\t\tlog.Printf("Received %s: %+v", responseType, result)
\t\t
\t\t// Handle specific event types
\t\tswitch responseType {
\t\tcase "OutboundAccountPositionEvent":
\t\t\tif event, ok := result.(*models.OutboundAccountPositionEvent); ok {
\t\t\t\tlog.Printf("Account position update: %+v", event)
\t\t\t}
\t\tcase "BalanceUpdateEvent":
\t\t\tif event, ok := result.(*models.BalanceUpdateEvent); ok {
\t\t\t\tlog.Printf("Balance update: Asset=%s, Delta=%s", event.A, event.D)
\t\t\t}
\t\tcase "ExecutionReportEvent":
\t\t\tif event, ok := result.(*models.ExecutionReportEvent); ok {
\t\t\t\tlog.Printf("Order update: Symbol=%s, Side=%s, Status=%s", event.S, event.S, event.X)
\t\t\t}
\t\tcase "ListenKeyExpiredEvent":
\t\t\tif event, ok := result.(*models.ListenKeyExpiredEvent); ok {
\t\t\t\tlog.Printf("Listen key expired: %s", event.ListenKey)
\t\t\t}
\t\t}
\t\t
\t\treturn nil
\t})
\tif err != nil {
\t\tlog.Printf("Error subscribing with oneOf handler: %v", err)
\t}

\t// Example 3: Register custom global handlers for specific event types
\tlog.Println("Example 3: Custom global handlers")
\tclient.RegisterGlobalHandler("ExecutionReportEvent", func(data interface{}) error {
\t\tif event, ok := data.(*models.ExecutionReportEvent); ok {
\t\t\tlog.Printf("Custom handler - Order %s: %s %s shares at %s", 
\t\t\t\tevent.I, event.S, event.Q, event.P)
\t\t}
\t\treturn nil
\t})

\tclient.RegisterGlobalHandler("BalanceUpdateEvent", func(data interface{}) error {
\t\tif event, ok := data.(*models.BalanceUpdateEvent); ok {
\t\t\tlog.Printf("Custom handler - Balance change: %s %s", 
\t\t\t\tevent.D, event.A)
\t\t}
\t\treturn nil
\t})

\t// Example 4: Using the userDataStream.unsubscribe method
\tlog.Println("Example 4: Unsubscribe from user data stream")
\ttime.Sleep(5 * time.Second) // Wait a bit before unsubscribing
\terr = client.UserDataStreamUnsubscribe(func(data []byte) error {
\t\tlog.Printf("Unsubscribe response: %s", string(data))
\t\treturn nil
\t})
\tif err != nil {
\t\tlog.Printf("Error unsubscribing from user data stream: %v", err)
\t}

\t// Example 5: Working with the global response history
\tlog.Println("Example 5: Response history")
\ttime.Sleep(2 * time.Second)
\thistory := client.GetResponseHistory()
\tlog.Printf("Total responses received: %d", len(history))
\t
\t// Display last few responses
\tfor i, response := range history {
\t\tif i >= len(history)-3 { // Show last 3 responses
\t\t\tif responseBytes, err := json.Marshal(response); err == nil {
\t\t\t\tlog.Printf("Response %d: %s", i+1, string(responseBytes))
\t\t\t}
\t\t}
\t}

\t// Example 6: Manual oneOf parsing
\tlog.Println("Example 6: Manual oneOf parsing")
\tsampleEventData := []byte(\`{
\t\t"id": "test-123",
\t\t"result": {
\t\t\t"e": "executionReport",
\t\t\t"E": 1499405658658,
\t\t\t"s": "ETHBTC",
\t\t\t"c": "mUvoqJxFIILMdfAW5iGSOW",
\t\t\t"S": "BUY",
\t\t\t"o": "LIMIT",
\t\t\t"q": "1.00000000",
\t\t\t"p": "0.10264410"
\t\t},
\t\t"status": 200
\t}\`)

\tresult, responseType, err := ParseOneOfMessage(sampleEventData)
\tif err != nil {
\t\tlog.Printf("Error parsing oneOf message: %v", err)
\t} else {
\t\tlog.Printf("Parsed message type: %s", responseType)
\t\tlog.Printf("Parsed result: %+v", result)
\t}

\t// Example 7: Type-safe oneOf access
\tlog.Println("Example 7: Type-safe oneOf access")
\tif responseType == "ExecutionReportEvent" {
\t\tif executionEvent, ok := result.(*models.ExecutionReportEvent); ok {
\t\t\tlog.Printf("Symbol: %s, Side: %s, Quantity: %s, Price: %s",
\t\t\t\texecutionEvent.S, executionEvent.S, executionEvent.Q, executionEvent.P)
\t\t}
\t}

\t// Clean up response history
\tclient.ClearResponseHistory()
\tlog.Println("Response history cleared")

\t// Keep the connection alive for a while to receive events
\tlog.Println("Listening for events for 30 seconds...")
\ttime.Sleep(30 * time.Second)
\tlog.Println("Example completed")
}`}
      </Text>
    </File>
  );
} 