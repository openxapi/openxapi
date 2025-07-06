import { File, Text } from '@asyncapi/generator-react-sdk';
import { WebSocketHandlers } from './components/WebSocketHandlers';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const moduleName = params.moduleName || 'binance-websocket-client';
  
  // Get all servers from AsyncAPI spec
  const servers = asyncapi.servers();
  const serverList = servers.all();

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
	"strings"
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
        {`// ServerInfo represents a WebSocket server configuration
type ServerInfo struct {
	Name        string \`json:"name"\`        // Server identifier (e.g., "mainnet", "testnet")
	URL         string \`json:"url"\`         // Full WebSocket URL
	Host        string \`json:"host"\`        // Server host
	Pathname    string \`json:"pathname"\`    // URL path
	Protocol    string \`json:"protocol"\`    // ws or wss
	Title       string \`json:"title"\`       // Human-readable title
	Summary     string \`json:"summary"\`     // Short description
	Description string \`json:"description"\` // Detailed description
	Active      bool   \`json:"active"\`      // Whether this server is currently active
}

// ServerManager manages multiple WebSocket servers
type ServerManager struct {
	servers      map[string]*ServerInfo
	activeServer string
	mu           sync.RWMutex
}

// NewServerManager creates a new server manager with default servers
func NewServerManager() *ServerManager {
	sm := &ServerManager{
		servers: make(map[string]*ServerInfo),
	}
	
	// Initialize with predefined servers from AsyncAPI spec
	// Using direct assignment since this is initialization (no risk of conflicts)
	${serverList.map(server => {
		const name = server.id();
		const protocol = server.protocol();
		const host = server.host();
		const pathname = server.pathname() || '';
		const url = `${protocol}://${host}${pathname}`;
		const title = server.title() || `${name.charAt(0).toUpperCase() + name.slice(1)} Server`;
		const summary = server.summary() || `WebSocket API Server (${name})`;
		const description = server.description() || `WebSocket server for ${name} environment`;
		
		return `sm.servers["${name}"] = &ServerInfo{
		Name:        "${name}",
		URL:         "${url}",
		Host:        "${host}",
		Pathname:    "${pathname}",
		Protocol:    "${protocol}",
		Title:       "${title}",
		Summary:     "${summary}",
		Description: "${description}",
		Active:      false,
	}`;
	}).join('\n\t')}
	
	// Set first server as active by default
	${serverList.length > 0 ? `sm.SetActiveServer("${serverList[0].id()}")` : ''}
	
	return sm
}

// AddServer adds a new server to the manager
func (sm *ServerManager) AddServer(name string, server *ServerInfo) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	if server == nil {
		return fmt.Errorf("server info cannot be nil")
	}
	
	// Check if server name already exists
	if _, exists := sm.servers[name]; exists {
		return fmt.Errorf("server with name '%s' already exists, use UpdateServer() to modify it", name)
	}
	
	// Validate URL
	if _, err := url.Parse(server.URL); err != nil {
		return fmt.Errorf("invalid server URL '%s': %w", server.URL, err)
	}
	
	server.Name = name
	sm.servers[name] = server
	
	// If this is the first server, make it active
	if sm.activeServer == "" {
		sm.activeServer = name
		server.Active = true
	}
	
	return nil
}

// AddOrUpdateServer adds a new server or updates an existing one
func (sm *ServerManager) AddOrUpdateServer(name string, server *ServerInfo) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	if server == nil {
		return fmt.Errorf("server info cannot be nil")
	}
	
	// Validate URL
	if _, err := url.Parse(server.URL); err != nil {
		return fmt.Errorf("invalid server URL '%s': %w", server.URL, err)
	}
	
	// Preserve active status if server already exists
	server.Name = name
	if existingServer, exists := sm.servers[name]; exists {
		server.Active = existingServer.Active
	}
	
	sm.servers[name] = server
	
	// If this is the first server, make it active
	if sm.activeServer == "" {
		sm.activeServer = name
		server.Active = true
	}
	
	return nil
}

// RemoveServer removes a server from the manager
func (sm *ServerManager) RemoveServer(name string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	if _, exists := sm.servers[name]; !exists {
		return fmt.Errorf("server '%s' not found", name)
	}
	
	// Don't allow removing the active server
	if sm.activeServer == name {
		return fmt.Errorf("cannot remove active server '%s', switch to another server first", name)
	}
	
	delete(sm.servers, name)
	return nil
}

// UpdateServer updates an existing server's configuration
func (sm *ServerManager) UpdateServer(name string, server *ServerInfo) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	if _, exists := sm.servers[name]; !exists {
		return fmt.Errorf("server '%s' not found", name)
	}
	
	if server == nil {
		return fmt.Errorf("server info cannot be nil")
	}
	
	// Validate URL
	if _, err := url.Parse(server.URL); err != nil {
		return fmt.Errorf("invalid server URL '%s': %w", server.URL, err)
	}
	
	// Preserve active status and name
	server.Name = name
	server.Active = (sm.activeServer == name)
	sm.servers[name] = server
	
	return nil
}

// SetActiveServer sets the active server
func (sm *ServerManager) SetActiveServer(name string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	if _, exists := sm.servers[name]; !exists {
		return fmt.Errorf("server '%s' not found", name)
	}
	
	// Deactivate current active server
	if sm.activeServer != "" {
		if currentActive := sm.servers[sm.activeServer]; currentActive != nil {
			currentActive.Active = false
		}
	}
	
	// Activate new server
	sm.activeServer = name
	sm.servers[name].Active = true
	
	return nil
}

// GetActiveServer returns the currently active server
func (sm *ServerManager) GetActiveServer() *ServerInfo {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	
	if sm.activeServer == "" {
		return nil
	}
	
	server := sm.servers[sm.activeServer]
	if server == nil {
		return nil
	}
	
	// Return a copy to prevent external modification
	return &ServerInfo{
		Name:        server.Name,
		URL:         server.URL,
		Host:        server.Host,
		Pathname:    server.Pathname,
		Protocol:    server.Protocol,
		Title:       server.Title,
		Summary:     server.Summary,
		Description: server.Description,
		Active:      server.Active,
	}
}

// GetServer returns a specific server by name
func (sm *ServerManager) GetServer(name string) *ServerInfo {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	
	server := sm.servers[name]
	if server == nil {
		return nil
	}
	
	// Return a copy to prevent external modification
	return &ServerInfo{
		Name:        server.Name,
		URL:         server.URL,
		Host:        server.Host,
		Pathname:    server.Pathname,
		Protocol:    server.Protocol,
		Title:       server.Title,
		Summary:     server.Summary,
		Description: server.Description,
		Active:      server.Active,
	}
}

// ListServers returns all available servers
func (sm *ServerManager) ListServers() map[string]*ServerInfo {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	
	result := make(map[string]*ServerInfo, len(sm.servers))
	for name, server := range sm.servers {
		result[name] = &ServerInfo{
			Name:        server.Name,
			URL:         server.URL,
			Host:        server.Host,
			Pathname:    server.Pathname,
			Protocol:    server.Protocol,
			Title:       server.Title,
			Summary:     server.Summary,
			Description: server.Description,
			Active:      server.Active,
		}
	}
	
	return result
}

// GetActiveServerURL returns the URL of the currently active server
func (sm *ServerManager) GetActiveServerURL() string {
	if server := sm.GetActiveServer(); server != nil {
		return server.URL
	}
	return ""
}`}
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
		if h, ok := handler.(func(interface{}) error); ok {
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
	serverManager    *ServerManager   // Manages multiple servers
	responseHandlers sync.Map         // Using sync.Map for better concurrent performance
	eventHandler     *EventHandler
	responseList     []interface{}    // Global list of all received responses
	responseListMu   sync.RWMutex     // Separate mutex for response list
	auth             *Auth            // Authentication configuration
	done             chan struct{}
	
	// Pre-allocated buffer for JSON parsing to reduce allocations
	jsonBuffer []byte
	bufferMu   sync.Mutex
}`}
      </Text>

      <Text newLines={2}>
        {`// NewClient creates a new high-performance WebSocket client
func NewClient() *Client {
	return &Client{
		serverManager: NewServerManager(),
		eventHandler:  NewEventHandler(),
		responseList:  make([]interface{}, 0, 100), // Pre-allocate with capacity
		done:          make(chan struct{}),
		jsonBuffer:    make([]byte, 0, 1024), // Pre-allocate JSON buffer
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
        {`// Server Management Methods

// AddServer adds a new server to the client
func (c *Client) AddServer(name string, serverURL string, title string, description string) error {
	if c.conn != nil {
		return fmt.Errorf("cannot add server while connected - please disconnect first")
	}
	
	// Parse URL to extract components
	parsedURL, err := url.Parse(serverURL)
	if err != nil {
		return fmt.Errorf("invalid URL format: %w", err)
	}
	
	server := &ServerInfo{
		Name:        name,
		URL:         serverURL,
		Host:        parsedURL.Host,
		Pathname:    parsedURL.Path,
		Protocol:    parsedURL.Scheme,
		Title:       title,
		Summary:     fmt.Sprintf("WebSocket API Server (%s)", name),
		Description: description,
		Active:      false,
	}
	
	return c.serverManager.AddServer(name, server)
}

// AddOrUpdateServer adds a new server or updates an existing one
func (c *Client) AddOrUpdateServer(name string, serverURL string, title string, description string) error {
	if c.conn != nil {
		return fmt.Errorf("cannot add/update server while connected - please disconnect first")
	}
	
	// Parse URL to extract components
	parsedURL, err := url.Parse(serverURL)
	if err != nil {
		return fmt.Errorf("invalid URL format: %w", err)
	}
	
	server := &ServerInfo{
		Name:        name,
		URL:         serverURL,
		Host:        parsedURL.Host,
		Pathname:    parsedURL.Path,
		Protocol:    parsedURL.Scheme,
		Title:       title,
		Summary:     fmt.Sprintf("WebSocket API Server (%s)", name),
		Description: description,
		Active:      false,
	}
	
	return c.serverManager.AddOrUpdateServer(name, server)
}

// RemoveServer removes a server from the client
func (c *Client) RemoveServer(name string) error {
	if c.conn != nil {
		return fmt.Errorf("cannot remove server while connected - please disconnect first")
	}
	
	return c.serverManager.RemoveServer(name)
}

// UpdateServer updates an existing server's configuration
func (c *Client) UpdateServer(name string, serverURL string, title string, description string) error {
	if c.conn != nil {
		return fmt.Errorf("cannot update server while connected - please disconnect first")
	}
	
	// Parse URL to extract components
	parsedURL, err := url.Parse(serverURL)
	if err != nil {
		return fmt.Errorf("invalid URL format: %w", err)
	}
	
	server := &ServerInfo{
		Name:        name,
		URL:         serverURL,
		Host:        parsedURL.Host,
		Pathname:    parsedURL.Path,
		Protocol:    parsedURL.Scheme,
		Title:       title,
		Summary:     fmt.Sprintf("WebSocket API Server (%s)", name),
		Description: description,
		Active:      false, // Will be set correctly by UpdateServer
	}
	
	return c.serverManager.UpdateServer(name, server)
}

// SetActiveServer sets the active server by name
func (c *Client) SetActiveServer(name string) error {
	if c.conn != nil {
		return fmt.Errorf("cannot change active server while connected - please disconnect first")
	}
	
	return c.serverManager.SetActiveServer(name)
}

// GetActiveServer returns the currently active server information
func (c *Client) GetActiveServer() *ServerInfo {
	return c.serverManager.GetActiveServer()
}

// GetServer returns information about a specific server
func (c *Client) GetServer(name string) *ServerInfo {
	return c.serverManager.GetServer(name)
}

// ListServers returns all available servers
func (c *Client) ListServers() map[string]*ServerInfo {
	return c.serverManager.ListServers()
}

// GetCurrentURL returns the URL of the currently active server
func (c *Client) GetCurrentURL() string {
	return c.serverManager.GetActiveServerURL()
}

// Legacy SetURL method for backward compatibility
// Deprecated: Use SetActiveServer() or UpdateServer() instead
func (c *Client) SetURL(newURL string) error {
	if c.conn != nil {
		return fmt.Errorf("cannot change URL while connected - please disconnect first")
	}
	
	// Find if this URL matches any existing server
	servers := c.serverManager.ListServers()
	for name, server := range servers {
		if server.URL == newURL {
			return c.serverManager.SetActiveServer(name)
		}
	}
	
	// If URL doesn't match any existing server, update the active server
	activeServer := c.serverManager.GetActiveServer()
	if activeServer != nil {
		return c.UpdateServer(activeServer.Name, newURL, activeServer.Title, activeServer.Description)
	}
	
	// If no active server, add as new server
	return c.AddServer("custom", newURL, "Custom Server", "Custom WebSocket server")
}`}
      </Text>

      <Text newLines={2}>
        {`// Connect establishes a WebSocket connection to the active server
func (c *Client) Connect(ctx context.Context) error {
	currentURL := c.serverManager.GetActiveServerURL()
	if currentURL == "" {
		return fmt.Errorf("no active server configured")
	}
	
	u, err := url.Parse(currentURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", currentURL, err)
	}

	c.conn = conn
	go c.readMessages()
	return nil
}

// ConnectToServer establishes a WebSocket connection to a specific server
func (c *Client) ConnectToServer(ctx context.Context, serverName string) error {
	if err := c.SetActiveServer(serverName); err != nil {
		return fmt.Errorf("failed to set active server: %w", err)
	}
	
	return c.Connect(ctx)
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
				// Check if the error is due to connection being closed
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					// Normal close - no need to log as error
					return
				}
				// Check if this is a network connection closed error (also normal during shutdown)
				if strings.Contains(err.Error(), "use of closed network connection") {
					// Normal network close - no need to log as error
					return
				}
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
		// Parse response structure to check for errors
		var response struct {
			ID     interface{} \`json:"id"\`
			Status int         \`json:"status"\`
			Result interface{} \`json:"result,omitempty"\`
			Error  *struct {
				Code int    \`json:"code"\`
				Msg  string \`json:"msg"\`
			} \`json:"error,omitempty"\`
			RateLimits []interface{} \`json:"rateLimits,omitempty"\`
		}

		if err := json.Unmarshal(data, &response); err != nil {
			return fmt.Errorf("failed to parse response structure: %w", err)
		}

		requestID := fmt.Sprintf("%v", id)

		// Check if status indicates an error
		var responseError error
		if response.Status != 200 && response.Error != nil {
			responseError = &APIError{
				Status:  response.Status,
				Code:    response.Error.Code,
				Message: response.Error.Msg,
				ID:      requestID,
			}
		}

		return c.handleRequestResponse(requestID, data, responseError)
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

// Deprecated: Use GetCurrentURL() instead
func (c *Client) GetURL() string {
	return c.GetCurrentURL()
}`}
      </Text>

      <Text newLines={2}>
        {WebSocketHandlers({ asyncapi })}
      </Text>
    </File>
  );
}