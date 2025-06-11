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

// AsyncAPISpec represents an AsyncAPI specification
type AsyncAPISpec struct {
	AsyncAPI     string                      `json:"asyncapi" yaml:"asyncapi"`
	ID           string                      `json:"id,omitempty" yaml:"id,omitempty"`
	Info         *AsyncAPIInfo               `json:"info" yaml:"info"`
	Servers      map[string]*AsyncAPIServer  `json:"servers,omitempty" yaml:"servers,omitempty"`
	Channels     map[string]*AsyncAPIChannel `json:"channels,omitempty" yaml:"channels,omitempty"`
	Components   *AsyncAPIComponents         `json:"components,omitempty" yaml:"components,omitempty"`
	Tags         []*AsyncAPITag              `json:"tags,omitempty" yaml:"tags,omitempty"`
	ExternalDocs *AsyncAPIExternalDocs       `json:"externalDocs,omitempty" yaml:"externalDocs,omitempty"`
}

// AsyncAPIInfo represents the info object in AsyncAPI
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

// AsyncAPIServer represents a server
type AsyncAPIServer struct {
	URL         string                 `json:"url" yaml:"url"`
	Description string                 `json:"description,omitempty" yaml:"description,omitempty"`
	Protocol    string                 `json:"protocol" yaml:"protocol"`
	Variables   map[string]interface{} `json:"variables,omitempty" yaml:"variables,omitempty"`
	Security    []map[string][]string  `json:"security,omitempty" yaml:"security,omitempty"`
	Bindings    map[string]interface{} `json:"bindings,omitempty" yaml:"bindings,omitempty"`
}

// AsyncAPIChannel represents a channel
type AsyncAPIChannel struct {
	Description string                        `json:"description,omitempty" yaml:"description,omitempty"`
	Subscribe   *AsyncAPIOperation            `json:"subscribe,omitempty" yaml:"subscribe,omitempty"`
	Publish     *AsyncAPIOperation            `json:"publish,omitempty" yaml:"publish,omitempty"`
	Parameters  map[string]*AsyncAPIParameter `json:"parameters,omitempty" yaml:"parameters,omitempty"`
	Bindings    map[string]interface{}        `json:"bindings,omitempty" yaml:"bindings,omitempty"`
}

// AsyncAPIOperation represents an operation
type AsyncAPIOperation struct {
	OperationID string                 `json:"operationId,omitempty" yaml:"operationId,omitempty"`
	Summary     string                 `json:"summary,omitempty" yaml:"summary,omitempty"`
	Description string                 `json:"description,omitempty" yaml:"description,omitempty"`
	Tags        []*AsyncAPITag         `json:"tags,omitempty" yaml:"tags,omitempty"`
	Message     *AsyncAPIMessage       `json:"message,omitempty" yaml:"message,omitempty"`
	Traits      []interface{}          `json:"traits,omitempty" yaml:"traits,omitempty"`
	Bindings    map[string]interface{} `json:"bindings,omitempty" yaml:"bindings,omitempty"`
}

// AsyncAPIMessage represents a message
type AsyncAPIMessage struct {
	Name        string                 `json:"name,omitempty" yaml:"name,omitempty"`
	Title       string                 `json:"title,omitempty" yaml:"title,omitempty"`
	Summary     string                 `json:"summary,omitempty" yaml:"summary,omitempty"`
	Description string                 `json:"description,omitempty" yaml:"description,omitempty"`
	Tags        []*AsyncAPITag         `json:"tags,omitempty" yaml:"tags,omitempty"`
	Headers     *AsyncAPISchema        `json:"headers,omitempty" yaml:"headers,omitempty"`
	Payload     *AsyncAPISchema        `json:"payload,omitempty" yaml:"payload,omitempty"`
	Examples    []interface{}          `json:"examples,omitempty" yaml:"examples,omitempty"`
	Bindings    map[string]interface{} `json:"bindings,omitempty" yaml:"bindings,omitempty"`
}

// AsyncAPIParameter represents a parameter
type AsyncAPIParameter struct {
	Description string          `json:"description,omitempty" yaml:"description,omitempty"`
	Schema      *AsyncAPISchema `json:"schema,omitempty" yaml:"schema,omitempty"`
	Location    string          `json:"location,omitempty" yaml:"location,omitempty"`
}

// AsyncAPISchema represents a schema
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

// AsyncAPIComponents represents the components section
type AsyncAPIComponents struct {
	Schemas         map[string]*AsyncAPISchema         `json:"schemas,omitempty" yaml:"schemas,omitempty"`
	Messages        map[string]*AsyncAPIMessage        `json:"messages,omitempty" yaml:"messages,omitempty"`
	SecuritySchemes map[string]*AsyncAPISecurityScheme `json:"securitySchemes,omitempty" yaml:"securitySchemes,omitempty"`
	Parameters      map[string]*AsyncAPIParameter      `json:"parameters,omitempty" yaml:"parameters,omitempty"`
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

// GenerateWebSocketEndpoints generates AsyncAPI specification for each WebSocket channel
func (g *Generator) GenerateWebSocketEndpoints(exchange, version, apiType string, channels []wsParser.Channel) error {
	baseDir := filepath.Join(g.outputDir, exchange, "asyncapi", apiType)
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return fmt.Errorf("creating directory: %w", err)
	}

	for _, channel := range channels {
		if channel.Protected {
			continue
		}
		channelPath := filepath.Join(baseDir, fmt.Sprintf("%s.yaml", strings.ReplaceAll(channel.Name, "/", "_")))
		asyncChannel := g.convertChannelToAsyncAPIChannel(&channel)

		// Write channel spec to file
		channelSpec := &AsyncAPISpec{
			AsyncAPI: "2.6.0",
			Info:     &AsyncAPIInfo{},
			Channels: map[string]*AsyncAPIChannel{
				channel.Name: asyncChannel,
			},
			Components: &AsyncAPIComponents{
				Schemas:         make(map[string]*AsyncAPISchema),
				SecuritySchemes: make(map[string]*AsyncAPISecurityScheme),
			},
		}

		for _, schema := range channel.Schemas {
			channelSpec.Components.Schemas[schema.Title] = g.convertToAsyncAPISchema(schema)
		}

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

// GenerateWebSocket creates an AsyncAPI specification from parsed WebSocket channels
func (g *Generator) GenerateWebSocket(exchange, version, title, apiType string, servers []string) error {
	if len(servers) == 0 {
		return fmt.Errorf("no servers found for %s %s WebSocket API", exchange, apiType)
	}

	asyncServers := make(map[string]*AsyncAPIServer)
	for i, server := range servers {
		serverName := fmt.Sprintf("server%d", i+1)
		if i == 0 {
			serverName = "production"
		}
		asyncServers[serverName] = &AsyncAPIServer{
			URL:         server,
			Description: fmt.Sprintf("%s %s WebSocket API Server", strings.Title(exchange), strings.Title(apiType)),
			Protocol:    "ws",
		}
	}

	spec := &AsyncAPISpec{
		AsyncAPI: "2.6.0",
		Info: &AsyncAPIInfo{
			Title:       title,
			Description: fmt.Sprintf("AsyncAPI specification for %s exchange - %s WebSocket API", strings.Title(exchange), strings.Title(apiType)),
			Version:     version,
		},
		Servers:  asyncServers,
		Channels: make(map[string]*AsyncAPIChannel),
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

		// Merge channels
		for k, v := range channelSpec.Channels {
			if _, exists := spec.Channels[k]; exists {
				return fmt.Errorf("duplicate channel: %s", k)
			}
			spec.Channels[k] = v
		}

		// Merge schemas
		var schemas []string
		for k, v := range channelSpec.Components.Schemas {
			if slices.Contains(schemas, k) {
				logrus.Debugf("duplicate schema found: %s", k)
				continue
			}
			schemas = append(schemas, k)
			spec.Components.Schemas[k] = v
		}

		// Merge security schemes
		var securitySchemas []string
		for k, v := range channelSpec.Components.SecuritySchemes {
			if slices.Contains(securitySchemas, k) {
				logrus.Debugf("duplicate security schema found: %s", k)
				continue
			}
			securitySchemas = append(securitySchemas, k)
			spec.Components.SecuritySchemes[k] = v
		}
	}

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

// convertChannelToAsyncAPIChannel converts a WebSocket channel to AsyncAPI channel
func (g *Generator) convertChannelToAsyncAPIChannel(channel *wsParser.Channel) *AsyncAPIChannel {
	asyncChannel := &AsyncAPIChannel{
		Description: channel.Description,
		Parameters:  make(map[string]*AsyncAPIParameter),
	}

	// Convert parameters
	for _, param := range channel.Parameters {
		asyncChannel.Parameters[param.Name] = &AsyncAPIParameter{
			Description: param.Description,
			Schema:      g.convertToAsyncAPISchema(param.Schema),
			Location:    param.Location,
		}
	}

	// Convert messages
	if sendMsg, exists := channel.Messages["send"]; exists {
		asyncChannel.Publish = &AsyncAPIOperation{
			OperationID: fmt.Sprintf("send_%s", channel.Name),
			Summary:     sendMsg.Summary,
			Description: sendMsg.Description,
			Message: &AsyncAPIMessage{
				Name:        sendMsg.Title,
				Title:       sendMsg.Title,
				Description: sendMsg.Description,
				Payload:     g.convertToAsyncAPISchema(sendMsg.Payload),
			},
		}
	}

	if receiveMsg, exists := channel.Messages["receive"]; exists {
		asyncChannel.Subscribe = &AsyncAPIOperation{
			OperationID: fmt.Sprintf("receive_%s", channel.Name),
			Summary:     receiveMsg.Summary,
			Description: receiveMsg.Description,
			Message: &AsyncAPIMessage{
				Name:        receiveMsg.Title,
				Title:       receiveMsg.Title,
				Description: receiveMsg.Description,
				Payload:     g.convertToAsyncAPISchema(receiveMsg.Payload),
			},
		}
	}

	return asyncChannel
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
