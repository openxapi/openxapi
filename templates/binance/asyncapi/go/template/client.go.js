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
	"reflect"
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
        {`// ResponseHandler represents a handler for a specific response type with automatic JSON parsing
type ResponseHandler struct {
	RequestID    string
	Handler      func([]byte, error) error // Internal handler that processes raw data
	ParseAndCall func([]byte, error) error // Wrapper that parses JSON and calls user handler
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
	responseHandlers      map[string]*ResponseHandler
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
		responseHandlers:      make(map[string]*ResponseHandler),
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
func (c *Client) registerResponseHandler(requestID string, handler func([]byte, error) error) {
	c.mu.Lock()
	c.responseHandlers[requestID] = &ResponseHandler{
		RequestID:    requestID,
		Handler:      handler,
		ParseAndCall: handler, // For backward compatibility
	}
	c.mu.Unlock()
}

// registerTypedResponseHandler registers a typed response handler with automatic JSON parsing
// This method uses reflection to handle the parsing since Go methods cannot have type parameters
func (c *Client) registerTypedResponseHandler(requestID string, responseType interface{}, userHandler interface{}) error {
	// Validate that userHandler is a function with the expected signature
	handlerValue := reflect.ValueOf(userHandler)
	handlerType := handlerValue.Type()
	
	if handlerType.Kind() != reflect.Func {
		return fmt.Errorf("userHandler must be a function")
	}
	
	if handlerType.NumIn() != 2 || handlerType.NumOut() != 1 {
		return fmt.Errorf("userHandler must have signature func(*T, error) error")
	}
	
	responseTypeReflect := reflect.TypeOf(responseType)
	if responseTypeReflect.Kind() == reflect.Ptr {
		responseTypeReflect = responseTypeReflect.Elem()
	}
	
	wrapper := func(data []byte, err error) error {
		if err != nil {
			// If there's an API error, call the user handler with nil response and the error
			args := []reflect.Value{
				reflect.Zero(reflect.PtrTo(responseTypeReflect)), // nil pointer to response type
				reflect.ValueOf(err),
			}
			results := handlerValue.Call(args)
			if !results[0].IsNil() {
				return results[0].Interface().(error)
			}
			return nil
		}
		
		// Create a new instance of the response type
		responsePtr := reflect.New(responseTypeReflect)
		
		// Parse the JSON response
		if parseErr := json.Unmarshal(data, responsePtr.Interface()); parseErr != nil {
			// If JSON parsing fails, pass the parse error to the user handler
			args := []reflect.Value{
				reflect.Zero(reflect.PtrTo(responseTypeReflect)), // nil pointer to response type
				reflect.ValueOf(fmt.Errorf("failed to parse response: %w", parseErr)),
			}
			results := handlerValue.Call(args)
			if !results[0].IsNil() {
				return results[0].Interface().(error)
			}
			return nil
		}
		
		// Call the user handler with the parsed response
		args := []reflect.Value{
			responsePtr,
			reflect.Zero(reflect.TypeOf((*error)(nil)).Elem()), // nil error
		}
		results := handlerValue.Call(args)
		if !results[0].IsNil() {
			return results[0].Interface().(error)
		}
		return nil
	}
	
	c.mu.Lock()
	c.responseHandlers[requestID] = &ResponseHandler{
		RequestID:    requestID,
		Handler:      wrapper,
		ParseAndCall: wrapper,
	}
	c.mu.Unlock()
	return nil
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
// and also handles oneOf response types. Checks for API errors based on status code.
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

	// Check for API errors based on status code
	var apiError error
	if response.Status != nil {
		var status int
		switch s := response.Status.(type) {
		case float64:
			status = int(s)
		case int:
			status = s
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

	// Handle specific request ID handlers
	c.mu.RLock()
	responseHandler, exists := c.responseHandlers[requestID]
	c.mu.RUnlock()

	if exists && responseHandler != nil && responseHandler.ParseAndCall != nil {
		if err := responseHandler.ParseAndCall(data, apiError); err != nil {
			log.Printf("Error handling response for request ID %s: %v", requestID, err)
		}
		
		// Clean up the handler after use
		c.mu.Lock()
		delete(c.responseHandlers, requestID)
		c.mu.Unlock()
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
// 1. Using auto-generated request ID with context and typed response handler:
//    ctx := context.Background()
//    request := &models.AccountCommissionAccountCommissionRatesRequest{}
//    client.SendAccountCommission(ctx, request, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
//        if err != nil {
//            if apiErr, ok := IsAPIError(err); ok {
//                log.Printf("API Error: Status=%d, Code=%d, Message=%s", apiErr.Status, apiErr.Code, apiErr.Message)
//                return nil
//            }
//            return err
//        }
//        // Handle successful response - response is already parsed!
//        log.Printf("Account commission: %+v", response)
//        return nil
//    })
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
//    client.SendAccountCommissionDefault(ctx, func(response *models.AccountCommissionAccountCommissionRatesResponse, err error) error {
//        if err != nil {
//            if apiErr, ok := IsAPIError(err); ok {
//                switch apiErr.Status {
//                case 400:
//                    log.Printf("Bad request: %s", apiErr.Message)
//                case 403:
//                    log.Printf("Forbidden: %s", apiErr.Message)
//                case 429:
//                    log.Printf("Rate limit exceeded: %s", apiErr.Message)
//                default:
//                    log.Printf("API error: %s", apiErr.Error())
//                }
//                return nil // Error handled
//            }
//            return err // Other error types
//        }
//        // Response is automatically parsed - no need for json.Unmarshal!
//        log.Printf("Account commission rates: %+v", response.Result)
//        return nil
//    })
//
// 5. Generating request ID for later use:
//    customID := GenerateRequestID()
//    request := &models.AccountCommissionAccountCommissionRatesRequest{
//        Id: customID,
//    }
//    ctx := context.Background()
//    client.SendAccountCommission(ctx, request, responseHandler)
//
// 6. Ping example with automatic parsing:
//    ctx := context.Background()
//    client.SendPingDefault(ctx, func(response *models.PingTestConnectivityResponse, err error) error {
//        if err != nil {
//            if apiErr, ok := IsAPIError(err); ok {
//                log.Printf("Ping failed: %s", apiErr.Error())
//                return nil
//            }
//            return err
//        }
//        // No JSON unmarshaling needed - response is ready to use!
//        log.Printf("Ping successful: ID=%s, Status=%d", response.Id, response.Status)
//        return nil
//    })`}
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