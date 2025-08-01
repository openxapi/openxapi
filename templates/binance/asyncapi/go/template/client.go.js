import { File, Text } from '@asyncapi/generator-react-sdk';
import { ModularWebSocketHandlers } from '../components/ModularWebSocketHandlers';
import { detectModuleName } from '../components/ModuleRegistry';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const moduleName = params.moduleName || 'binance-websocket-client';
  
  // Detect the module type
  const detectedModule = detectModuleName(asyncapi, { packageName, moduleName });
  
  // Get all servers from AsyncAPI spec
  const servers = asyncapi.servers();
  const serverList = servers.all();

  // Get all channels to generate handler methods
  const channels = asyncapi.channels();
  
  // Generate handlers and check if they use models
  const handlersCode = ModularWebSocketHandlers({ asyncapi, context: { packageName, moduleName } });
  const usesModels = handlersCode && handlersCode.includes('models.');

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
${detectedModule !== 'options-streams' ? `
	"github.com/google/uuid"` : ''}
	"github.com/gorilla/websocket"${usesModels ? `
	"${moduleName}/models"` : ''}
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
		const rawName = server.id();
		// Always append '1' to server names if they don't already end with a number
		const name = rawName.match(/\d+$/) ? rawName : rawName + '1';
		const protocol = server.protocol();
		const host = server.host();
		// Handle server variables for pathname
		let pathname = server.pathname() || '';
		let url;
		
		// Handle server variables (streamPath, listenKey, etc.)
		const serverJson = server.json ? server.json() : (server._json || {});
		if (serverJson.variables) {
			// Handle streamPath variable - keep as template for options-streams and other stream modules
			if (serverJson.variables.streamPath) {
				// For stream modules, keep {streamPath} as template for runtime replacement
				// This allows dynamic path selection (/ws, /stream, etc.)
				// Note: streamPath variables are resolved at connection time, not initialization time
			}
			
			// Handle listenKey variable - leave as template for runtime replacement
			if (pathname.includes('{listenKey}')) {
				// Keep {listenKey} as template - it will be replaced at runtime
				// This is intentional for user data stream URLs
			}
		}
		
		url = `${protocol}://${host}${pathname}`;
		const title = server.title() || `${rawName.charAt(0).toUpperCase() + rawName.slice(1)} Server`;
		const summary = server.summary() || `WebSocket API Server (${rawName})`;
		const description = (server.description() || `WebSocket server for ${rawName} environment`).replace(/"/g, '\\"').replace(/\n/g, '\\n');
		
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
	${serverList.length > 0 ? (() => {
		const firstServerRawName = serverList[0].id();
		const firstServerName = firstServerRawName.match(/\d+$/) ? firstServerRawName : firstServerRawName + '1';
		return `sm.SetActiveServer("${firstServerName}")`;
	})() : ''}
	
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

// UpdateServerPathname updates the pathname of an existing server
func (sm *ServerManager) UpdateServerPathname(name string, pathname string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	server, exists := sm.servers[name]
	if !exists {
		return fmt.Errorf("server '%s' not found", name)
	}
	
	// Update pathname and rebuild URL
	server.Pathname = pathname
	server.URL = fmt.Sprintf("%s://%s%s", server.Protocol, server.Host, pathname)
	
	// Validate the new URL (skip validation if it contains template variables)
	if !strings.Contains(server.URL, "{") {
		if _, err := url.Parse(server.URL); err != nil {
			return fmt.Errorf("invalid server URL '%s': %w", server.URL, err)
		}
	}
	
	return nil
}

// ResolveServerURL resolves template variables in server URL
func (sm *ServerManager) ResolveServerURL(name string, variables map[string]string) (string, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	
	server, exists := sm.servers[name]
	if !exists {
		return "", fmt.Errorf("server '%s' not found", name)
	}
	
	resolvedURL := server.URL
	
	// Replace template variables
	for key, value := range variables {
		placeholder := fmt.Sprintf("{%s}", key)
		resolvedURL = strings.ReplaceAll(resolvedURL, placeholder, value)
	}
	
	// Validate the resolved URL
	if _, err := url.Parse(resolvedURL); err != nil {
		return "", fmt.Errorf("invalid resolved URL '%s': %w", resolvedURL, err)
	}
	
	return resolvedURL, nil
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
	Id      string \`json:"id"\`      // Request ID that caused the error
}

// Error implements the error interface
func (e APIError) Error() string {
	return fmt.Sprintf("binance api error: status=%d, code=%d, message=%s, id=%s", e.Status, e.Code, e.Message, e.Id)
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
	RequestId string
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
	connMu           sync.RWMutex     // Protects connection access
	serverManager    *ServerManager   // Manages multiple servers
	responseHandlers sync.Map         // Using sync.Map for better concurrent performance
	eventHandler     *EventHandler
	responseList     []interface{}    // Global list of all received responses
	responseListMu   sync.RWMutex     // Separate mutex for response list
	auth             *Auth            // Authentication configuration
	done             chan struct{}
	isConnected      bool             // Connection status flag
	handlers         eventHandlers    // Event handlers registry
	
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
		handlers:      eventHandlers{},        // Initialize event handlers registry
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
	${packageName.includes('streams') ? `// For streams modules, use ConnectToSingleStreams by default
	return c.ConnectToSingleStreams(ctx, "")` : `currentURL := c.serverManager.GetActiveServerURL()
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
	c.isConnected = true
	
	// Start the message reading loop
	go c.readMessages()
	
	return nil`}
}

// ConnectToServer establishes a WebSocket connection to a specific server
func (c *Client) ConnectToServer(ctx context.Context, serverName string) error {
	if err := c.SetActiveServer(serverName); err != nil {
		return fmt.Errorf("failed to set active server: %w", err)
	}
	
	return c.Connect(ctx)
}

${(() => {
        // Check if any server has variables defined
        const hasServerVariables = serverList.some(server => {
          const serverJson = server.json ? server.json() : (server._json || {});
          return serverJson.variables && Object.keys(serverJson.variables).length > 0;
        });
        
        if (!hasServerVariables) {
          return ''; // Don't generate server variable methods if no variables are defined
        }
        
        // Get all unique server variables across all servers
        const allVariables = new Set();
        serverList.forEach(server => {
          const serverJson = server.json ? server.json() : (server._json || {});
          if (serverJson.variables) {
            Object.keys(serverJson.variables).forEach(varName => allVariables.add(varName));
          }
        });
        
        const variableNames = Array.from(allVariables);
        const parameterList = variableNames.map(varName => `${varName} string`).join(', ');
        const variableMapEntries = variableNames.map(varName => `\t\t"${varName}": ${varName},`).join('\n');
        
        return `// ConnectWithVariables establishes a WebSocket connection using provided server variables
// This method resolves server URL template variables like {${variableNames.join('}, {')}}
func (c *Client) ConnectWithVariables(ctx context.Context, ${parameterList}) error {
	activeServer := c.serverManager.GetActiveServer()
	if activeServer == nil {
		return fmt.Errorf("no active server configured")
	}
	
	// Resolve the URL with the provided variables
	variables := map[string]string{
${variableMapEntries}
	}
	
	resolvedURL, err := c.serverManager.ResolveServerURL(activeServer.Name, variables)
	if err != nil {
		return fmt.Errorf("failed to resolve server URL: %w", err)
	}
	
	u, err := url.Parse(resolvedURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", resolvedURL, err)
	}

	c.conn = conn
	c.isConnected = true
	go c.readMessages()
	return nil
}

// ConnectToServerWithVariables establishes a WebSocket connection to a specific server using provided server variables
func (c *Client) ConnectToServerWithVariables(ctx context.Context, serverName string, ${parameterList}) error {
	if err := c.SetActiveServer(serverName); err != nil {
		return fmt.Errorf("failed to set active server: %w", err)
	}
	
	return c.ConnectWithVariables(ctx, ${variableNames.join(', ')})
}${variableNames.map(varName => `

// ConnectWith${varName.charAt(0).toUpperCase() + varName.slice(1)} establishes a WebSocket connection using the provided ${varName}
// This is a convenience method for the ${varName} variable
func (c *Client) ConnectWith${varName.charAt(0).toUpperCase() + varName.slice(1)}(ctx context.Context, ${varName} string) error {
	${variableNames.length === 1 ? `return c.ConnectWithVariables(ctx, ${varName})` : `// Create variables map with only ${varName} provided
	variables := map[string]string{
		"${varName}": ${varName},
	}
	// Call the generic method with resolved URL
	activeServer := c.serverManager.GetActiveServer()
	if activeServer == nil {
		return fmt.Errorf("no active server configured")
	}
	
	resolvedURL, err := c.serverManager.ResolveServerURL(activeServer.Name, variables)
	if err != nil {
		return fmt.Errorf("failed to resolve server URL: %w", err)
	}
	
	u, err := url.Parse(resolvedURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", resolvedURL, err)
	}

	c.conn = conn
	c.isConnected = true
	go c.readMessages()
	return nil`}
}

// ConnectToServerWith${varName.charAt(0).toUpperCase() + varName.slice(1)} establishes a WebSocket connection to a specific server using the provided ${varName}
func (c *Client) ConnectToServerWith${varName.charAt(0).toUpperCase() + varName.slice(1)}(ctx context.Context, serverName string, ${varName} string) error {
	if err := c.SetActiveServer(serverName); err != nil {
		return fmt.Errorf("failed to set active server: %w", err)
	}
	
	return c.ConnectWith${varName.charAt(0).toUpperCase() + varName.slice(1)}(ctx, ${varName})
}`).join('')}`;
      })()}`}
      </Text>

      <Text newLines={2}>
        {`// Disconnect closes the WebSocket connection safely and resets state for reconnection
func (c *Client) Disconnect() error {
	// Signal all goroutines to stop first
	c.isConnected = false
	
	// Safely close the done channel only once
	select {
	case <-c.done:
		// Channel already closed, do nothing
	default:
		close(c.done)
	}
	
	// Wait a brief moment for goroutines to see the done signal
	time.Sleep(10 * time.Millisecond)
	
	// Now safely handle the connection with proper locking
	c.connMu.Lock()
	defer c.connMu.Unlock()
	
	var err error
	if c.conn != nil {
		err = c.conn.Close()
		c.conn = nil  // Reset connection to nil for clean reconnection
	}
	
	// Reset connection state for reconnection
	c.done = make(chan struct{})  // Recreate done channel
	
	return err
}`}
      </Text>

      <Text newLines={2}>
        {detectedModule === 'options-streams' ? 
          `// GenerateRequestID generates a unique integer request ID (global function)
// Options streams API requires unsigned integer request IDs, not UUIDs
var requestIDCounter uint64 = 0
var requestIDMutex sync.Mutex

func GenerateRequestID() uint64 {
	requestIDMutex.Lock()
	defer requestIDMutex.Unlock()
	requestIDCounter++
	return requestIDCounter
}` :
          `// GenerateRequestID generates a unique UUID v4 request ID (global function)
func GenerateRequestID() string {
	return uuid.New().String()
}`}
      </Text>

      <Text newLines={2}>
        {`// readMessages reads messages from the WebSocket connection
func (c *Client) readMessages() {
	defer func() {
		c.isConnected = false
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
	// First check if this is an array stream (like !assetIndex@arr)
	// by trying to parse as an array first
	var arrayData []interface{}
	if err := json.Unmarshal(data, &arrayData); err == nil {
		// This is an array stream - delegate to stream processing logic
		${detectedModule.includes('-streams') ? `return c.processStreamMessage(data)` : `return c.handleEventMessage("arrayStream", data)`}
	}
	
	// Parse the message to determine its type
	var genericMessage map[string]interface{}
	if err := json.Unmarshal(data, &genericMessage); err != nil {
		return fmt.Errorf("failed to parse message: %w", err)
	}

	// Check if this is a response to a request (has "id" field)
	if id, hasID := genericMessage["id"]; hasID {
		// Parse response structure to check for errors
		var response struct {
			Id     interface{} \`json:"id"\`
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
				Id:      requestID,
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

	${detectedModule.includes('-streams') ? 
		`// For stream modules, always try processStreamMessage for any non-request message
		// This handles both standard events (with "e" field), special events (BookTicker, PartialDepth), and combined streams
		return c.processStreamMessage(data)` : 
		`// Check for direct event type field (stream messages)
		if eventType, hasEventType := genericMessage["e"]; hasEventType {
			if eventTypeStr, ok := eventType.(string); ok {
				return c.handleEventMessage(eventTypeStr, data)
			}
		}

		// If we can't determine the message type, log it
		log.Printf("Unknown message type: %s", string(data))
		return nil`
	}
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
	// For stream modules, use the dedicated stream processing logic
	${detectedModule.includes('-streams') ? `return c.processStreamMessage(data)` : `// Handle with event handler
	return c.eventHandler.HandleResponse(eventType, data)`}
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
	return c.isConnected && c.conn != nil
}

// Deprecated: Use GetCurrentURL() instead
func (c *Client) GetURL() string {
	return c.GetCurrentURL()
}`}
      </Text>

      <Text newLines={2}>
        {ModularWebSocketHandlers({ asyncapi, context: { packageName, moduleName } })}
      </Text>
    </File>
  );
}