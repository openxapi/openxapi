package parser

import (
	"context"
	"fmt"
)

// Parser defines the interface for parsing exchange API documentation
type Parser interface {
	// Parse processes the API documentation and returns the extracted endpoints
	Parse(ctx context.Context, doc Documentation) ([]Endpoint, error)
	
	// CheckVersion checks if the API documentation has been updated
	CheckVersion(ctx context.Context, doc Documentation) (string, error)
}

// Documentation represents an API documentation source
type Documentation struct {
	URL    string
	Type   string
	Format string
}

// Endpoint represents an API endpoint extracted from documentation
type Endpoint struct {
	Path        string
	Method      string
	Summary     string
	Description string
	Parameters  []Parameter
	RequestBody *RequestBody
	Responses   map[string]Response
	Tags        []string
}

// Parameter represents an API endpoint parameter
type Parameter struct {
	Name        string
	In          string // query, path, header
	Required    bool
	Description string
	Schema      Schema
}

// RequestBody represents the request body structure
type RequestBody struct {
	Required    bool
	Description string
	Content     map[string]MediaType // e.g., "application/json": {...}
}

// Response represents an API response
type Response struct {
	Description string
	Content     map[string]MediaType
}

// MediaType represents a specific media type content
type MediaType struct {
	Schema Schema
}

// Schema represents a data type schema
type Schema struct {
	Type        string
	Format      string
	Properties  map[string]Schema
	Items       *Schema // for arrays
	Required    []string
	Example     interface{}
	Enum        []interface{}
	Description string
}

// NewParser creates a new parser based on the documentation format
func NewParser(format string) (Parser, error) {
	switch format {
	case "html":
		return &HTMLParser{}, nil
	// Add more parser types as needed
	default:
		return nil, fmt.Errorf("unsupported documentation format: %s", format)
	}
}

// HTMLParser implements Parser interface for HTML documentation
type HTMLParser struct{}

func (p *HTMLParser) Parse(ctx context.Context, doc Documentation) ([]Endpoint, error) {
	// TODO: Implement HTML parsing logic
	return nil, fmt.Errorf("HTML parsing not implemented yet")
}

func (p *HTMLParser) CheckVersion(ctx context.Context, doc Documentation) (string, error) {
	// TODO: Implement version checking logic
	return "", fmt.Errorf("version checking not implemented yet")
} 