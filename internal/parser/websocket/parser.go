package parser

import (
	"context"
	"time"
)

// Parser defines the interface for WebSocket API documentation parsers
type Parser interface {
	// Parse parses the documentation and returns WebSocket channels
	Parse(ctx context.Context, doc Documentation) ([]Channel, error)

	// CheckVersion checks if the documentation version has changed
	CheckVersion(ctx context.Context, doc Documentation) (bool, time.Time, error)
}
