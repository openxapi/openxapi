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
\t// Example 1: Create a client without authentication (for public endpoints)
\tclient := NewClient()
\t
\t// Example 2: Create a client with HMAC authentication
\t// auth := NewAuth("your-api-key")
\t// auth.SetSecretKey("your-secret-key")
\t// client := NewClientWithAuth(auth)
\t
\t// Example 3: Create a client with RSA authentication
\t// auth := NewAuth("your-api-key")
\t// auth.SetPrivateKeyPath("path/to/your/rsa-key.pem")
\t// // Optional: auth.SetPassphrase("your-passphrase") if key is encrypted
\t// client := NewClientWithAuth(auth)
\t
\t// Example 4: Create a client with Ed25519 authentication
\t// auth := NewAuth("your-api-key")
\t// auth.SetPrivateKeyPath("path/to/your/ed25519-key.pem")
\t// // Optional: auth.SetPassphrase("your-passphrase") if key is encrypted
\t// client := NewClientWithAuth(auth)
\t
\t// Example 5: Create a client with private key from byte array
\t// pemData := []byte(\`-----BEGIN RSA PRIVATE KEY-----
\t// ... your RSA private key here ...
\t// -----END RSA PRIVATE KEY-----\`)
\t// auth := NewAuth("your-api-key")
\t// if err := auth.SetPrivateKey(pemData); err != nil {
\t// \tlog.Fatalf("Error setting private key: %v", err)
\t// }
\t// client := NewClientWithAuth(auth)
\t
\t// Connect to the WebSocket server
\tctx := context.Background()
\tif err := client.Connect(ctx); err != nil {
\t\tlog.Fatalf("Failed to connect: %v", err)
\t}
\tdefer client.Disconnect()

\t// Setup default handlers for all user data stream event types
\tclient.SetupDefaultUserDataStreamHandlers()

\t// Example 1: Using the ping API to test connectivity
\tlog.Println("Example 1: Testing connectivity with ping")
\terr := client.SendPingDefault(ctx, func(response *models.PingTestConnectivityResponse, err error) error {
\t\tif err != nil {
\t\t\tlog.Printf("Ping error: %v", err)
\t\t\treturn err
\t\t}
\t\tlog.Printf("Ping response: ID=%s, Status=%d", response.Id, response.Status)
\t\treturn nil
\t})
\tif err != nil {
\t\tlog.Printf("Error sending ping: %v", err)
\t}

\t// Example 2: Get server time
\tlog.Println("Example 2: Getting server time")
\terr = client.SendTimeDefault(ctx, func(response *models.TimeCheckServerTimeResponse, err error) error {
\t\tif err != nil {
\t\t\tlog.Printf("Time error: %v", err)
\t\t\treturn err
\t\t}
\t\tlog.Printf("Time response: ID=%s, Status=%d", response.Id, response.Status)
\t\tif response.Result.ServerTime != 0 {
\t\t\tserverTime := time.UnixMilli(response.Result.ServerTime)
\t\t\tlog.Printf("Server time: %s", serverTime.Format("2006-01-02 15:04:05"))
\t\t}
\t\treturn nil
\t})
\tif err != nil {
\t\tlog.Printf("Error getting server time: %v", err)
\t}

\t// Example 3: Get exchange information
\tlog.Println("Example 3: Getting exchange information")
\terr = client.SendExchangeInfoDefault(ctx, func(response *models.ExchangeInfoExchangeInformationResponse, err error) error {
\t\tif err != nil {
\t\t\tlog.Printf("ExchangeInfo error: %v", err)
\t\t\treturn err
\t\t}
\t\tlog.Printf("ExchangeInfo response: ID=%s, Status=%d", response.Id, response.Status)
\t\tif len(response.Result.Symbols) > 0 {
\t\t\tlog.Printf("Total symbols: %d", len(response.Result.Symbols))
\t\t}
\t\treturn nil
\t})
\tif err != nil {
\t\tlog.Printf("Error getting exchange info: %v", err)
\t}

\t// Example 4: Get order book for BTCUSDT
\tlog.Println("Example 4: Getting order book for BTCUSDT")
\tdepthRequest := &models.DepthOrderBookRequest{
\t\tParams: models.DepthOrderBookRequestParams{
\t\t\tSymbol: "BTCUSDT",
\t\t\tLimit:  10,
\t\t},
\t}
\terr = client.SendDepth(ctx, depthRequest, func(response *models.DepthOrderBookResponse, err error) error {
\t\tif err != nil {
\t\t\tlog.Printf("Depth error: %v", err)
\t\t\treturn err
\t\t}
\t\tlog.Printf("Depth response: ID=%s, Status=%d", response.Id, response.Status)
\t\tif response.Result.LastUpdateId != 0 {
\t\t\tlog.Printf("Last update ID: %d", response.Result.LastUpdateId)
\t\t}
\t\tif len(response.Result.Bids) > 0 {
\t\t\tlog.Printf("Number of bids: %d", len(response.Result.Bids))
\t\t}
\t\tif len(response.Result.Asks) > 0 {
\t\t\tlog.Printf("Number of asks: %d", len(response.Result.Asks))
\t\t}
\t\treturn nil
\t})
\tif err != nil {
\t\tlog.Printf("Error getting depth: %v", err)
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
\t\t\t\tresponseStr := string(responseBytes)
\t\t\t\tif len(responseStr) > 200 {
\t\t\t\t\tresponseStr = responseStr[:200] + "..."
\t\t\t\t}
\t\t\t\tlog.Printf("Response %d: %s", i+1, responseStr)
\t\t\t}
\t\t}
\t}

\t// Clean up response history
\tclient.ClearResponseHistory()
\tlog.Println("Response history cleared")

\t// Keep the connection alive for a while to receive events
\tlog.Println("Listening for events for 10 seconds...")
\ttime.Sleep(10 * time.Second)
\tlog.Println("Example completed")
}`}
      </Text>
    </File>
  );
} 