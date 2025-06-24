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
        {`// APIError represents an error returned by the Binance WebSocket API
type APIError struct {
	Status  int    \`json:"status"\`  // HTTP-like status code from the response
	Code    int    \`json:"code"\`    // Binance-specific error code
	Message string \`json:"msg"\`     // Error message
	ID      string \`json:"id"\`      // Request ID that caused the error
}

// Error implements the error interface
func (e APIError) Error() string {
	return fmt.Sprintf("binance api error: status=%d, code=%d, message=%s, id=%s", e.Status, e.Code, e.Message, e.ID)
}

// IsAPIError checks if an error is an APIError
func IsAPIError(err error) (*APIError, bool) {
	if apiErr, ok := err.(APIError); ok {
		return &apiErr, true
	}
	if apiErr, ok := err.(*APIError); ok {
		return apiErr, true
	}
	return nil, false
}`}
      </Text>

      <Text newLines={2}>
        {`// ResponseHandler represents a high-performance handler for WebSocket responses
type ResponseHandler struct {
	RequestID string
	Handler   func([]byte, error) error
}

// TypedResponseHandler is a generic interface for type-safe response handling
type TypedResponseHandler[T any] interface {
	Handle(*T, error) error
}

// HandlerFunc is a function type that implements TypedResponseHandler
type HandlerFunc[T any] func(*T, error) error

// Handle implements TypedResponseHandler interface
func (f HandlerFunc[T]) Handle(response *T, err error) error {
	return f(response, err)
}

// EventHandler handles all possible response types with optimized lookup
type EventHandler struct {
	handlers sync.Map // Using sync.Map for better concurrent performance
}

// NewEventHandler creates a new optimized event handler
func NewEventHandler() *EventHandler {
	return &EventHandler{}
}

// RegisterHandler registers a handler for a specific response type
func (e *EventHandler) RegisterHandler(responseType string, handler func(interface{}) error) {
	e.handlers.Store(responseType, handler)
}

// HandleResponse processes a event based on its type with optimized lookup
func (e *EventHandler) HandleResponse(eventType string, data []byte) error {
	if handler, ok := e.handlers.Load(eventType); ok {
		if h, ok := handler.(func([]byte) error); ok {
			return h(data)
		}
	}
	
	log.Printf("No handler found for event type: %s", eventType)
	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// Client represents a high-performance WebSocket client for ${asyncapi.info().title()}
type Client struct {
	conn             *websocket.Conn
	url              string
	responseHandlers sync.Map      // Using sync.Map for better concurrent performance
	eventHandler     *EventHandler
	responseList     []interface{} // Global list of all received responses
	responseListMu   sync.RWMutex  // Separate mutex for response list
	auth             *Auth         // Authentication configuration
	done             chan struct{}
	
	// Pre-allocated buffer for JSON parsing to reduce allocations
	jsonBuffer []byte
	bufferMu   sync.Mutex
}`}
      </Text>

      <Text newLines={2}>
        {`// NewClient creates a new high-performance WebSocket client
func NewClient() *Client {
	baseURL := "${serverUrl.protocol()}://${serverUrl.host()}${serverUrl.pathname()}"
	return &Client{
		url:          baseURL,
		eventHandler: NewEventHandler(),
		responseList: make([]interface{}, 0, 100), // Pre-allocate with capacity
		done:         make(chan struct{}),
		jsonBuffer:   make([]byte, 0, 1024), // Pre-allocate JSON buffer
	}
}

// NewClientWithAuth creates a new high-performance WebSocket client with authentication
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
        {`// readMessages reads messages from the WebSocket connection
func (c *Client) readMessages() {
	defer func() {
		if c.conn != nil {
			c.conn.Close()
		}
	}()

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

			if err := c.handleMessage(message); err != nil {
				log.Printf("Error handling message: %v", err)
			}
		}
	}
}`}
      </Text>

      <Text newLines={2}>
        {`// handleMessage processes incoming WebSocket messages
func (c *Client) handleMessage(data []byte) error {
	// Parse the message to determine its type
	var genericMessage map[string]interface{}
	if err := json.Unmarshal(data, &genericMessage); err != nil {
		return fmt.Errorf("failed to parse message: %w", err)
	}

	// Check if this is a response to a request (has "id" field)
	if id, hasID := genericMessage["id"]; hasID {
		return c.handleRequestResponse(id.(string), data, nil)
	}

	// Check for event structure with nested "event" object (Binance event messages)
	if eventObj, hasEventObj := genericMessage["event"]; hasEventObj {
		if eventMap, ok := eventObj.(map[string]interface{}); ok {
			if eventType, hasEventType := eventMap["e"]; hasEventType {
				return c.handleEventMessage(eventType.(string), data)
			}
		}
	}

	// If we can't determine the message type, log it
	log.Printf("Unknown message type: %s", string(data))
	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// handleRequestResponse handles responses to specific requests
func (c *Client) handleRequestResponse(requestID string, data []byte, err error) error {
	if handler, ok := c.responseHandlers.Load(requestID); ok {
		c.responseHandlers.Delete(requestID) // Clean up after handling
		
		if h, ok := handler.(ResponseHandler); ok {
			return h.Handler(data, err)
		}
	}
	
	// Store in global response list for debugging/monitoring
	c.responseListMu.Lock()
	defer c.responseListMu.Unlock()
	
	var response interface{}
	if err == nil {
		json.Unmarshal(data, &response)
	}
	c.responseList = append(c.responseList, response)
	
	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// handleEventMessage handles event messages (like balance updates, execution reports, etc.)
func (c *Client) handleEventMessage(eventType string, data []byte) error {
	// Handle with event handler
	return c.eventHandler.HandleResponse(eventType, data)
}`}
      </Text>

      <Text newLines={2}>
        {``}
      </Text>

      <Text newLines={2}>
        {`// sendRequest sends a request over the WebSocket connection
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
        {`// GetResponseList returns a copy of all received responses (for debugging)
func (c *Client) GetResponseList() []interface{} {
	c.responseListMu.RLock()
	defer c.responseListMu.RUnlock()
	
	result := make([]interface{}, len(c.responseList))
	copy(result, c.responseList)
	return result
}`}
      </Text>

      <Text newLines={2}>
        {`// ClearResponseList clears the response list
func (c *Client) ClearResponseList() {
	c.responseListMu.Lock()
	defer c.responseListMu.Unlock()
	c.responseList = c.responseList[:0]
}`}
      </Text>

      <Text newLines={2}>
        {`// Health check and utility methods
func (c *Client) IsConnected() bool {
	return c.conn != nil
}

func (c *Client) GetURL() string {
	return c.url
}`}
      </Text>

      <Text newLines={2}>
        {WebSocketHandlers({ asyncapi })}
      </Text>
    </File>
  );
} 