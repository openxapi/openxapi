package parser

// Documentation represents information about API documentation
type Documentation struct {
	URLs    []string          // URLs to the documentation
	Type    string            // Type of documentation (e.g., "html", "md")
	Options map[string]string // Additional options for parsing
}

// Schema represents a JSON Schema definition
type Schema struct {
	Type                 string            `json:"type,omitempty"`
	Format               string            `json:"format,omitempty"`
	Description          string            `json:"description,omitempty"`
	Example              interface{}       `json:"example,omitempty"`
	Enum                 []interface{}     `json:"enum,omitempty"`
	Required             []string          `json:"required,omitempty"`
	Properties           map[string]Schema `json:"properties,omitempty"`
	Items                *Schema           `json:"items,omitempty"`
	AdditionalProperties *Schema           `json:"additionalProperties,omitempty"`

	// Numeric constraints
	Minimum    *int64   `json:"minimum,omitempty"`
	Maximum    *int64   `json:"maximum,omitempty"`
	MultipleOf *float64 `json:"multipleOf,omitempty"`

	// String constraints
	MinLength *uint64 `json:"minLength,omitempty"`
	MaxLength *uint64 `json:"maxLength,omitempty"`
	Pattern   string  `json:"pattern,omitempty"`

	// Array constraints
	MinItems    *uint64 `json:"minItems,omitempty"`
	MaxItems    *uint64 `json:"maxItems,omitempty"`
	UniqueItems bool    `json:"uniqueItems,omitempty"`

	// Additional fields
	Nullable   bool `json:"nullable,omitempty"`
	Deprecated bool `json:"deprecated,omitempty"`
}

// Endpoint represents an API endpoint
type Endpoint struct {
	Path        string                 // API path
	Method      string                 // HTTP method
	Description string                 // Description of the endpoint
	Summary     string                 // Short summary of the endpoint
	Parameters  []Parameter            // Parameters accepted by the endpoint
	Responses   map[string]Response    // Responses by status code
	Metadata    map[string]interface{} // Additional metadata
	Tags        []string               // Tags for categorizing the endpoint
	Extensions  map[string]interface{} // OpenAPI extensions
	RequestBody *RequestBody           // Request body definition
	Deprecated  bool                   // Whether the endpoint is deprecated
	OperationID string                 // Operation ID
}

// Parameter represents an endpoint parameter
type Parameter struct {
	Name        string // Parameter name
	Type        string // Parameter type
	Required    bool   // Whether the parameter is required
	Description string // Description of the parameter
	In          string // Parameter location (query, path, header, cookie)
	Schema      Schema // Parameter schema
}

// MediaType represents a media type in request or response
type MediaType struct {
	Schema Schema `json:"schema,omitempty"`
}

// RequestBody represents the body of a request
type RequestBody struct {
	Description string               `json:"description,omitempty"`
	Content     map[string]MediaType `json:"content,omitempty"`
	Required    bool                 `json:"required,omitempty"`
}

// Response represents an API response
type Response struct {
	Description string               // Description of the response
	Schema      string               // Response schema
	Content     map[string]MediaType // Response content by media type
}
