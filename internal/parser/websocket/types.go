package parser

import (
	"github.com/openxapi/openxapi/internal/config"
)

// Documentation represents information about WebSocket API documentation
type Documentation struct {
	config.AsyncDocumentation
	Options map[string]string // Additional options for parsing
}

// CorrelationId represents correlation ID for request-reply pattern
type CorrelationId struct {
	Location    string // Location of the correlation ID in the message
	Description string // Description of the correlation ID
}

// Schema represents a JSON Schema definition for WebSocket messages
type Schema struct {
	OneOf       []*Schema     `json:"oneOf,omitempty"`
	Type        string        `json:"type,omitempty"`
	Title       string        `json:"title,omitempty"`
	Format      string        `json:"format,omitempty"`
	Description string        `json:"description,omitempty"`
	Enum        []interface{} `json:"enum,omitempty"`
	Const       interface{}   `json:"const,omitempty"`
	Default     interface{}   `json:"default,omitempty"`
	Example     interface{}   `json:"example,omitempty"`

	UniqueItems  bool `json:"uniqueItems,omitempty"`
	ExclusiveMin bool `json:"exclusiveMinimum,omitempty"`
	ExclusiveMax bool `json:"exclusiveMaximum,omitempty"`

	Nullable   bool `json:"nullable,omitempty"`
	Deprecated bool `json:"deprecated,omitempty"`

	// Numeric constraints
	Min        *float64 `json:"minimum,omitempty"`
	Max        *float64 `json:"maximum,omitempty"`
	MultipleOf *float64 `json:"multipleOf,omitempty"`

	// String constraints
	MinLength uint64  `json:"minLength,omitempty"`
	MaxLength *uint64 `json:"maxLength,omitempty"`
	Pattern   string  `json:"pattern,omitempty"`

	// Array constraints
	MinItems uint64  `json:"minItems,omitempty"`
	MaxItems *uint64 `json:"maxItems,omitempty"`
	Items    *Schema `json:"items,omitempty"`

	// Object constraints
	Required []string `json:"required,omitempty"`

	// Additional fields
	Properties           map[string]*Schema `json:"properties,omitempty"`
	AdditionalProperties *Schema            `json:"additionalProperties,omitempty"`

	// OpenAPI specific fields
	Ref string `json:"$ref,omitempty"`
}

// Channel represents a WebSocket channel/stream
type Channel struct {
	Name            string                     // Channel name/identifier
	Description     string                     // Description of the channel
	Summary         string                     // Short summary of the channel
	Security        []map[string][]string      // Security requirements for the channel
	Parameters      []*Parameter               // Parameters for subscribing to the channel
	Messages        map[string]*Message        // Message types by direction (send/receive)
	Metadata        map[string]interface{}     // Additional metadata
	Tags            []string                   // Tags for categorizing the channel
	Extensions      map[string]interface{}     // AsyncAPI extensions
	Deprecated      bool                       // Whether the channel is deprecated
	Bindings        map[string]interface{}     // Protocol-specific bindings
	Schemas         []*Schema                  // Schemas for the channel
	SecuritySchemas map[string]*SecuritySchema // Security schemas for the channel
	Protected       bool                       // Whether the channel requires authentication
}

// Parameter represents a channel parameter
type Parameter struct {
	Name        string  // Parameter name
	Required    bool    // Whether the parameter is required
	Description string  // Description of the parameter
	Location    string  // Parameter location (path, query, header, etc.)
	Schema      *Schema // Parameter schema
}

// Message represents a WebSocket message
type Message struct {
	Title         string                 // Message title
	Description   string                 // Description of the message
	Payload       *Schema                // Message payload schema
	Headers       map[string]*Schema     // Message headers
	Examples      []interface{}          // Message examples
	Bindings      map[string]interface{} // Protocol-specific bindings
	Tags          []string               // Message tags
	Summary       string                 // Message summary
	CorrelationId *CorrelationId         // Correlation ID for the message
}

// SecuritySchema represents a security requirement for a channel
type SecuritySchema struct {
	Type string `json:"type,omitempty"`
	In   string `json:"in,omitempty"`
	Name string `json:"name,omitempty"`
}
