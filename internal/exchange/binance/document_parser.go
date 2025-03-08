package binance

import (
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/adshao/openxapi/internal/parser"
)

// DocumentParser is a parser for Binance documents
type DocumentParser struct {
	parser.HTTPDocumentParser
	docType      string
	tableContent string
}

// Parse parses an HTML document and extracts API endpoints
func (p *DocumentParser) Parse(r io.Reader, docType, sourceURL string) ([]parser.Endpoint, error) {
	p.docType = docType
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

		// Initialize endpoint data
		var endpoint parser.Endpoint
		endpoint.Summary = headerText
		endpoint.Tags = []string{category}

		// Create maps for extensions and responses
		endpoint.Extensions = make(map[string]interface{})
		endpoint.Responses = make(map[string]*parser.Response)

		// Collect all content elements after the header until we find the next h3
		var content []string

		// Add the header text as the first item in content
		content = append(content, headerText)

		// Find all elements between this h3 and the next h3
		var nextElements []*goquery.Selection

		// Get the next h3 element
		nextH3 := header.NextAll().Filter("h3").First()

		if nextH3.Length() > 0 {
			// If there's a next h3, get all elements between current h3 and next h3
			header.NextUntil("h3").Each(func(j int, el *goquery.Selection) {
				nextElements = append(nextElements, el)
			})
		} else {
			// If there's no next h3, get all elements after current h3
			header.NextAll().Each(func(j int, el *goquery.Selection) {
				nextElements = append(nextElements, el)
			})
		}

		// Process each element to extract content
		for _, el := range nextElements {
			p.collectElementContent(el, &content)
		}

		// Process the collected content to extract endpoint information
		endpointData, valid := p.extractEndpoint(content, category, sourceURL)

		// Only add valid endpoints
		if valid && endpointData.Path != "" && endpointData.Method != "" {
			p.processEndpoint(endpointData)
			endpoints = append(endpoints, *endpointData)
		}
	})

	return endpoints, nil
}

// extractEndpoint processes the content following an API header to extract endpoint information
func (p *DocumentParser) extractEndpoint(content []string, category, sourceURL string) (*parser.Endpoint, bool) {
	fmt.Println("--------------------------------")
	for _, line := range content {
		fmt.Println(line)
	}
	fmt.Printf("category: %s\n", category)
	fmt.Printf("sourceURL: %s\n", sourceURL)
	fmt.Println("--------------------------------")
	var endpoint = &parser.Endpoint{}
	endpoint.Tags = []string{"Binance", category}
	endpoint.Extensions = make(map[string]interface{})
	endpoint.Responses = make(map[string]*parser.Response)

	// Set the summary from the first content item if available
	if len(content) > 0 {
		endpoint.Summary = content[0]
	}

	// Initialize variables to track what we've found
	var description strings.Builder
	var foundEndpoint, foundWeight, foundParameters, foundDataSource, foundResponse bool
	var responseContent strings.Builder

	// Regular expressions to identify different sections
	endpointRegex := regexp.MustCompile(`^(GET|POST|PUT|DELETE|PATCH) (.+)$`)
	weightRegex := regexp.MustCompile(`^Weight:?\s*(\d+)$`)
	parametersRegex := regexp.MustCompile(`^Parameters:$`)
	dataSourceRegex := regexp.MustCompile(`^Data Source:?\s*(.+)$`)
	responseRegex := regexp.MustCompile(`^Response:\s*(.*)$`)

	// Process each line of content
	for i, line := range content {
		// Skip the first line as it's the summary
		if i == 0 {
			continue
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Check for endpoint definition (e.g., "GET /api/v3/ping")
		if !foundEndpoint {
			matches := endpointRegex.FindStringSubmatch(line)
			if len(matches) == 3 {
				endpoint.Method = matches[1]
				endpoint.Path = matches[2]
				foundEndpoint = true
				continue
			}
		}

		// Check for weight information
		if !foundWeight {
			matches := weightRegex.FindStringSubmatch(line)
			if len(matches) == 2 {
				endpoint.Extensions["x-weight"] = matches[1]
				foundWeight = true
				continue
			}
		}

		// Check for parameters section
		if !foundParameters && parametersRegex.MatchString(line) {
			foundParameters = true
			continue
		}

		// Check for data source
		if !foundDataSource {
			matches := dataSourceRegex.FindStringSubmatch(line)
			if len(matches) == 2 {
				endpoint.Extensions["x-data-source"] = matches[1]
				foundDataSource = true
				continue
			}
		}

		// Check for response section with content on the same line
		if !foundResponse && line != "Response:" {
			matches := responseRegex.FindStringSubmatch(line)
			if len(matches) > 0 {
				foundResponse = true
				if len(matches) > 1 && matches[1] != "" {
					responseContent.WriteString(matches[1])
					responseContent.WriteString("\n")
				}
				continue
			}
		}

		// Collect table content for parameter extraction
		if strings.HasPrefix(line, "TABLE:") {
			p.tableContent = strings.TrimPrefix(line, "TABLE:")
			continue
		}

		// If we haven't found the endpoint yet, this is part of the description
		if !foundEndpoint {
			description.WriteString(line)
			description.WriteString("\n")
		} else if !foundParameters && !foundWeight && !foundDataSource && !foundResponse {
			// If we've found the endpoint but not other sections, this is still part of the description
			description.WriteString(line)
			description.WriteString("\n")
		}
	}

	// Set the description
	endpoint.Description = strings.TrimSpace(description.String())

	p.extractParameters(endpoint)

	fmt.Printf("Response content: %s\n", responseContent.String())

	p.extractResponse(endpoint, foundResponse, responseContent.String())

	endpoint.OperationID = operationID(p.docType, endpoint.Method, endpoint.Path)

	return endpoint, foundEndpoint
}

func operationID(docType, method, path string) string {
	// GET /api/v3/exchangeInfo -> SpotGetExchangeInfoV3
	// Spot is the capitalized version of the docType
	// ExchangeInfoV3 is the method capitalized + the path capitalized
	title := func(s string) string {
		return strings.Title(strings.ToLower(s))
	}
	pathRegex := regexp.MustCompile(`^/(api|fapi)/v(\d+)/(.+)$`)
	matches := pathRegex.FindStringSubmatch(path)
	if len(matches) == 4 {
		var action string
		items := strings.Split(matches[3], "/")
		for _, item := range items {
			action += strings.Title(item)
		}
		path = fmt.Sprintf("%sV%s", action, matches[2])
	}
	return fmt.Sprintf("%s%s%s", title(docType), methodToAction(method), path)
}

func methodToAction(method string) string {
	switch strings.ToUpper(method) {
	case "GET":
		return "Get"
	case "POST":
		return "Create"
	case "PUT", "PATCH":
		return "Update"
	case "DELETE":
		return "Delete"
	}
	return ""
}

// extractParameters extracts parameters from the endpoint description
func (p *DocumentParser) extractParameters(endpoint *parser.Endpoint) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader("<table>" + p.tableContent + "</table>"))
	if err != nil {
		return
	}

	// Process each row in the table
	doc.Find("tr").Each(func(i int, row *goquery.Selection) {
		// Skip header row
		if i == 0 {
			return
		}

		cells := row.Find("td")
		if cells.Length() < 3 {
			return
		}

		// Extract parameter information
		paramName := cleanText(cells.Eq(0).Text())
		paramType := cleanText(cells.Eq(1).Text())

		// Determine if parameter is required
		requiredText := ""
		if cells.Length() >= 3 {
			requiredText = cleanText(cells.Eq(2).Text())
		}
		required := strings.Contains(strings.ToLower(requiredText), "yes") ||
			strings.Contains(strings.ToLower(requiredText), "mandatory")

		// Extract description
		description := ""
		if cells.Length() >= 4 {
			// Replace <code></code> with `
			html, _ := cells.Eq(3).Html()
			html = strings.ReplaceAll(html, "<code>", "`")
			html = strings.ReplaceAll(html, "</code>", "`")
			description = cleanText(html)
		}

		// Create schema based on parameter type
		schema := p.createSchema(paramType)

		// Extract enum values from description if present
		if strings.Contains(description, "Supported values") ||
			strings.Contains(description, "Possible values") ||
			strings.Contains(description, "Valid values") {
			schema.Enum = extractEnumValues(description)
		}

		// Determine parameter location (in)
		paramIn := "query" // Default to query for REST APIs
		if strings.Contains(endpoint.Path, "{"+paramName+"}") {
			paramIn = "path"
		}

		// Create the parameter
		param := &parser.Parameter{
			Name:        paramName,
			Type:        normalizeType(paramType),
			Required:    required,
			Description: description,
			In:          paramIn,
			Schema:      schema,
		}

		endpoint.Parameters = append(endpoint.Parameters, param)
	})
}

func (p *DocumentParser) extractResponse(endpoint *parser.Endpoint, foundResponse bool, responseContent string) {
	// Process response content if we found it
	if foundResponse {
		// Create a default 200 OK response
		response := &parser.Response{
			Description: "Successful operation",
		}

		// Try to parse the response example as JSON schema
		if responseContent != "" {
			mediaType := &parser.MediaType{
				Schema: p.createResponseSchema(responseContent),
			}
			response.Content = map[string]*parser.MediaType{
				"application/json": mediaType,
			}
		} else {
			// If no response content, still create a default response
			mediaType := &parser.MediaType{
				Schema: &parser.Schema{
					Type: "object",
				},
			}
			response.Content = map[string]*parser.MediaType{
				"application/json": mediaType,
			}
		}

		endpoint.Responses["200"] = response
	} else {
		// Always create a default response even if none was found
		endpoint.Responses["200"] = &parser.Response{
			Description: "Successful operation",
			Content: map[string]*parser.MediaType{
				"application/json": {
					Schema: &parser.Schema{
						Type: "object",
					},
				},
			},
		}
	}
}

// createResponseSchema attempts to create a schema from response example text
func (p *DocumentParser) createResponseSchema(responseText string) *parser.Schema {
	fmt.Printf("responseText: %s\n", responseText)
	// Unmarshal the responseText into a Response struct, create a schema from the Response struct
	var response interface{}
	err := json.Unmarshal([]byte(responseText), &response)
	if err != nil {
		return &parser.Schema{
			Type: "object",
		}
	}
	// Create a schema from the Response struct
	schema := p.createSchema(reflect.TypeOf(response).String())

	// Add the example text
	schema.Example = responseText

	return schema
}

// extractEnumValues extracts valid enum values from a parameter description
func extractEnumValues(description string) []interface{} {
	var values []interface{}
	// description: Filters symbols that have this `tradingStatus`. Valid values: `TRADING`, `HALT`, `BREAK` <br/> Cannot be used in combination with `symbols` or `symbol`.
	// parsed enum values: TRADING, HALT, BREAK
	// use regex to extract the values
	regex := regexp.MustCompile(`Valid values: (.*) <br/>`)
	matches := regex.FindStringSubmatch(description)
	if len(matches) > 1 {
		var items []string
		items = strings.Split(matches[1], ", ")
		for _, item := range items {
			values = append(values, strings.Trim(strings.TrimSpace(item), "`"))
		}
	}
	return values
}

// createSchema creates a schema based on the parameter type
func (p *DocumentParser) createSchema(paramType string) *parser.Schema {
	schema := &parser.Schema{
		Type: normalizeType(paramType),
	}

	// If the type is array, add an items field
	if schema.Type == "array" {
		// For ARRAY OF STRING, set items type to string
		if strings.Contains(strings.ToUpper(paramType), "ARRAY OF STRING") {
			schema.Items = &parser.Schema{
				Type: "string",
			}
		} else if strings.Contains(strings.ToUpper(paramType), "ARRAY") {
			// Default to string items for other arrays
			schema.Items = &parser.Schema{
				Type: "string",
			}
		}
	}

	// For ENUM types, add enum values if available in the description
	if strings.ToUpper(paramType) == "ENUM" {
		// We'll handle enum values in the extractParameters function
		// by looking at the description field
	}

	return schema
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
		return "object"
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

// collectElementContent extracts content from an HTML element and adds it to the content slice
func (p *DocumentParser) collectElementContent(s *goquery.Selection, content *[]string) {
	// Extract endpoint URL from code blocks
	if s.Is(".theme-code-block") {
		codeText := s.Find(".prism-code").Text()
		codeText = strings.TrimSpace(codeText)

		// Check if it's an API endpoint definition (GET, POST, etc.)
		if strings.HasPrefix(codeText, "GET ") ||
			strings.HasPrefix(codeText, "POST ") ||
			strings.HasPrefix(codeText, "PUT ") ||
			strings.HasPrefix(codeText, "DELETE ") ||
			strings.HasPrefix(codeText, "PATCH ") {
			*content = append(*content, codeText)
		}
	}

	// Extract text from paragraphs
	if s.Is("p") {
		text := cleanText(s.Text())
		if text != "" {
			*content = append(*content, text)
		}
	}

	// Extract response examples from code blocks
	if s.HasClass("language-javascript") {
		responseText := s.Find("code").Text()
		if responseText != "" {
			*content = append(*content, "Response: "+responseText)
		}
	}

	// Look for parameter tables after "Parameters:" paragraph
	// Only look at tables that are direct siblings of the paragraph
	if s.Is("p") && strings.Contains(s.Text(), "Parameters:") {
		// Find the next table that is a direct sibling
		var foundTable bool
		s.NextUntil("h3").Each(func(i int, el *goquery.Selection) {
			if !foundTable && el.Is("table") {
				tableHtml, _ := el.Html()
				if tableHtml != "" {
					*content = append(*content, "TABLE:"+tableHtml)
					foundTable = true
				}
			}
		})
	}

	// Extract content from divs that might contain important information
	// But only process direct children to avoid processing content from other sections
	if s.Is("div.theme-doc-markdown") {
		s.Children().Each(func(i int, child *goquery.Selection) {
			p.collectElementContent(child, content)
		})
	}

	// Extract content from list items
	if s.Is("li") {
		text := cleanText(s.Text())
		if text != "" {
			*content = append(*content, "- "+text)
		}
	}

	// Extract content from unordered lists
	if s.Is("ul") {
		s.Find("li").Each(func(i int, li *goquery.Selection) {
			text := cleanText(li.Text())
			if text != "" {
				*content = append(*content, "- "+text)
			}
		})
	}
}

func (p *DocumentParser) processEndpoint(endpoint *parser.Endpoint) {
	if p.docType == "spot" {
		// Process special cases if it's hard to parse from the document
		if endpoint.Method == "GET" && endpoint.Path == "/api/v3/exchangeInfo" {
			for _, param := range endpoint.Parameters {
				if param.Name == "permissions" {
					param.Type = "array"
					param.Schema = &parser.Schema{
						Type: "array",
						Items: &parser.Schema{
							Type:    "string",
							Default: "",
						},
					}
				}
			}
		}
	}
}
