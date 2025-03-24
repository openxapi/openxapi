package parser

// Documentation represents information about API documentation
type Documentation struct {
	URLs               []string          // URLs to the documentation
	Type               string            // Type of documentation (e.g., "spot", "futures")
	ProtectedEndpoints []string          // List of protected endpoints
	Options            map[string]string // Additional options for parsing
}

// Schema represents a JSON Schema definition
type Schema struct {
	OneOf       []*Schema     `json:"oneOf,omitempty"`
	Type        string        `json:"type,omitempty"`
	Title       string        `json:"title,omitempty"`
	Format      string        `json:"format,omitempty"`
	Description string        `json:"description,omitempty"`
	Enum        []interface{} `json:"enum,omitempty"`
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
}

// Security represents a security requirement for an endpoint
type SecuritySchema struct {
	Type string `json:"type,omitempty"`
	In   string `json:"in,omitempty"`
	Name string `json:"name,omitempty"`
}

// Endpoint represents an API endpoint
type Endpoint struct {
	Path            string                     // API path
	Method          string                     // HTTP method
	Description     string                     // Description of the endpoint
	Summary         string                     // Short summary of the endpoint
	Security        []map[string][]string      // Security requirements for the endpoint
	Parameters      []*Parameter               // Parameters accepted by the endpoint
	Responses       map[string]*Response       // Responses by status code
	Metadata        map[string]interface{}     // Additional metadata
	Tags            []string                   // Tags for categorizing the endpoint
	Extensions      map[string]interface{}     // OpenAPI extensions
	RequestBody     *RequestBody               // Request body definition
	Deprecated      bool                       // Whether the endpoint is deprecated
	OperationID     string                     // Operation ID
	Schemas         []*Schema                  // Schemas for the endpoint
	SecuritySchemas map[string]*SecuritySchema // Security schemas for the endpoint
	Protected       bool                       // Whether the endpoint is protected
}

// Parameter represents an endpoint parameter
type Parameter struct {
	Name        string  // Parameter name
	Required    bool    // Whether the parameter is required
	Description string  // Description of the parameter
	In          string  // Parameter location (query, path, header, cookie)
	Schema      *Schema // Parameter schema
}

// MediaType represents a media type in request or response
type MediaType struct {
	Schema *Schema `json:"schema,omitempty"`
}

// RequestBody represents the body of a request
type RequestBody struct {
	Description string                `json:"description,omitempty"`
	Content     map[string]*MediaType `json:"content,omitempty"`
	Required    bool                  `json:"required,omitempty"`
}

// Response represents an API response
type Response struct {
	Description string                // Description of the response
	Schema      string                // Response schema
	Content     map[string]*MediaType // Response content by media type
}
