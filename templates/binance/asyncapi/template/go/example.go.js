import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';

  return (
    <File name="example.go">
      <Text>package {packageName}</Text>
      <Text newLines={2}>
        {`import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
)`}
      </Text>

      <Text newLines={2}>
        {`func main() {
	// Create a new WebSocket client
	client := NewClient()

	// Create a context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Connect to the WebSocket server
	if err := client.Connect(ctx); err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect()

	// Handle aggregate trade messages for BTCUSDT
	// Stream name format: <symbol>@<streamType>[_<parameter>]
	err := client.HandleSubscribeSingleStream("btcusdt@aggTrade", func(data []byte) error {
		fmt.Printf("Received single stream data: %s\\n", string(data))
		
		// Parse as aggregate trade message
		var aggTrade AggregateTrade
		if err := ParseMessage(data, &aggTrade); err == nil {
			fmt.Printf("Aggregate Trade - Symbol: %s, Price: %s, Quantity: %s\\n", 
				aggTrade.S, aggTrade.P, aggTrade.Q)
		}
		
		return nil
	})
	if err != nil {
		log.Fatalf("Failed to set up single stream handler: %v", err)
	}

	// Handle combined stream messages
	err = client.HandleSubscribeCombinedStream(func(data []byte) error {
		fmt.Printf("Received combined stream data: %s\\n", string(data))
		
		// Parse as combined message
		var combined CombinedMessage
		if err := ParseMessage(data, &combined); err == nil {
			fmt.Printf("Combined Stream - Stream: %s\\n", combined.Stream)
			
			// Parse the nested data based on stream type
			dataBytes, _ := json.Marshal(combined.Data)
			if contains(combined.Stream, "aggTrade") {
				var aggTrade AggregateTrade
				if err := json.Unmarshal(dataBytes, &aggTrade); err == nil {
					fmt.Printf("  -> Aggregate Trade - Symbol: %s, Price: %s\\n", 
						aggTrade.S, aggTrade.P)
				}
			}
		}
		
		return nil
	})
	if err != nil {
		log.Fatalf("Failed to set up combined stream handler: %v", err)
	}

	fmt.Println("WebSocket client started. Press Ctrl+C to exit...")

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("Shutting down...")
}`}
      </Text>

      <Text newLines={2}>
        {`// contains checks if a string contains a substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && s[len(s)-len(substr):] == substr ||
		   len(s) > len(substr) && s[:len(substr)] == substr ||
		   len(s) > len(substr) && s[len(s)/2-len(substr)/2:len(s)/2+len(substr)/2] == substr
}`}
      </Text>
    </File>
  );
} 