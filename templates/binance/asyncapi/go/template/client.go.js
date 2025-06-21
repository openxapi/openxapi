import { File, Text } from '@asyncapi/generator-react-sdk';
import { WebSocketHandlers } from './components/WebSocketHandlers';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const moduleName = params.moduleName || 'binance-websocket-client';
  
  const serverUrl = asyncapi.servers().get(params.server) || asyncapi.servers().all()[0];

  // Get all channels to generate handler methods
  const channels = asyncapi.channels();

  return (
    <File name="client.go">
      <Text>package {packageName}</Text>
      <Text newLines={2}>
        {`import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"${moduleName}/models"
)`}
      </Text>

      <Text newLines={2}>
        {`// Context keys for authentication and configuration
type contextKey string

const (
	// ContextBinanceAuth takes Auth as authentication for the request
	ContextBinanceAuth = contextKey("binanceAuth")
)`}
      </Text>

      <Text newLines={2}>
        {`// ResponseHandler represents a handler for a specific response type
type ResponseHandler struct {
	RequestID string
	Handler   func([]byte) error
}

// GlobalResponseHandler handles all possible response types
type GlobalResponseHandler struct {
	Handlers map[string]func(interface{}) error
	mu       sync.RWMutex
}

// NewGlobalResponseHandler creates a new global response handler
func NewGlobalResponseHandler() *GlobalResponseHandler {
	return &GlobalResponseHandler{
		Handlers: make(map[string]func(interface{}) error),
	}
}

// RegisterHandler registers a handler for a specific response type
func (g *GlobalResponseHandler) RegisterHandler(responseType string, handler func(interface{}) error) {
	g.mu.Lock()
	g.Handlers[responseType] = handler
	g.mu.Unlock()
}

// HandleResponse processes a response based on its type
func (g *GlobalResponseHandler) HandleResponse(responseType string, data interface{}) error {
	g.mu.RLock()
	handler, exists := g.Handlers[responseType]
	g.mu.RUnlock()
	
	if exists && handler != nil {
		return handler(data)
	}
	
	log.Printf("No global handler found for response type: %s", responseType)
	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// Client represents a WebSocket client for ${asyncapi.info().title()}
type Client struct {
	conn                  *websocket.Conn
	url                   string
	responseHandlers      map[string]func([]byte) error
	globalResponseHandler *GlobalResponseHandler
	responseList          []interface{} // Global list of all received responses
	auth                  *Auth // Authentication configuration
	mu                    sync.RWMutex
	done                  chan struct{}
}`}
      </Text>

      <Text newLines={2}>
        {`// NewClient creates a new WebSocket client
func NewClient() *Client {
	baseURL := "${serverUrl.protocol()}://${serverUrl.host()}${serverUrl.pathname()}"
	return &Client{
		url:                   baseURL,
		responseHandlers:      make(map[string]func([]byte) error),
		globalResponseHandler: NewGlobalResponseHandler(),
		responseList:          make([]interface{}, 0),
		done:                  make(chan struct{}),
	}
}

// NewClientWithAuth creates a new WebSocket client with authentication
func NewClientWithAuth(auth *Auth) *Client {
	client := NewClient()
	client.auth = auth
	return client
}

// SetAuth sets authentication for the client
func (c *Client) SetAuth(auth *Auth) {
	c.auth = auth
}`}
      </Text>

      <Text newLines={2}>
        {`// Connect establishes a WebSocket connection
func (c *Client) Connect(ctx context.Context) error {
	u, err := url.Parse(c.url)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	c.conn = conn
	go c.readMessages()
	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// Disconnect closes the WebSocket connection
func (c *Client) Disconnect() error {
	close(c.done)
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// GenerateRequestID generates a unique UUID v4 request ID (global function)
func GenerateRequestID() string {
	return uuid.New().String()
}`}
      </Text>

      <Text newLines={2}>
        {`// registerResponseHandler registers a response handler for a specific request ID
func (c *Client) registerResponseHandler(requestID string, handler func([]byte) error) {
	c.mu.Lock()
	c.responseHandlers[requestID] = handler
	c.mu.Unlock()
}`}
      </Text>

      <Text newLines={2}>
        {`// RegisterGlobalHandler registers a global handler for a specific response type
func (c *Client) RegisterGlobalHandler(responseType string, handler func(interface{}) error) {
	c.globalResponseHandler.RegisterHandler(responseType, handler)
}`}
      </Text>

      <Text newLines={2}>
        {`// GetResponseHistory returns a copy of all received responses
func (c *Client) GetResponseHistory() []interface{} {
	c.mu.RLock()
	history := make([]interface{}, len(c.responseList))
	copy(history, c.responseList)
	c.mu.RUnlock()
	return history
}`}
      </Text>

      <Text newLines={2}>
        {`// ClearResponseHistory clears the response history
func (c *Client) ClearResponseHistory() {
	c.mu.Lock()
	c.responseList = c.responseList[:0]
	c.mu.Unlock()
}`}
      </Text>

      <Text newLines={2}>
        {`// addToResponseList adds a response to the global response list
func (c *Client) addToResponseList(response interface{}) {
	c.mu.Lock()
	c.responseList = append(c.responseList, response)
	c.mu.Unlock()
}`}
      </Text>

      <Text newLines={2}>
        {`// sendRequest sends a JSON request to the WebSocket server
func (c *Client) sendRequest(request map[string]interface{}) error {
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}

	data, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	return c.conn.WriteMessage(websocket.TextMessage, data)
}`}
      </Text>

      <Text newLines={2}>
        {`// readMessages reads messages from the WebSocket connection
func (c *Client) readMessages() {
	defer c.conn.Close()

	for {
		select {
		case <-c.done:
			return
		default:
			_, message, err := c.conn.ReadMessage()
			if err != nil {
				log.Printf("Error reading message: %v", err)
				return
			}

			c.handleResponse(message)
		}
	}
}`}
      </Text>

      <Text newLines={2}>
        {`// handleResponse routes responses to the appropriate handler based on request ID
// and also handles oneOf response types
func (c *Client) handleResponse(data []byte) {
	// Parse the response to extract the request ID
	var response struct {
		ID     interface{} \`json:"id"\`
		Result interface{} \`json:"result,omitempty"\`
		Status interface{} \`json:"status,omitempty"\`
	}
	
	if err := json.Unmarshal(data, &response); err != nil {
		log.Printf("Error parsing response: %v", err)
		return
	}

	// Convert ID to string
	var requestID string
	switch id := response.ID.(type) {
	case string:
		requestID = id
	case float64:
		requestID = fmt.Sprintf("%.0f", id)
	default:
		requestID = fmt.Sprintf("%v", id)
	}

	// Add to global response list
	c.addToResponseList(response)

	// Handle oneOf result types if present
	if response.Result != nil {
		c.handleOneOfResult(response.Result, data)
	}

	// Handle specific request ID handlers
	c.mu.RLock()
	handler, exists := c.responseHandlers[requestID]
	c.mu.RUnlock()

	if exists && handler != nil {
		if err := handler(data); err != nil {
			log.Printf("Error handling response for request ID %s: %v", requestID, err)
		}
		
		// Clean up the handler after use
		c.mu.Lock()
		delete(c.responseHandlers, requestID)
		c.mu.Unlock()
	} else {
		log.Printf("No specific handler found for request ID: %s", requestID)
	}
}`}
      </Text>

      <Text newLines={2}>
        {`// handleOneOfResult attempts to parse and handle oneOf result types
func (c *Client) handleOneOfResult(result interface{}, originalData []byte) {
	// Try to determine the type by checking for distinctive fields
	if resultMap, ok := result.(map[string]interface{}); ok {
		// Check for event type field (common in Binance WebSocket events)
		if eventType, exists := resultMap["e"]; exists {
			if eventTypeStr, ok := eventType.(string); ok {
				// Map common event types to struct types
				responseType := c.mapEventTypeToStructType(eventTypeStr)
				if responseType != "" {
					c.globalResponseHandler.HandleResponse(responseType, result)
				}
			}
		}
	}
}`}
      </Text>

      <Text newLines={2}>
        {`// mapEventTypeToStructType maps Binance event types to Go struct types
func (c *Client) mapEventTypeToStructType(eventType string) string {
	switch eventType {
	case "outboundAccountPosition":
		return "OutboundAccountPositionEvent"
	case "balanceUpdate":
		return "BalanceUpdateEvent"
	case "executionReport":
		return "ExecutionReportEvent"
	case "listStatus":
		return "ListStatusEvent"
	case "listenKeyExpired":
		return "ListenKeyExpiredEvent"
	case "externalLockUpdate":
		return "ExternalLockUpdateEvent"
	case "eventStreamTerminated":
		return "EventStreamTerminatedEvent"
	default:
		return ""
	}
}`}
      </Text>

      <Text newLines={2}>
        <WebSocketHandlers asyncapi={asyncapi} />
      </Text>

      <Text newLines={2}>
        {`// Usage Examples:
//
// 1. Using auto-generated request ID with context (ID and Method will be set automatically):
//    ctx := context.Background()
//    request := &models.AccountCommissionAccountCommissionRatesRequest{}
//    client.SendAccountCommission(ctx, request, responseHandler)
//
// 2. Using custom request ID with context:
//    ctx := context.Background()
//    request := &models.AccountCommissionAccountCommissionRatesRequest{
//        Id: "my-custom-id-123",
//    }
//    client.SendAccountCommission(ctx, request, responseHandler)
//
// 3. Using per-request authentication:
//    auth := NewAuth("your-api-key")
//    auth.SetSecretKey("your-secret-key")
//    ctx, _ := auth.ContextWithValue(context.Background())
//    request := &models.AccountCommissionAccountCommissionRatesRequest{}
//    client.SendAccountCommission(ctx, request, responseHandler)
//
// 4. Using default parameters with context (ID and Method are pre-filled):
//    ctx := context.Background()
//    client.SendAccountCommissionDefault(ctx, responseHandler)
//
// 5. Generating request ID for later use:
//    customID := GenerateRequestID()
//    request := &models.AccountCommissionAccountCommissionRatesRequest{
//        Id: customID,
//    }
//    ctx := context.Background()
//    client.SendAccountCommission(ctx, request, responseHandler)`}
      </Text>

      <Text newLines={2}>
        {`// ParseMessage is a convenience wrapper around models.ParseMessage
func ParseMessage[T any](data []byte, target *T) error {
	return models.ParseMessage(data, target)
}

// ParseDynamicMessage is a convenience wrapper around models.ParseDynamicMessage
func ParseDynamicMessage(messageID string, data []byte) (interface{}, error) {
	return models.ParseDynamicMessage(messageID, data)
}

// structToMap converts a struct to a map[string]interface{} for JSON marshaling
func structToMap(v interface{}) (map[string]interface{}, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	
	return result, nil
}

// ParseOneOfMessage attempts to parse a oneOf message based on distinctive fields
func ParseOneOfMessage(data []byte) (interface{}, string, error) {
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, "", err
	}
	
	// Check for result field with oneOf content
	if result, exists := raw["result"]; exists {
		if resultMap, ok := result.(map[string]interface{}); ok {
			if eventType, exists := resultMap["e"]; exists {
				if eventTypeStr, ok := eventType.(string); ok {
					switch eventTypeStr {
					case "outboundAccountPosition":
						var event models.OutboundAccountPositionEvent
						if err := json.Unmarshal(data, &event); err == nil {
							return event, "OutboundAccountPositionEvent", nil
						}
					case "balanceUpdate":
						var event models.BalanceUpdateEvent
						if err := json.Unmarshal(data, &event); err == nil {
							return event, "BalanceUpdateEvent", nil
						}
					case "executionReport":
						var event models.ExecutionReportEvent
						if err := json.Unmarshal(data, &event); err == nil {
							return event, "ExecutionReportEvent", nil
						}
					case "listStatus":
						var event models.ListStatusEvent
						if err := json.Unmarshal(data, &event); err == nil {
							return event, "ListStatusEvent", nil
						}
					case "listenKeyExpired":
						var event models.ListenKeyExpiredEvent
						if err := json.Unmarshal(data, &event); err == nil {
							return event, "ListenKeyExpiredEvent", nil
						}
					case "externalLockUpdate":
						var event models.ExternalLockUpdateEvent
						if err := json.Unmarshal(data, &event); err == nil {
							return event, "ExternalLockUpdateEvent", nil
						}
					}
				}
			}
		}
	}
	
	return nil, "", fmt.Errorf("unable to parse oneOf message")
}`}
      </Text>
    </File>
  );
} 