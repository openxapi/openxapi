package binance

import (
	"context"
	"fmt"
	"io"
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

		// Parse the document and extract endpoints
		docEndpoints, err := p.parseDocument(resp.Body, url)
		if err != nil {
			return nil, err
		}

		endpoints = append(endpoints, docEndpoints...)
	}

	return endpoints, nil
}

// parseDocument parses an HTML document and extracts API endpoints
func (p *Parser) parseDocument(r io.Reader, sourceURL string) ([]parser.Endpoint, error) {
	// Parse HTML document
	document, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML: %w", err)
	}

	// Extract the page title to determine the API category
	pageTitle := document.Find("title").First().Text()
	category := extractCategory(pageTitle)

	var endpoints []parser.Endpoint

	// Find all API endpoint sections
	// In the Binance docs, each endpoint is under an h3 with class "anchor"
	document.Find("h3.anchor").Each(func(i int, header *goquery.Selection) {
		// Get the header text and clean it
		headerText := cleanText(header.Text())
		
		// Skip headers that are not endpoints (like "Terminology")
		if isNonEndpointHeader(headerText) {
			return
		}

		// Get the section containing this endpoint (all content until the next h3)
		var endpointContent []string
		
		// Add the header text
		endpointContent = append(endpointContent, headerText)
		
		// Process all elements after the header until we find the next h3
		foundNextH3 := false
		header.NextAll().Each(func(i int, s *goquery.Selection) {
			// Skip if we've already found the next h3
			if foundNextH3 {
				return
			}
			
			// Stop if we reach the next h3
			if s.Is("h3") {
				foundNextH3 = true
				return
			}
			
			// Collect content from this element
			p.collectElementContent(s, &endpointContent)
		})
		
		// Extract endpoint information from the collected content
		endpoint, ok := p.extractEndpoint(endpointContent, category, sourceURL)
		if ok {
			endpoints = append(endpoints, endpoint)
		}
	})

	return endpoints, nil
}

// collectElementContent extracts content from an HTML element and adds it to the content slice
func (p *Parser) collectElementContent(s *goquery.Selection, content *[]string) {
	if s.Is(".theme-code-block") {
		codeText := s.Find(".prism-code").Text()
		if strings.Contains(codeText, "GET ") || strings.Contains(codeText, "POST ") || 
		   strings.Contains(codeText, "PUT ") || strings.Contains(codeText, "DELETE ") {
			*content = append(*content, "CODE:"+strings.TrimSpace(codeText))
		}
	}
	
	// Collect all text for description, parameters, etc.
	if s.Is("p") {
		*content = append(*content, cleanText(s.Text()))
	}
	
	// Collect parameter tables
	if s.Is("table") {
		// Store table HTML for parameter extraction
		tableHtml, _ := s.Html()
		*content = append(*content, "TABLE:"+tableHtml)
	}
	
	// Collect response examples
	if s.HasClass("language-javascript") {
		responseExample := s.Text()
		*content = append(*content, "RESPONSE:"+responseExample)
	}
}

// extractEndpoint extracts endpoint information from collected content
func (p *Parser) extractEndpoint(content []string, category, sourceURL string) (parser.Endpoint, bool) {
	// Get the endpoint summary (first item in content)
	summary := ""
	if len(content) > 0 {
		summary = content[0]
	}

	// Find the method and path
	var method, path string
	for _, item := range content {
		if strings.HasPrefix(item, "CODE:") {
			methodPath := strings.TrimPrefix(item, "CODE:")
			parts := strings.SplitN(methodPath, " ", 2)
			if len(parts) == 2 {
				method = parts[0]
				path = parts[1]
				break
			}
		}
	}
	
	// Skip if we couldn't find a method and path
	if method == "" || path == "" {
		return parser.Endpoint{}, false
	}
	
	// Extract description - first paragraph after the code block that's not about weight or parameters
	description := ""
	for _, item := range content {
		if !strings.HasPrefix(item, "Weight:") && 
		   !strings.HasPrefix(item, "Parameters:") && 
		   !strings.HasPrefix(item, "Data Source:") &&
		   !strings.HasPrefix(item, "TABLE:") &&
		   !strings.HasPrefix(item, "RESPONSE:") &&
		   !strings.HasPrefix(item, "CODE:") &&
		   item != summary {
			description = item
			break
		}
	}
	
	// Extract weight
	weight := "1" // Default weight
	for _, item := range content {
		if strings.HasPrefix(item, "Weight:") {
			weightParts := strings.SplitN(item, "Weight:", 2)
			if len(weightParts) > 1 {
				weight = strings.TrimSpace(weightParts[1])
			}
			break
		}
	}
	
	// Extract data source
	dataSource := ""
	for _, item := range content {
		if strings.HasPrefix(item, "Data Source:") {
			dataSourceParts := strings.SplitN(item, "Data Source:", 2)
			if len(dataSourceParts) > 1 {
				dataSource = strings.TrimSpace(dataSourceParts[1])
			}
			break
		}
	}
	
	// Extract parameters from tables
	parameters := p.extractParameters(content, path)
	
	// Extract response schema
	responses := make(map[string]parser.Response)
	for _, item := range content {
		if strings.HasPrefix(item, "RESPONSE:") {
			responseExample := strings.TrimPrefix(item, "RESPONSE:")
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
			break
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
	
	endpoint := parser.Endpoint{
		Path:        path,
		Method:      method,
		Summary:     summary,
		Description: description,
		Parameters:  parameters,
		Responses:   responses,
		Tags:        tags,
		Extensions:  extensions,
	}
	
	return endpoint, true
}

// extractParameters extracts parameters from HTML tables in the content
func (p *Parser) extractParameters(content []string, path string) []parser.Parameter {
	var parameters []parser.Parameter
	
	for _, item := range content {
		if strings.HasPrefix(item, "TABLE:") {
			tableHtml := strings.TrimPrefix(item, "TABLE:")
			
			// Create a complete HTML document for parsing
			fullHtml := "<html><body>" + tableHtml + "</body></html>"
			tableDoc, err := goquery.NewDocumentFromReader(strings.NewReader(fullHtml))
			if err != nil {
				continue
			}
			
			// Check if this is a parameters table by looking at the headers
			var headers []string
			tableDoc.Find("thead tr th").Each(func(j int, th *goquery.Selection) {
				headerText := cleanText(th.Text())
				headers = append(headers, headerText)
			})
			
			isParamTable := false
			if len(headers) >= 4 {
				// Check if this looks like a parameters table
				nameIdx := -1
				typeIdx := -1
				mandatoryIdx := -1
				descIdx := -1
				
				for i, header := range headers {
					switch header {
					case "Name":
						nameIdx = i
					case "Type":
						typeIdx = i
					case "Mandatory":
						mandatoryIdx = i
					case "Description":
						descIdx = i
					}
				}
				
				// If we found all required columns, this is a parameters table
				isParamTable = nameIdx >= 0 && typeIdx >= 0 && mandatoryIdx >= 0 && descIdx >= 0
				
				if isParamTable {
					// Extract parameters from rows
					tableDoc.Find("tbody tr").Each(func(j int, row *goquery.Selection) {
						cells := row.Find("td").Map(func(k int, td *goquery.Selection) string {
							return cleanText(td.Text())
						})
						
						if len(cells) >= 4 {
							paramName := cells[nameIdx]
							paramType := cells[typeIdx]
							mandatoryText := strings.ToLower(cells[mandatoryIdx])
							mandatory := mandatoryText == "yes" || mandatoryText == "true"
							paramDesc := cells[descIdx]
							
							param := parser.Parameter{
								Name:        paramName,
								In:          "query", // Default to query, can be updated based on path parameters
								Required:    mandatory,
								Description: paramDesc,
								Schema:      p.createSchema(paramType),
							}
							
							// Check if parameter is in path
							if strings.Contains(path, fmt.Sprintf("{%s}", param.Name)) {
								param.In = "path"
							}
							
							parameters = append(parameters, param)
						}
					})
				}
			}
		}
	}
	
	return parameters
}

// createSchema creates a schema based on the parameter type
func (p *Parser) createSchema(paramType string) parser.Schema {
	schema := parser.Schema{
		Type: normalizeType(paramType),
	}
	
	// If the type is array, add an items field
	if schema.Type == "array" {
		// Default to string items for arrays
		schema.Items = &parser.Schema{
			Type: "string",
		}
	}
	
	return schema
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

// cleanText removes invisible Unicode characters and trims whitespace
func cleanText(text string) string {
	// Remove zero-width spaces and other invisible characters
	text = strings.Map(func(r rune) rune {
		if r == '\u200b' || r == '\u200c' || r == '\u200d' || r == '\ufeff' {
			return -1 // Drop the character
		}
		return r
	}, text)
	
	return strings.TrimSpace(text)
}
