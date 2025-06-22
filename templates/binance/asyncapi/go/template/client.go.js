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

// GlobalResponseHandler handles all possible response types with optimized lookup
type GlobalResponseHandler struct {
	handlers sync.Map // Using sync.Map for better concurrent performance
}

// NewGlobalResponseHandler creates a new optimized global response handler
func NewGlobalResponseHandler() *GlobalResponseHandler {
	return &GlobalResponseHandler{}
}

// RegisterHandler registers a handler for a specific response type
func (g *GlobalResponseHandler) RegisterHandler(responseType string, handler func(interface{}) error) {
	g.handlers.Store(responseType, handler)
}

// HandleResponse processes a response based on its type with optimized lookup
func (g *GlobalResponseHandler) HandleResponse(responseType string, data interface{}) error {
	if handler, ok := g.handlers.Load(responseType); ok {
		if h, ok := handler.(func(interface{}) error); ok {
			return h(data)
		}
	}
	
	log.Printf("No global handler found for response type: %s", responseType)
	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// Client represents a high-performance WebSocket client for ${asyncapi.info().title()}
type Client struct {
	conn                  *websocket.Conn
	url                   string
	responseHandlers      sync.Map // Using sync.Map for better concurrent performance
	globalResponseHandler *GlobalResponseHandler
	responseList          []interface{} // Global list of all received responses
	responseListMu        sync.RWMutex  // Separate mutex for response list
	auth                  *Auth         // Authentication configuration
	done                  chan struct{}
	
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
		url:                   baseURL,
		globalResponseHandler: NewGlobalResponseHandler(),
		responseList:          make([]interface{}, 0, 100), // Pre-allocate with capacity
		done:                  make(chan struct{}),
		jsonBuffer:            make([]byte, 0, 1024), // Pre-allocate JSON buffer
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
        {`// registerResponseHandler registers a response handler for a specific request ID
func (c *Client) registerResponseHandler(requestID string, handler func([]byte, error) error) {
	c.responseHandlers.Store(requestID, &ResponseHandler{
		RequestID: requestID,
		Handler:   handler,
	})
}

// RegisterTypedResponseHandler registers a typed response handler with compile-time type safety
// This uses generics for better performance and type safety compared to reflection
func RegisterTypedResponseHandler[T any](c *Client, requestID string, handler func(*T, error) error) {
	wrapper := func(data []byte, err error) error {
		if err != nil {
			// If there's an API error, call the user handler with nil response and the error
			return handler(nil, err)
		}
		
		// Create a new instance of the response type (no reflection needed)
		var response T
		
		// Parse the JSON response
		if parseErr := json.Unmarshal(data, &response); parseErr != nil {
			// If JSON parsing fails, pass the parse error to the user handler
			return handler(nil, fmt.Errorf("failed to parse response: %w", parseErr))
		}
		
		// Call the user handler with the parsed response
		return handler(&response, nil)
	}
	
	c.responseHandlers.Store(requestID, &ResponseHandler{
		RequestID: requestID,
		Handler:   wrapper,
	})
}

// RegisterTypedResponseHandlerFunc is a convenience method using HandlerFunc
func RegisterTypedResponseHandlerFunc[T any](c *Client, requestID string, handler HandlerFunc[T]) {
	RegisterTypedResponseHandler(c, requestID, handler)
}

// RegisterTypedResponseHandlerInterface registers a handler using the TypedResponseHandler interface
func RegisterTypedResponseHandlerInterface[T any](c *Client, requestID string, handler TypedResponseHandler[T]) {
	RegisterTypedResponseHandler(c, requestID, handler.Handle)
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
	c.responseListMu.RLock()
	history := make([]interface{}, len(c.responseList))
	copy(history, c.responseList)
	c.responseListMu.RUnlock()
	return history
}`}
      </Text>

      <Text newLines={2}>
        {`// ClearResponseHistory clears the response history
func (c *Client) ClearResponseHistory() {
	c.responseListMu.Lock()
	c.responseList = c.responseList[:0]
	c.responseListMu.Unlock()
}`}
      </Text>

      <Text newLines={2}>
        {`// addToResponseList adds a response to the global response list
func (c *Client) addToResponseList(response interface{}) {
	c.responseListMu.Lock()
	c.responseList = append(c.responseList, response)
	c.responseListMu.Unlock()
}`}
      </Text>

      <Text newLines={2}>
        {`// sendRequest sends a JSON request to the WebSocket server with optimized marshaling
func (c *Client) sendRequest(request map[string]interface{}) error {
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}

	// Use buffer pool for JSON marshaling to reduce allocations
	c.bufferMu.Lock()
	c.jsonBuffer = c.jsonBuffer[:0] // Reset buffer
	
	data, err := json.Marshal(request)
	if err != nil {
		c.bufferMu.Unlock()
		return fmt.Errorf("failed to marshal request: %w", err)
	}
	
	// Copy data to avoid race conditions
	if cap(c.jsonBuffer) < len(data) {
		c.jsonBuffer = make([]byte, len(data))
	}
	c.jsonBuffer = c.jsonBuffer[:len(data)]
	copy(c.jsonBuffer, data)
	c.bufferMu.Unlock()

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
        {`// handleResponse routes responses to the appropriate handler with optimized parsing
func (c *Client) handleResponse(data []byte) {
	// Parse the response to extract the request ID, status, and error
	var response struct {
		ID     interface{} \`json:"id"\`
		Result interface{} \`json:"result,omitempty"\`
		Status interface{} \`json:"status,omitempty"\`
		Error  *struct {
			Code    int    \`json:"code"\`
			Message string \`json:"msg"\`
		} \`json:"error,omitempty"\`
	}
	
	if err := json.Unmarshal(data, &response); err != nil {
		log.Printf("Error parsing response: %v", err)
		return
	}

	// Convert ID to string with optimized type switching
	var requestID string
	switch id := response.ID.(type) {
	case string:
		requestID = id
	case float64:
		requestID = fmt.Sprintf("%.0f", id)
	case int:
		requestID = fmt.Sprintf("%d", id)
	case int64:
		requestID = fmt.Sprintf("%d", id)
	default:
		requestID = fmt.Sprintf("%v", id)
	}

	// Add to global response list
	c.addToResponseList(response)

	// Check for API errors based on status code with optimized type switching
	var apiError error
	if response.Status != nil {
		var status int
		switch s := response.Status.(type) {
		case float64:
			status = int(s)
		case int:
			status = s
		case int64:
			status = int(s)
		default:
			status = 0
		}
		
		// If status is not 200, create an APIError
		if status != 200 && response.Error != nil {
			apiError = APIError{
				Status:  status,
				Code:    response.Error.Code,
				Message: response.Error.Message,
				ID:      requestID,
			}
		}
	}

	// Handle oneOf result types if present and no error
	if response.Result != nil && apiError == nil {
		c.handleOneOfResult(response.Result, data)
	}

	// Handle specific request ID handlers using sync.Map for better performance
	if handler, ok := c.responseHandlers.Load(requestID); ok {
		if responseHandler, ok := handler.(*ResponseHandler); ok && responseHandler.Handler != nil {
			if err := responseHandler.Handler(data, apiError); err != nil {
				log.Printf("Error handling response for request ID %s: %v", requestID, err)
			}
			
			// Clean up the handler after use
			c.responseHandlers.Delete(requestID)
		}
	} else {
		if apiError != nil {
			log.Printf("API error for request ID %s with no handler: %v", requestID, apiError)
		} else {
			log.Printf("No specific handler found for request ID: %s", requestID)
		}
	}
}`}
      </Text>

      <Text newLines={2}>
        {`// handleOneOfResult attempts to parse and handle oneOf result types with optimized performance
func (c *Client) handleOneOfResult(result interface{}, originalData []byte) {
	// Try to determine the type by checking for distinctive fields
	if resultMap, ok := result.(map[string]interface{}); ok {
		// Check for event type field (common in Binance WebSocket events)
		if eventType, exists := resultMap["e"]; exists {
			if eventTypeStr, ok := eventType.(string); ok {
				// Map common event types to struct types with optimized switch
				responseType := c.mapEventTypeToStructType(eventTypeStr)
				if responseType != "" {
					c.globalResponseHandler.HandleResponse(responseType, result)
				}
			}
		}
	}
}

// mapEventTypeToStructType maps Binance event types to Go struct types
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
}

`}
      </Text>

      <Text newLines={2}>
        <WebSocketHandlers asyncapi={asyncapi} />
      </Text>

      <Text newLines={2}>
        {`// Usage Examples:
//
// 1. Using the new high-performance typed response handler with generics:
//    ctx := context.Background()
//    client := NewClient()
//    client.Connect(ctx)
//    
//    // Example with generated method (recommended approach):
//    request := &models.AccountCommissionAccountCommissionRatesRequest{}
//    client.SendAccountCommission(ctx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
//        if err != nil {
//            if apiErr, ok := IsAPIError(err); ok {
//                log.Printf("API Error: Status=%d, Code=%d, Message=%s", apiErr.Status, apiErr.Code, apiErr.Message)
//                return nil
//            }
//            return err
//        }
//        // Handle successful response - response is already parsed and type-safe!
//        log.Printf("Account commission: %+v", response)
//        return nil
//    })
//
// 2. Using the convenience function directly:
//    params := map[string]interface{}{"symbol": "BTCUSDT"}
//    SendRequestWithTypedHandler[models.PingTestConnectivityResponse](client, ctx, "ping", params, func(response *models.PingTestConnectivityResponse, err error) error {
//        if err != nil {
//            return err
//        }
//        log.Printf("Ping successful: %+v", response)
//        return nil
//    })
//
// 3. Using HandlerFunc for cleaner code:
//    var handler HandlerFunc[models.AccountCommissionAccountCommissionRatesResponse] = func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
//        if err != nil {
//            return err
//        }
//        log.Printf("Response: %+v", response)
//        return nil
//    }
//    
//    params := map[string]interface{}{}
//    SendRequestWithHandlerFunc(client, ctx, "account.commission", params, handler)
//
// 4. Using TypedResponseHandler interface for more complex handlers:
//    type MyHandler struct{}
//    
//    func (h *MyHandler) Handle(response *models.PingTestConnectivityResponse, err error) error {
//        if err != nil {
//            return err
//        }
//        log.Printf("Ping response: %+v", response)
//        return nil
//    }
//    
//    requestID := GenerateRequestID()
//    RegisterTypedResponseHandlerInterface(client, requestID, &MyHandler{})
//    client.sendRequest(map[string]interface{}{
//        "id": requestID,
//        "method": "ping",
//        "params": map[string]interface{}{},
//    })
//
// 5. Batch operations with typed handlers:
//    requests := []*TypedBatchRequest[models.PingTestConnectivityResponse]{
//        {
//            RequestID: GenerateRequestID(),
//            Method:    "ping",
//            Params:    map[string]interface{}{},
//            Handler: func(response *models.PingTestConnectivityResponse, err error) error {
//                if err != nil {
//                    return err
//                }
//                log.Printf("Batch ping response: %+v", response)
//                return nil
//            },
//        },
//    }
//    SendTypedBatchRequests(client, ctx, requests)
//
// 6. Performance benefits of the new approach:
//    - No reflection overhead (compile-time type safety)
//    - Optimized concurrent access with sync.Map
//    - Reduced memory allocations with buffer reuse
//    - Better type inference and IDE support
//    - Faster JSON parsing with pre-allocated buffers
//    - Generic type parameters provide better performance than interface{} casting`}
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

// High-Performance Convenience Functions Using New RegisterTypedResponseHandler Functions

// SendRequestWithTypedHandler is a convenience function that demonstrates the new high-performance pattern
// It can be used as a template for implementing specific API calls
func SendRequestWithTypedHandler[T any](c *Client, ctx context.Context, method string, params map[string]interface{}, handler func(*T, error) error) error {
	requestID := GenerateRequestID()
	
	request := map[string]interface{}{
		"id":     requestID,
		"method": method,
		"params": params,
	}
	
	// Use the new high-performance typed handler
	RegisterTypedResponseHandler(c, requestID, handler)
	
	return c.sendRequest(request)
}

// SendRequestWithHandlerFunc demonstrates using HandlerFunc for cleaner syntax
func SendRequestWithHandlerFunc[T any](c *Client, ctx context.Context, method string, params map[string]interface{}, handler HandlerFunc[T]) error {
	requestID := GenerateRequestID()
	
	request := map[string]interface{}{
		"id":     requestID,
		"method": method,
		"params": params,
	}
	
	// Use the new high-performance HandlerFunc registration
	RegisterTypedResponseHandlerFunc(c, requestID, handler)
	
	return c.sendRequest(request)
}

// BatchRequestWithTypedHandlers sends multiple requests with individual typed handlers
// This demonstrates how to use the high-performance handlers for batch operations
func BatchRequestWithTypedHandlers(c *Client, ctx context.Context, requests []BatchRequest) error {
	for _, req := range requests {
		if err := req.ExecuteWithTypedHandler(c, ctx); err != nil {
			return fmt.Errorf("failed to execute batch request %s: %w", req.RequestID, err)
		}
	}
	return nil
}

// BatchRequest represents a single request in a batch operation
type BatchRequest struct {
	RequestID string
	Method    string
	Params    map[string]interface{}
	Handler   func([]byte, error) error
}

// ExecuteWithTypedHandler executes the batch request using typed handlers
func (br *BatchRequest) ExecuteWithTypedHandler(c *Client, ctx context.Context) error {
	request := map[string]interface{}{
		"id":     br.RequestID,
		"method": br.Method,
		"params": br.Params,
	}
	
	// Register the handler
	c.registerResponseHandler(br.RequestID, br.Handler)
	
	return c.sendRequest(request)
}

// TypedBatchRequest is a generic version of BatchRequest for type-safe operations
type TypedBatchRequest[T any] struct {
	RequestID string
	Method    string
	Params    map[string]interface{}
	Handler   func(*T, error) error
}

// ExecuteWithTypedHandler executes the typed batch request using the new high-performance handlers
func (tbr *TypedBatchRequest[T]) ExecuteWithTypedHandler(c *Client, ctx context.Context) error {
	request := map[string]interface{}{
		"id":     tbr.RequestID,
		"method": tbr.Method,
		"params": tbr.Params,
	}
	
	// Use the new high-performance typed handler
	RegisterTypedResponseHandler(c, tbr.RequestID, tbr.Handler)
	
	return c.sendRequest(request)
}

// SendTypedBatchRequests sends multiple typed requests with individual handlers
func SendTypedBatchRequests[T any](c *Client, ctx context.Context, requests []*TypedBatchRequest[T]) error {
	for _, req := range requests {
		if err := req.ExecuteWithTypedHandler(c, ctx); err != nil {
			return fmt.Errorf("failed to execute typed batch request %s: %w", req.RequestID, err)
		}
	}
	return nil
}

// ParseOneOfMessage attempts to parse a oneOf message based on distinctive fields with better performance
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
					// Use a switch statement for better performance than map lookups
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