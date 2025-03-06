package binance

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/adshao/openxapi/internal/parser"
)

// Parser implements the parser.Parser interface for Binance
type Parser struct {
	client *http.Client
}

// NewParser creates a new Binance parser
func NewParser() *Parser {
	return &Parser{
		client: &http.Client{},
	}
}

// Parse processes the API documentation and returns the extracted endpoints
func (p *Parser) Parse(ctx context.Context, doc parser.Documentation) ([]parser.Endpoint, error) {
	var endpoints []parser.Endpoint

	for _, url := range doc.URLs {
		// Make HTTP request to get the documentation
		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			return nil, fmt.Errorf("creating request: %w", err)
		}

		resp, err := p.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("fetching documentation: %w", err)
			}
		defer resp.Body.Close()

		// Parse HTML document
		document, err := goquery.NewDocumentFromReader(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("parsing HTML: %w", err)
			}

		// Extract the page title to determine the API category
		pageTitle := document.Find("title").First().Text()
		category := extractCategory(pageTitle)

		// Find all API endpoint sections
		// Each endpoint typically starts with an h3 header followed by code blocks
		document.Find("h3.anchor").Each(func(i int, header *goquery.Selection) {
			// Skip headers that are not endpoints (like "Terminology")
			headerText := header.Text()
			if isNonEndpointHeader(headerText) {
				return
			}

			// The section contains the header and all elements until the next h3
			section := header.Parent()
			
			// Extract endpoint information
			endpoint := p.parseEndpoint(section, category, headerText)
			if endpoint != nil {
				endpoints = append(endpoints, *endpoint)
			}
		})
	}

	return endpoints, nil
}

// CheckVersion implements the parser.Parser interface
func (p *Parser) CheckVersion(ctx context.Context, doc parser.Documentation) (bool, time.Time, error) {
	// Check if the documentation has been updated
	// For Binance, we'll make a HEAD request to check for Last-Modified header
	var lastModified time.Time
	hasChanged := false

	for _, url := range doc.URLs {
		req, err := http.NewRequestWithContext(ctx, "HEAD", url, nil)
		if err != nil {
			return false, time.Time{}, fmt.Errorf("creating HEAD request: %w", err)
		}

		resp, err := p.client.Do(req)
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

	return hasChanged, lastModified, nil
}

// isNonEndpointHeader returns true if the header is not an API endpoint
func isNonEndpointHeader(text string) bool {
	nonEndpointHeaders := []string{
		"Terminology",
		"Examples of Symbol Permissions",
	}
	
	for _, h := range nonEndpointHeaders {
		if strings.Contains(text, h) {
			return true
		}
	}
	return false
}

// extractCategory extracts the API category from the page title
func extractCategory(title string) string {
	parts := strings.Split(title, "|")
	if len(parts) > 0 {
		return strings.TrimSpace(parts[0])
	}
	return "General"
}

// parseEndpoint extracts endpoint information from a documentation section
func (p *Parser) parseEndpoint(s *goquery.Selection, category string, summary string) *parser.Endpoint {
	// Find the HTTP method and path
	codeBlock := s.Find(".theme-code-block .prism-code").First()
	if codeBlock.Length() == 0 {
		return nil
	}

	methodPath := strings.TrimSpace(codeBlock.Text())
	parts := strings.Split(methodPath, " ")
	if len(parts) != 2 {
		return nil
	}

	method := parts[0]
	path := parts[1]

	// Extract description - first paragraph after the code block
	description := ""
	s.Find("p").Each(func(i int, p *goquery.Selection) {
		if i == 0 {
			description = strings.TrimSpace(p.Text())
		}
	})

	// Extract weight information
	weight := "1" // Default weight
	s.Find("p").Each(func(i int, p *goquery.Selection) {
		if strings.Contains(p.Text(), "Weight:") {
			weightStr := strings.TrimSpace(strings.TrimPrefix(p.Text(), "Weight:"))
			weight = weightStr
		}
	})

	// Extract data source information
	dataSource := ""
	s.Find("p").Each(func(i int, p *goquery.Selection) {
		if strings.Contains(p.Text(), "Data Source:") {
			dataSource = strings.TrimSpace(strings.TrimPrefix(p.Text(), "Data Source:"))
		}
	})

	// Extract parameters
	var parameters []parser.Parameter
	s.Find("table tbody tr").Each(func(i int, row *goquery.Selection) {
		cells := row.Find("td")
		if cells.Length() >= 4 {
			paramName := strings.TrimSpace(cells.Eq(0).Text())
			paramType := strings.TrimSpace(cells.Eq(1).Text())
			mandatory := strings.Contains(strings.ToLower(cells.Eq(2).Text()), "yes")
			paramDesc := strings.TrimSpace(cells.Eq(3).Text())
			
			param := parser.Parameter{
				Name:        paramName,
				In:          "query", // Default to query, can be updated based on path parameters
				Required:    mandatory,
				Description: paramDesc,
				Schema: parser.Schema{
					Type: normalizeType(paramType),
				},
			}

			// Check if parameter is in path
			if strings.Contains(path, fmt.Sprintf("{%s}", param.Name)) {
				param.In = "path"
			}

			parameters = append(parameters, param)
		}
	})

	// Extract response schema
	responses := make(map[string]parser.Response)
	responseBlock := s.Find(".language-javascript").First()
	if responseBlock.Length() > 0 {
		responseExample := strings.TrimSpace(responseBlock.Text())
		responses["200"] = parser.Response{
			Description: "Successful response",
			Content: map[string]parser.MediaType{
				"application/json": {
					Schema: parser.Schema{
						Type:    "object",
						Example: responseExample,
					},
				},
			},
		}
	}

	// Add metadata as extensions
	extensions := make(map[string]interface{})
	if weight != "" {
		extensions["x-weight"] = weight
	}
	if dataSource != "" {
		extensions["x-data-source"] = dataSource
	}

	// Construct tag list
	tags := []string{"Binance", category}
	// Add additional tag based on path pattern
	if strings.Contains(path, "/api/v3/") {
		tags = append(tags, "REST API v3")
	}

	return &parser.Endpoint{
		Path:        path,
		Method:      method,
		Summary:     summary,
		Description: description,
		Parameters:  parameters,
		Responses:   responses,
		Tags:        tags,
		Extensions:  extensions,
	}
}

// normalizeType converts Binance types to OpenAPI types
func normalizeType(binanceType string) string {
	switch strings.ToUpper(binanceType) {
	case "INT", "LONG", "INTEGER":
		return "integer"
	case "FLOAT", "DECIMAL", "DOUBLE":
		return "number"
	case "STRING", "ENUM":
		return "string"
	case "BOOLEAN", "BOOL":
		return "boolean"
	case "ARRAY", "ARRAY OF STRING":
		return "array"
	default:
		return "string"
	}
}
