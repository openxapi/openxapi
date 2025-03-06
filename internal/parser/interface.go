package parser

import (
	"context"
	"time"
)

// Parser defines the interface for API documentation parsers
type Parser interface {
	// Parse parses the documentation and returns endpoints
	Parse(ctx context.Context, doc Documentation) ([]Endpoint, error)
	
	// CheckVersion checks if the documentation version has changed
	CheckVersion(ctx context.Context, doc Documentation) (bool, time.Time, error)
}
