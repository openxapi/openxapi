package binance

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/openxapi/openxapi/internal/parser"
)

// Parser implements the parser.Parser interface for Binance
type Parser struct {
	parser.HTTPParser
}

// NewParser creates a new Binance parser
func NewParser() *Parser {
	name := "binance"
	return &Parser{
		HTTPParser: parser.HTTPParser{
			Name:       name,
			Client:     &http.Client{},
			UseSamples: false,
			SamplesDir: fmt.Sprintf("samples/%s", name),
			DocParser:  &DocumentParser{},
		},
	}
}

// NewParserWithOptions creates a new Binance parser with options
func NewParserWithOptions(useSamples bool, samplesDir string) *Parser {
	name := "binance"
	if samplesDir == "" {
		samplesDir = fmt.Sprintf("samples/%s", name)
	}
	return &Parser{
		HTTPParser: parser.HTTPParser{
			Name:       name,
			Client:     &http.Client{},
			UseSamples: useSamples,
			SamplesDir: samplesDir,
			DocParser:  &DocumentParser{},
		},
	}
}

// TODO: Implement CheckVersion for Binance
func (p *Parser) CheckVersion(ctx context.Context, doc parser.Documentation) (bool, time.Time, error) {
	// If using samples, return false to indicate no change
	if p.HTTPParser.UseSamples {
		return false, time.Now(), nil
	}

	// Check if the documentation has been updated
	// For Binance, we'll make a HEAD request to check for Last-Modified header
	var lastModified time.Time
	hasChanged := false

	for _, group := range doc.URLGroups {
		for _, urlItem := range group.URLs {
			url := urlItem.URL()
			req, err := http.NewRequestWithContext(ctx, "HEAD", url, nil)
			if err != nil {
				return false, time.Time{}, fmt.Errorf("creating HEAD request: %w", err)
			}

			resp, err := p.HTTPParser.Client.Do(req)
			if err != nil {
				return false, time.Time{}, fmt.Errorf("making HEAD request: %w", err)
			}
			defer resp.Body.Close()

			// Extract Last-Modified header
			lastModifiedHeader := resp.Header.Get("Last-Modified")
			if lastModifiedHeader != "" {
				lastModifiedTime, err := time.Parse(http.TimeFormat, lastModifiedHeader)
				if err != nil {
					return false, time.Time{}, fmt.Errorf("parsing Last-Modified header: %w", err)
				}
				if lastModifiedTime.After(lastModified) {
					lastModified = lastModifiedTime
					hasChanged = true
				}
			}
		}
	}

	return hasChanged, lastModified, nil
}
