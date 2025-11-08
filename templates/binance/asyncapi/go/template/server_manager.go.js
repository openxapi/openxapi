import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';

  return (
    <File name="server_manager.go">
      <Text>package {packageName}</Text>

      <Text newLines={2}>
        {`import (
  "fmt"
  "net/url"
  "strings"
  "sync"
)`}
      </Text>

      <Text newLines={2}>
        {`// ServerInfo represents a WebSocket server configuration
type ServerInfo struct {
  Name        string ${'`json:"name"`'}        // Server identifier
  URL         string ${'`json:"url"`'}         // Full WebSocket URL
  Host        string ${'`json:"host"`'}        // Server host
  Pathname    string ${'`json:"pathname"`'}    // URL path
  Protocol    string ${'`json:"protocol"`'}    // ws or wss
  Title       string ${'`json:"title"`'}       // Human-readable title
  Summary     string ${'`json:"summary"`'}     // Short description
  Description string ${'`json:"description"`'} // Detailed description
  Active      bool   ${'`json:"active"`'}      // Whether this server is currently active
}

// ServerManager manages multiple WebSocket servers
type ServerManager struct {
  servers      map[string]*ServerInfo
  activeServer string
  mu           sync.RWMutex
}

// NewServerManager creates a new server manager
func NewServerManager() *ServerManager {
  return &ServerManager{ servers: make(map[string]*ServerInfo) }
}

// AddServer adds a new server to the manager
func (sm *ServerManager) AddServer(name string, server *ServerInfo) error {
  sm.mu.Lock(); defer sm.mu.Unlock()
  if server == nil { return fmt.Errorf("server info cannot be nil") }
  if _, exists := sm.servers[name]; exists { return fmt.Errorf("server '%s' exists", name) }
  if _, err := url.Parse(server.URL); err != nil { return fmt.Errorf("invalid server URL '%s': %w", server.URL, err) }
  server.Name = name
  sm.servers[name] = server
  if sm.activeServer == "" { sm.activeServer = name; server.Active = true }
  return nil
}

// AddOrUpdateServer adds or updates a server configuration
func (sm *ServerManager) AddOrUpdateServer(name string, server *ServerInfo) error {
  sm.mu.Lock(); defer sm.mu.Unlock()
  if server == nil { return fmt.Errorf("server info cannot be nil") }
  if _, err := url.Parse(server.URL); err != nil { return fmt.Errorf("invalid server URL '%s': %w", server.URL, err) }
  server.Name = name
  if existing, ok := sm.servers[name]; ok { server.Active = existing.Active }
  sm.servers[name] = server
  if sm.activeServer == "" { sm.activeServer = name; server.Active = true }
  return nil
}

// RemoveServer removes a server from the manager
func (sm *ServerManager) RemoveServer(name string) error {
  sm.mu.Lock(); defer sm.mu.Unlock()
  if _, exists := sm.servers[name]; !exists { return fmt.Errorf("server '%s' not found", name) }
  if sm.activeServer == name { return fmt.Errorf("cannot remove active server '%s'", name) }
  delete(sm.servers, name)
  return nil
}

// UpdateServer updates an existing server's configuration
func (sm *ServerManager) UpdateServer(name string, server *ServerInfo) error {
  sm.mu.Lock(); defer sm.mu.Unlock()
  if _, exists := sm.servers[name]; !exists { return fmt.Errorf("server '%s' not found", name) }
  if server == nil { return fmt.Errorf("server info cannot be nil") }
  if _, err := url.Parse(server.URL); err != nil { return fmt.Errorf("invalid server URL '%s': %w", server.URL, err) }
  server.Name = name
  server.Active = (sm.activeServer == name)
  sm.servers[name] = server
  return nil
}

// UpdateServerPathname updates the pathname of an existing server
func (sm *ServerManager) UpdateServerPathname(name string, pathname string) error {
  sm.mu.Lock(); defer sm.mu.Unlock()
  server, exists := sm.servers[name]
  if !exists { return fmt.Errorf("server '%s' not found", name) }
  server.Pathname = pathname
  server.URL = fmt.Sprintf("%s://%s%s", server.Protocol, server.Host, pathname)
  if !strings.Contains(server.URL, "{") {
    if _, err := url.Parse(server.URL); err != nil { return fmt.Errorf("invalid server URL '%s': %w", server.URL, err) }
  }
  return nil
}

// ResolveServerURL resolves template variables in server URL
func (sm *ServerManager) ResolveServerURL(name string, variables map[string]string) (string, error) {
  sm.mu.RLock(); defer sm.mu.RUnlock()
  server, exists := sm.servers[name]
  if !exists { return "", fmt.Errorf("server '%s' not found", name) }
  resolvedURL := server.URL
  for key, value := range variables {
    placeholder := fmt.Sprintf("{%s}", key)
    resolvedURL = strings.ReplaceAll(resolvedURL, placeholder, value)
  }
  if _, err := url.Parse(resolvedURL); err != nil { return "", fmt.Errorf("invalid resolved URL '%s': %w", resolvedURL, err) }
  return resolvedURL, nil
}

// SetActiveServer sets the active server
func (sm *ServerManager) SetActiveServer(name string) error {
  sm.mu.Lock(); defer sm.mu.Unlock()
  if _, exists := sm.servers[name]; !exists { return fmt.Errorf("server '%s' not found", name) }
  if sm.activeServer != "" { if curr := sm.servers[sm.activeServer]; curr != nil { curr.Active = false } }
  sm.activeServer = name
  sm.servers[name].Active = true
  return nil
}

// GetActiveServer returns the active server info (copy)
func (sm *ServerManager) GetActiveServer() *ServerInfo {
  sm.mu.RLock(); defer sm.mu.RUnlock()
  if sm.activeServer == "" { return nil }
  server := sm.servers[sm.activeServer]
  if server == nil { return nil }
  return &ServerInfo{ Name: server.Name, URL: server.URL, Host: server.Host, Pathname: server.Pathname, Protocol: server.Protocol, Title: server.Title, Summary: server.Summary, Description: server.Description, Active: server.Active }
}

// GetServer returns a specific server by name
func (sm *ServerManager) GetServer(name string) *ServerInfo {
  sm.mu.RLock(); defer sm.mu.RUnlock()
  if s, ok := sm.servers[name]; ok && s != nil { return &ServerInfo{ Name: s.Name, URL: s.URL, Host: s.Host, Pathname: s.Pathname, Protocol: s.Protocol, Title: s.Title, Summary: s.Summary, Description: s.Description, Active: s.Active } }
  return nil
}

// ListServers returns all servers (copies)
func (sm *ServerManager) ListServers() map[string]*ServerInfo {
  sm.mu.RLock(); defer sm.mu.RUnlock()
  result := make(map[string]*ServerInfo, len(sm.servers))
  for name, s := range sm.servers {
    if s == nil { continue }
    result[name] = &ServerInfo{ Name: s.Name, URL: s.URL, Host: s.Host, Pathname: s.Pathname, Protocol: s.Protocol, Title: s.Title, Summary: s.Summary, Description: s.Description, Active: s.Active }
  }
  return result
}

// GetActiveServerURL returns the URL of the active server
func (sm *ServerManager) GetActiveServerURL() string {
  s := sm.GetActiveServer(); if s == nil { return "" }; return s.URL
}
`}
      </Text>
    </File>
  );
}
