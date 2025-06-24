package generator

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"

	wsParser "github.com/openxapi/openxapi/internal/parser/websocket"
	"github.com/sirupsen/logrus"
	yaml "gopkg.in/yaml.v3"
)

// AsyncAPISpec represents an AsyncAPI 3.0.0 specification
type AsyncAPISpec struct {
	AsyncAPI   string                        `json:"asyncapi" yaml:"asyncapi"`
	ID         string                        `json:"id,omitempty" yaml:"id,omitempty"`
	Info       *AsyncAPIInfo                 `json:"info" yaml:"info"`
	Servers    map[string]*AsyncAPIServer    `json:"servers,omitempty" yaml:"servers,omitempty"`
	Channels   map[string]*AsyncAPIChannel   `json:"channels,omitempty" yaml:"channels,omitempty"`
	Operations map[string]*AsyncAPIOperation `json:"operations,omitempty" yaml:"operations,omitempty"`
	Components *AsyncAPIComponents           `json:"components,omitempty" yaml:"components,omitempty"`
}

// AsyncAPIInfo represents the info object in AsyncAPI 3.0.0
type AsyncAPIInfo struct {
	Title          string                `json:"title" yaml:"title"`
	Version        string                `json:"version" yaml:"version"`
	Description    string                `json:"description,omitempty" yaml:"description,omitempty"`
	TermsOfService string                `json:"termsOfService,omitempty" yaml:"termsOfService,omitempty"`
	Contact        *AsyncAPIContact      `json:"contact,omitempty" yaml:"contact,omitempty"`
	License        *AsyncAPILicense      `json:"license,omitempty" yaml:"license,omitempty"`
	Tags           []*AsyncAPITag        `json:"tags,omitempty" yaml:"tags,omitempty"`
	ExternalDocs   *AsyncAPIExternalDocs `json:"externalDocs,omitempty" yaml:"externalDocs,omitempty"`
}

// AsyncAPIContact represents contact information
type AsyncAPIContact struct {
	Name  string `json:"name,omitempty" yaml:"name,omitempty"`
	URL   string `json:"url,omitempty" yaml:"url,omitempty"`
	Email string `json:"email,omitempty" yaml:"email,omitempty"`
}

// AsyncAPILicense represents license information
type AsyncAPILicense struct {
	Name string `json:"name" yaml:"name"`
	URL  string `json:"url,omitempty" yaml:"url,omitempty"`
}

// AsyncAPIServer represents a server in AsyncAPI 3.0.0
type AsyncAPIServer struct {
	Host         string                 `json:"host" yaml:"host"`
	Pathname     string                 `json:"pathname,omitempty" yaml:"pathname,omitempty"`
	Protocol     string                 `json:"protocol" yaml:"protocol"`
	Title        string                 `json:"title,omitempty" yaml:"title,omitempty"`
	Summary      string                 `json:"summary,omitempty" yaml:"summary,omitempty"`
	Description  string                 `json:"description,omitempty" yaml:"description,omitempty"`
	Variables    map[string]interface{} `json:"variables,omitempty" yaml:"variables,omitempty"`
	Security     []map[string][]string  `json:"security,omitempty" yaml:"security,omitempty"`
	Bindings     map[string]interface{} `json:"bindings,omitempty" yaml:"bindings,omitempty"`
	ExternalDocs *AsyncAPIExternalDocs  `json:"externalDocs,omitempty" yaml:"externalDocs,omitempty"`
}

// AsyncAPIChannel represents a channel in AsyncAPI 3.0.0
type AsyncAPIChannel struct {
	Address      string                        `json:"address,omitempty" yaml:"address,omitempty"`
	Title        string                        `json:"title,omitempty" yaml:"title,omitempty"`
	Summary      string                        `json:"summary,omitempty" yaml:"summary,omitempty"`
	Description  string                        `json:"description,omitempty" yaml:"description,omitempty"`
	Messages     map[string]*AsyncAPIMessage   `json:"messages,omitempty" yaml:"messages,omitempty"`
	Parameters   map[string]*AsyncAPIParameter `json:"parameters,omitempty" yaml:"parameters,omitempty"`
	Servers      []map[string]string           `json:"servers,omitempty" yaml:"servers,omitempty"`
	Bindings     map[string]interface{}        `json:"bindings,omitempty" yaml:"bindings,omitempty"`
	Tags         []*AsyncAPITag                `json:"tags,omitempty" yaml:"tags,omitempty"`
	ExternalDocs *AsyncAPIExternalDocs         `json:"externalDocs,omitempty" yaml:"externalDocs,omitempty"`
}

// AsyncAPIOperation represents an operation in AsyncAPI 3.0.0
type AsyncAPIOperation struct {
	Title        string                  `json:"title,omitempty" yaml:"title,omitempty"`
	Summary      string                  `json:"summary,omitempty" yaml:"summary,omitempty"`
	Description  string                  `json:"description,omitempty" yaml:"description,omitempty"`
	Action       string                  `json:"action" yaml:"action"`   // "send" or "receive"
	Channel      map[string]string       `json:"channel" yaml:"channel"` // $ref to channel
	Messages     []map[string]string     `json:"messages,omitempty" yaml:"messages,omitempty"`
	Reply        *AsyncAPIOperationReply `json:"reply,omitempty" yaml:"reply,omitempty"`
	Tags         []*AsyncAPITag          `json:"tags,omitempty" yaml:"tags,omitempty"`
	Bindings     map[string]interface{}  `json:"bindings,omitempty" yaml:"bindings,omitempty"`
	Traits       []interface{}           `json:"traits,omitempty" yaml:"traits,omitempty"`
	Security     []map[string][]string   `json:"security,omitempty" yaml:"security,omitempty"`
	ExternalDocs *AsyncAPIExternalDocs   `json:"externalDocs,omitempty" yaml:"externalDocs,omitempty"`
}

// AsyncAPIOperationReply represents the reply object for request-reply pattern
type AsyncAPIOperationReply struct {
	Address  *AsyncAPIReplyAddress `json:"address,omitempty" yaml:"address,omitempty"`
	Channel  map[string]string     `json:"channel,omitempty" yaml:"channel,omitempty"`
	Messages []map[string]string   `json:"messages,omitempty" yaml:"messages,omitempty"`
}

// AsyncAPIReplyAddress represents the reply address
type AsyncAPIReplyAddress struct {
	Location    string `json:"location,omitempty" yaml:"location,omitempty"`
	Description string `json:"description,omitempty" yaml:"description,omitempty"`
}

// AsyncAPIMessage represents a message
type AsyncAPIMessage struct {
	Name          string                 `json:"name,omitempty" yaml:"name,omitempty"`
	Title         string                 `json:"title,omitempty" yaml:"title,omitempty"`
	Summary       string                 `json:"summary,omitempty" yaml:"summary,omitempty"`
	Description   string                 `json:"description,omitempty" yaml:"description,omitempty"`
	Tags          []*AsyncAPITag         `json:"tags,omitempty" yaml:"tags,omitempty"`
	Headers       *AsyncAPISchema        `json:"headers,omitempty" yaml:"headers,omitempty"`
	Payload       *AsyncAPISchema        `json:"payload,omitempty" yaml:"payload,omitempty"`
	Examples      []interface{}          `json:"examples,omitempty" yaml:"examples,omitempty"`
	Bindings      map[string]interface{} `json:"bindings,omitempty" yaml:"bindings,omitempty"`
	Traits        []interface{}          `json:"traits,omitempty" yaml:"traits,omitempty"`
	CorrelationId *AsyncAPICorrelationId `json:"correlationId,omitempty" yaml:"correlationId,omitempty"`
	Ref           string                 `json:"$ref,omitempty" yaml:"$ref,omitempty"`
}

// AsyncAPICorrelationId represents correlation ID for request-reply
type AsyncAPICorrelationId struct {
	Location    string `json:"location,omitempty" yaml:"location,omitempty"`
	Description string `json:"description,omitempty" yaml:"description,omitempty"`
}

// AsyncAPIParameter represents a parameter in AsyncAPI 3.0.0
type AsyncAPIParameter struct {
	Description string        `json:"description,omitempty" yaml:"description,omitempty"`
	Default     interface{}   `json:"default,omitempty" yaml:"default,omitempty"`
	Enum        []interface{} `json:"enum,omitempty" yaml:"enum,omitempty"`
	Examples    []interface{} `json:"examples,omitempty" yaml:"examples,omitempty"`
	Location    string        `json:"location,omitempty" yaml:"location,omitempty"`
}

// AsyncAPISchema represents a schema in AsyncAPI 3.0.0
type AsyncAPISchema struct {
	Type                 string                     `json:"type,omitempty" yaml:"type,omitempty"`
	Format               string                     `json:"format,omitempty" yaml:"format,omitempty"`
	Title                string                     `json:"title,omitempty" yaml:"title,omitempty"`
	Description          string                     `json:"description,omitempty" yaml:"description,omitempty"`
	Default              interface{}                `json:"default,omitempty" yaml:"default,omitempty"`
	Example              interface{}                `json:"example,omitempty" yaml:"example,omitempty"`
	Enum                 []interface{}              `json:"enum,omitempty" yaml:"enum,omitempty"`
	Properties           map[string]*AsyncAPISchema `json:"properties,omitempty" yaml:"properties,omitempty"`
	Items                *AsyncAPISchema            `json:"items,omitempty" yaml:"items,omitempty"`
	Required             []string                   `json:"required,omitempty" yaml:"required,omitempty"`
	AdditionalProperties *AsyncAPISchema            `json:"additionalProperties,omitempty" yaml:"additionalProperties,omitempty"`
	Ref                  string                     `json:"$ref,omitempty" yaml:"$ref,omitempty"`
}

// AsyncAPIComponents represents the components section in AsyncAPI 3.0.0
type AsyncAPIComponents struct {
	Schemas         map[string]*AsyncAPISchema         `json:"schemas,omitempty" yaml:"schemas,omitempty"`
	Messages        map[string]*AsyncAPIMessage        `json:"messages,omitempty" yaml:"messages,omitempty"`
	SecuritySchemes map[string]*AsyncAPISecurityScheme `json:"securitySchemes,omitempty" yaml:"securitySchemes,omitempty"`
	Parameters      map[string]*AsyncAPIParameter      `json:"parameters,omitempty" yaml:"parameters,omitempty"`
	Channels        map[string]*AsyncAPIChannel        `json:"channels,omitempty" yaml:"channels,omitempty"`
	Operations      map[string]*AsyncAPIOperation      `json:"operations,omitempty" yaml:"operations,omitempty"`
	Replies         map[string]*AsyncAPIOperationReply `json:"replies,omitempty" yaml:"replies,omitempty"`
	ReplyAddresses  map[string]*AsyncAPIReplyAddress   `json:"replyAddresses,omitempty" yaml:"replyAddresses,omitempty"`
	Tags            map[string]*AsyncAPITag            `json:"tags,omitempty" yaml:"tags,omitempty"`
	ExternalDocs    map[string]*AsyncAPIExternalDocs   `json:"externalDocs,omitempty" yaml:"externalDocs,omitempty"`
}

// AsyncAPISecurityScheme represents a security scheme
type AsyncAPISecurityScheme struct {
	Type        string `json:"type" yaml:"type"`
	Description string `json:"description,omitempty" yaml:"description,omitempty"`
	Name        string `json:"name,omitempty" yaml:"name,omitempty"`
	In          string `json:"in,omitempty" yaml:"in,omitempty"`
	Scheme      string `json:"scheme,omitempty" yaml:"scheme,omitempty"`
}

// AsyncAPITag represents a tag
type AsyncAPITag struct {
	Name         string                `json:"name" yaml:"name"`
	Description  string                `json:"description,omitempty" yaml:"description,omitempty"`
	ExternalDocs *AsyncAPIExternalDocs `json:"externalDocs,omitempty" yaml:"externalDocs,omitempty"`
}

// AsyncAPIExternalDocs represents external documentation
type AsyncAPIExternalDocs struct {
	Description string `json:"description,omitempty" yaml:"description,omitempty"`
	URL         string `json:"url" yaml:"url"`
}

// GenerateWebSocketEndpoints generates AsyncAPI 3.0.0 specification for each WebSocket channel
func (g *Generator) GenerateWebSocketEndpoints(exchange, version, apiType string, channels []wsParser.Channel) error {
	baseDir := filepath.Join(g.outputDir, exchange, "asyncapi", apiType)
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return fmt.Errorf("creating directory: %w", err)
	}

	for _, channel := range channels {
		channelPath := filepath.Join(baseDir, fmt.Sprintf("%s.yaml", strings.ReplaceAll(channel.Name, "/", "_")))

		// For protected methods, skip if file already exists to avoid overwriting
		if channel.Protected {
			if _, err := os.Stat(channelPath); err == nil {
				logrus.Debugf("Skipping protected method %s - file already exists: %s", channel.Name, channelPath)
				continue
			}
			logrus.Debugf("Generating protected method %s - file does not exist: %s", channel.Name, channelPath)
		}

		// Convert channel to AsyncAPI 3.0.0 format
		asyncChannel := g.convertChannelToAsyncAPIChannel(&channel)

		// Convert channel messages to component messages
		componentMessages := g.convertChannelMessagesToComponentMessages(&channel)

		// Create operations for this channel
		operations := g.createOperationsFromChannel(&channel, apiType)

		// Write channel spec to file
		channelSpec := &AsyncAPISpec{
			AsyncAPI: "3.0.0",
			Info:     &AsyncAPIInfo{},
			Channels: map[string]*AsyncAPIChannel{
				apiType: asyncChannel,
			},
			Operations: operations,
			Components: &AsyncAPIComponents{
				Schemas:         make(map[string]*AsyncAPISchema),
				Messages:        componentMessages,
				SecuritySchemes: make(map[string]*AsyncAPISecurityScheme),
			},
		}

		// Add schemas
		for _, schema := range channel.Schemas {
			channelSpec.Components.Schemas[schema.Title] = g.convertToAsyncAPISchema(schema)
		}

		// Add security schemes
		if channel.SecuritySchemas != nil {
			for name, schema := range channel.SecuritySchemas {
				channelSpec.Components.SecuritySchemes[name] = g.convertToAsyncAPISecurityScheme(schema)
			}
		}

		if err := g.writeAsyncAPISpec(channelSpec, channelPath); err != nil {
			return fmt.Errorf("writing channel spec: %w", err)
		}
	}

	return nil
}

// GenerateWebSocket creates an AsyncAPI 3.0.0 specification from parsed WebSocket channels
func (g *Generator) GenerateWebSocket(exchange, version, title, apiType string, servers []string) error {
	if len(servers) == 0 {
		return fmt.Errorf("no servers found for %s %s WebSocket API", exchange, apiType)
	}

	// Create servers using AsyncAPI 3.0.0 format
	asyncServers := make(map[string]*AsyncAPIServer)
	for i, server := range servers {
		serverName := fmt.Sprintf("server%d", i+1)
		if i == 0 {
			serverName = "production"
		}

		host, pathname, protocol := g.parseServerURL(server)
		asyncServers[serverName] = &AsyncAPIServer{
			Host:        host,
			Pathname:    pathname,
			Protocol:    protocol,
			Title:       fmt.Sprintf("%s Server", strings.Title(exchange)),
			Summary:     fmt.Sprintf("%s %s WebSocket API Server", strings.Title(exchange), strings.Title(apiType)),
			Description: fmt.Sprintf("WebSocket server for %s exchange %s API", exchange, apiType),
		}
	}

	spec := &AsyncAPISpec{
		AsyncAPI: "3.0.0",
		Info: &AsyncAPIInfo{
			Title:       title,
			Description: fmt.Sprintf("AsyncAPI specification for %s exchange - %s WebSocket API", strings.Title(exchange), strings.Title(apiType)),
			Version:     version,
		},
		Servers:    asyncServers,
		Channels:   make(map[string]*AsyncAPIChannel),
		Operations: make(map[string]*AsyncAPIOperation),
		Components: &AsyncAPIComponents{
			Schemas:         make(map[string]*AsyncAPISchema),
			Messages:        make(map[string]*AsyncAPIMessage),
			SecuritySchemes: make(map[string]*AsyncAPISecurityScheme),
		},
	}

	// Read all channel specs from the channels directory
	baseDir := filepath.Join(g.outputDir, exchange, "asyncapi", apiType)
	files, err := os.ReadDir(baseDir)
	if err != nil {
		return fmt.Errorf("reading channels directory: %w", err)
	}

	// Sort files by name
	sort.Slice(files, func(i, j int) bool {
		return files[i].Name() < files[j].Name()
	})

	// Initialize the main channel for this apiType
	mainChannel := &AsyncAPIChannel{
		Address:     "/",
		Title:       fmt.Sprintf("Channel %s", apiType),
		Description: fmt.Sprintf("%s WebSocket API Channel", strings.Title(apiType)),
		Messages:    make(map[string]*AsyncAPIMessage),
	}

	for _, file := range files {
		// Read each channel spec
		channelSpecPath := filepath.Join(baseDir, file.Name())
		channelSpecData, err := os.ReadFile(channelSpecPath)
		if err != nil {
			return fmt.Errorf("reading channel spec %s: %w", file.Name(), err)
		}

		var channelSpec AsyncAPISpec
		if err := yaml.Unmarshal(channelSpecData, &channelSpec); err != nil {
			return fmt.Errorf("unmarshaling channel spec %s: %w", file.Name(), err)
		}

		// Merge channels - since all channels now use the same key (apiType), we merge their messages
		for _, v := range channelSpec.Channels {
			// Merge messages from this channel into the main channel
			for msgKey, msgRef := range v.Messages {
				// Since individual files now use the same camelCase format as the final file,
				// we can directly merge without creating unique keys
				if _, exists := mainChannel.Messages[msgKey]; exists {
					logrus.Debugf("Message key %s already exists, skipping duplicate", msgKey)
					continue
				}
				mainChannel.Messages[msgKey] = msgRef
			}
		}

		// Merge operations
		for k, v := range channelSpec.Operations {
			if _, exists := spec.Operations[k]; exists {
				return fmt.Errorf("duplicate operation: %s", k)
			}
			spec.Operations[k] = v
		}

		// Merge schemas
		var schemas []string
		if channelSpec.Components != nil {
			for k, v := range channelSpec.Components.Schemas {
				if slices.Contains(schemas, k) {
					logrus.Debugf("duplicate schema found: %s", k)
					continue
				}
				schemas = append(schemas, k)
				spec.Components.Schemas[k] = v
			}
		}

		// Merge messages
		var messages []string
		if channelSpec.Components != nil {
			for k, v := range channelSpec.Components.Messages {
				if slices.Contains(messages, k) {
					logrus.Debugf("duplicate message found: %s", k)
					continue
				}
				messages = append(messages, k)
				spec.Components.Messages[k] = v
			}
		}

		// Merge security schemes
		var securitySchemas []string
		if channelSpec.Components != nil {
			for k, v := range channelSpec.Components.SecuritySchemes {
				if slices.Contains(securitySchemas, k) {
					logrus.Debugf("duplicate security schema found: %s", k)
					continue
				}
				securitySchemas = append(securitySchemas, k)
				spec.Components.SecuritySchemes[k] = v
			}
		}
	}

	// Add the merged main channel to the spec
	spec.Channels[apiType] = mainChannel

	outputDir := filepath.Join(g.outputDir, exchange, "asyncapi")
	// Ensure output directory exists
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("creating output directory: %w", err)
	}

	outputPath := filepath.Join(outputDir, fmt.Sprintf("%s.yaml", apiType))
	if err := g.writeAsyncAPISpec(spec, outputPath); err != nil {
		return fmt.Errorf("writing AsyncAPI specification: %w", err)
	}

	return nil
}

// parseServerURL splits a server URL into host, pathname, and protocol components
func (g *Generator) parseServerURL(serverURL string) (host, pathname, protocol string) {
	// Determine protocol
	protocol = "ws" // default
	cleanURL := serverURL

	if strings.HasPrefix(serverURL, "ws://") {
		cleanURL = strings.TrimPrefix(serverURL, "ws://")
		protocol = "ws"
	} else if strings.HasPrefix(serverURL, "wss://") {
		cleanURL = strings.TrimPrefix(serverURL, "wss://")
		protocol = "wss"
	}

	// Split host and path
	parts := strings.SplitN(cleanURL, "/", 2)
	host = parts[0]

	if len(parts) > 1 && parts[1] != "" {
		pathname = "/" + parts[1]
	}

	return host, pathname, protocol
}

// sanitizeChannelName creates a valid channel key from a channel name
func (g *Generator) sanitizeChannelName(channelName string) string {
	// Replace invalid characters with underscores and ensure it starts with a letter
	sanitized := strings.ReplaceAll(channelName, "/", "_")
	sanitized = strings.ReplaceAll(sanitized, ".", "_")
	sanitized = strings.ReplaceAll(sanitized, "-", "_")

	// Ensure it starts with a letter
	if len(sanitized) > 0 && !((sanitized[0] >= 'a' && sanitized[0] <= 'z') || (sanitized[0] >= 'A' && sanitized[0] <= 'Z')) {
		sanitized = "Channel_" + sanitized
	}

	return sanitized
}

// createOperationsFromChannel creates AsyncAPI 3.0.0 operations from a WebSocket channel
func (g *Generator) createOperationsFromChannel(channel *wsParser.Channel, apiType string) map[string]*AsyncAPIOperation {
	operations := make(map[string]*AsyncAPIOperation)
	channelRef := fmt.Sprintf("#/channels/%s", apiType)
	channelName := g.sanitizeChannelName(channel.Name)

	// Create operations based on the messages in the channel
	if sendMsg, exists := channel.Messages["send"]; exists {
		operationID := g.toCamelCase(fmt.Sprintf("send_%s", channelName))
		messageKey := g.toCamelCase(fmt.Sprintf("%s_send", channelName))
		operations[operationID] = &AsyncAPIOperation{
			Title:       fmt.Sprintf("Send to %s", channel.Name),
			Summary:     sendMsg.Summary,
			Description: sendMsg.Description,
			Action:      "send",
			Channel:     map[string]string{"$ref": channelRef},
			Messages:    []map[string]string{{"$ref": fmt.Sprintf("#/channels/%s/messages/%s", apiType, messageKey)}},
		}
	}

	if receiveMsg, exists := channel.Messages["receive"]; exists {
		operationID := g.toCamelCase(fmt.Sprintf("receive_%s", channelName))
		messageKey := g.toCamelCase(fmt.Sprintf("%s_receive", channelName))
		operations[operationID] = &AsyncAPIOperation{
			Title:       fmt.Sprintf("Receive from %s", channel.Name),
			Summary:     receiveMsg.Summary,
			Description: receiveMsg.Description,
			Action:      "receive",
			Channel:     map[string]string{"$ref": channelRef},
			Messages:    []map[string]string{{"$ref": fmt.Sprintf("#/channels/%s/messages/%s", apiType, messageKey)}},
		}
	}

	return operations
}

// convertChannelToAsyncAPIChannel converts a WebSocket channel to AsyncAPI 3.0.0 channel
func (g *Generator) convertChannelToAsyncAPIChannel(channel *wsParser.Channel) *AsyncAPIChannel {
	asyncChannel := &AsyncAPIChannel{
		Address:     "/",
		Title:       fmt.Sprintf("Channel %s", channel.Name),
		Description: channel.Description,
		Messages:    make(map[string]*AsyncAPIMessage),
	}

	// Convert messages to use references to components.messages
	channelName := g.sanitizeChannelName(channel.Name)
	if _, exists := channel.Messages["send"]; exists {
		messageKey := g.toCamelCase(fmt.Sprintf("%s_send", channelName))
		asyncChannel.Messages[messageKey] = &AsyncAPIMessage{
			Ref: fmt.Sprintf("#/components/messages/%s", messageKey),
		}
	}

	if _, exists := channel.Messages["receive"]; exists {
		messageKey := g.toCamelCase(fmt.Sprintf("%s_receive", channelName))
		asyncChannel.Messages[messageKey] = &AsyncAPIMessage{
			Ref: fmt.Sprintf("#/components/messages/%s", messageKey),
		}
	}

	return asyncChannel
}

// convertChannelMessagesToComponentMessages converts channel messages to component messages
func (g *Generator) convertChannelMessagesToComponentMessages(channel *wsParser.Channel) map[string]*AsyncAPIMessage {
	componentMessages := make(map[string]*AsyncAPIMessage)
	channelName := g.sanitizeChannelName(channel.Name)

	if sendMsg, exists := channel.Messages["send"]; exists {
		// Convert the payload and ensure params object has required fields populated
		payload := g.convertToAsyncAPISchema(sendMsg.Payload)
		g.populateParamsRequired(payload, channel.Parameters)

		messageKey := g.toCamelCase(fmt.Sprintf("%s_send", channelName))
		asyncMessage := &AsyncAPIMessage{
			Name:        sendMsg.Title,
			Title:       sendMsg.Title,
			Summary:     sendMsg.Summary,
			Description: sendMsg.Description,
			Payload:     payload,
		}

		// Set correlation ID if present in the parser message
		if sendMsg.CorrelationId != nil {
			asyncMessage.CorrelationId = &AsyncAPICorrelationId{
				Location:    sendMsg.CorrelationId.Location,
				Description: sendMsg.CorrelationId.Description,
			}
		}

		componentMessages[messageKey] = asyncMessage
	}

	if receiveMsg, exists := channel.Messages["receive"]; exists {
		messageKey := g.toCamelCase(fmt.Sprintf("%s_receive", channelName))
		asyncMessage := &AsyncAPIMessage{
			Name:        receiveMsg.Title,
			Title:       receiveMsg.Title,
			Summary:     receiveMsg.Summary,
			Description: receiveMsg.Description,
			Payload:     g.convertToAsyncAPISchema(receiveMsg.Payload),
		}

		// Set correlation ID if present in the parser message
		if receiveMsg.CorrelationId != nil {
			asyncMessage.CorrelationId = &AsyncAPICorrelationId{
				Location:    receiveMsg.CorrelationId.Location,
				Description: receiveMsg.CorrelationId.Description,
			}
		}

		componentMessages[messageKey] = asyncMessage
	}

	return componentMessages
}

// populateParamsRequired ensures that the params object in the payload has the required field populated
func (g *Generator) populateParamsRequired(schema *AsyncAPISchema, parameters []*wsParser.Parameter) {
	if schema == nil || schema.Properties == nil {
		return
	}

	// Look for params property in the payload
	if paramsProperty, exists := schema.Properties["params"]; exists && paramsProperty != nil {
		// Collect required parameter names
		var requiredParams []string
		for _, param := range parameters {
			if param.Required {
				requiredParams = append(requiredParams, param.Name)
			}
		}

		// Set the required field on the params property
		if len(requiredParams) > 0 {
			paramsProperty.Required = requiredParams
		}
	}
}

// convertToAsyncAPISchema converts a WebSocket schema to AsyncAPI schema
func (g *Generator) convertToAsyncAPISchema(schema *wsParser.Schema) *AsyncAPISchema {
	if schema == nil {
		return nil
	}

	if schema.Ref != "" {
		return &AsyncAPISchema{
			Ref: schema.Ref,
		}
	}

	result := &AsyncAPISchema{
		Type:        schema.Type,
		Format:      schema.Format,
		Title:       schema.Title,
		Description: schema.Description,
		Default:     schema.Default,
		Example:     schema.Example,
		Enum:        schema.Enum,
		Required:    schema.Required,
	}

	if schema.Items != nil {
		result.Items = g.convertToAsyncAPISchema(schema.Items)
	}

	if schema.Properties != nil {
		result.Properties = make(map[string]*AsyncAPISchema)
		for name, prop := range schema.Properties {
			result.Properties[name] = g.convertToAsyncAPISchema(prop)
		}
	}

	if schema.AdditionalProperties != nil {
		result.AdditionalProperties = g.convertToAsyncAPISchema(schema.AdditionalProperties)
	}

	return result
}

// convertToAsyncAPISecurityScheme converts a WebSocket security schema to AsyncAPI security scheme
func (g *Generator) convertToAsyncAPISecurityScheme(securitySchema *wsParser.SecuritySchema) *AsyncAPISecurityScheme {
	return &AsyncAPISecurityScheme{
		Type: securitySchema.Type,
		Name: securitySchema.Name,
		In:   securitySchema.In,
	}
}

// writeAsyncAPISpec writes the AsyncAPI specification to a file
func (g *Generator) writeAsyncAPISpec(spec *AsyncAPISpec, path string) error {
	data, err := yaml.Marshal(spec)
	if err != nil {
		return fmt.Errorf("marshaling AsyncAPI specification: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("writing AsyncAPI specification file: %w", err)
	}

	return nil
}

// toCamelCase converts a string with underscores to camelCase
func (g *Generator) toCamelCase(s string) string {
	parts := strings.Split(s, "_")
	if len(parts) == 0 {
		return s
	}

	// Keep the first part as is (for compound words like userDataStream), capitalize the rest
	result := parts[0]
	for i := 1; i < len(parts); i++ {
		if len(parts[i]) > 0 {
			result += strings.ToUpper(parts[i][:1]) + strings.ToLower(parts[i][1:])
		}
	}
	return result
}
