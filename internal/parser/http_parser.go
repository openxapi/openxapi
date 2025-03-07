package parser

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// HTTPDocumentParser defines the interface for HTTP document parsers
type HTTPDocumentParser interface {
	Parse(io.Reader, string, string) ([]Endpoint, error)
}

// HTTPParser is an implementation of the Parser interface for HTTP-based APIs
type HTTPParser struct {
	Name   string
	Client *http.Client
	// Add a flag to control whether to use saved samples
	UseSamples bool
	// Add a directory path for samples
	SamplesDir string
	DocParser  HTTPDocumentParser
}

// Parse processes the API documentation and returns the extracted endpoints
func (p *HTTPParser) Parse(ctx context.Context, doc Documentation) ([]Endpoint, error) {
	var endpoints []Endpoint

	for _, url := range doc.URLs {
		var r io.Reader
		var err error

		// Generate a filename for the sample based on the URL
		filename := p.generateSampleFilename(url)
		samplePath := filepath.Join(p.SamplesDir, filename)

		// Check if we should use samples and if the sample file exists
		if p.UseSamples {
			// Try to read from the sample file
			r, err = p.readSampleFile(samplePath)
			if err != nil {
				return nil, fmt.Errorf("reading sample file: %w", err)
			}
		} else {
			// Make HTTP request to get the documentation
			req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
			if err != nil {
				return nil, fmt.Errorf("creating request: %w", err)
			}

			resp, err := p.Client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("fetching documentation: %w", err)
			}
			defer resp.Body.Close()

			// Save the response body to a sample file
			r, err = p.saveResponseToSample(resp.Body, samplePath)
			if err != nil {
				return nil, fmt.Errorf("saving response to sample: %w", err)
			}
		}

		// Parse the document and extract endpoints
		docEndpoints, err := p.DocParser.Parse(r, doc.Type, url)
		if err != nil {
			return nil, err
		}

		endpoints = append(endpoints, docEndpoints...)
	}

	return endpoints, nil
}

// generateSampleFilename creates a filename for a sample based on the URL
func (p *HTTPParser) generateSampleFilename(url string) string {
	// Extract the last part of the URL path
	parts := strings.Split(url, "/")
	lastPart := parts[len(parts)-1]

	// If the URL ends with a slash, use the second-to-last part
	if lastPart == "" && len(parts) > 1 {
		lastPart = parts[len(parts)-2]
	}

	// If there's a query string, remove it
	lastPart = strings.Split(lastPart, "?")[0]

	// If the last part is empty or doesn't have an extension, use a default name
	if lastPart == "" || !strings.Contains(lastPart, ".") {
		// Create a sanitized version of the URL for the filename
		sanitized := strings.ReplaceAll(url, "://", "_")
		sanitized = strings.ReplaceAll(sanitized, "/", "_")
		sanitized = strings.ReplaceAll(sanitized, "?", "_")
		sanitized = strings.ReplaceAll(sanitized, "&", "_")
		sanitized = strings.ReplaceAll(sanitized, "=", "_")
		return sanitized + ".html"
	}

	return lastPart
}

// readSampleFile reads a sample file and returns an io.Reader
func (p *HTTPParser) readSampleFile(path string) (io.Reader, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening sample file: %w", err)
	}
	return file, nil
}

// saveResponseToSample saves the response body to a sample file and returns a new reader
func (p *HTTPParser) saveResponseToSample(body io.Reader, path string) (io.Reader, error) {
	// Create the directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, fmt.Errorf("creating sample directory: %w", err)
	}

	// Read the entire response body
	content, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("reading response body: %w", err)
	}

	// Write the content to the sample file
	if err := os.WriteFile(path, content, 0644); err != nil {
		return nil, fmt.Errorf("writing sample file: %w", err)
	}

	// Return a new reader for the content
	return strings.NewReader(string(content)), nil
}
