package binance

import (
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/openxapi/openxapi/internal/config"
	"github.com/openxapi/openxapi/internal/parser/websocket"
	"github.com/sirupsen/logrus"
)

// DocumentParser implements the HTTPDocumentParser interface for Binance WebSocket API
type DocumentParser struct{}

// Parse parses the Binance WebSocket API documentation and extracts method information
func (p *DocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedMethods []string) ([]parser.Channel, error) {
	doc, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML document: %w", err)
	}

	var channels []parser.Channel
	category := toCategory(urlEntity)

	parseMethod := func(headerElement string) func(i int, header *goquery.Selection) {
		return func(i int, header *goquery.Selection) {
			// Get the header text and clean it
			headerText := cleanText(header.Text())

			// Skip headers that are not methods (similar to REST implementation)
			if isNonMethodHeader(headerText) {
				return
			}

			// Collect all content elements after the header until we find the next h3/h4
			var content []string
			content = append(content, headerText)

			// Find all elements between this header and the next header
			var nextElements []*goquery.Selection
			nextHeader := header.NextAll().Filter(headerElement).First()
			if nextHeader.Length() > 0 {
				header.NextUntil(headerElement).Each(func(j int, el *goquery.Selection) {
					nextElements = append(nextElements, el)
				})
			} else {
				header.NextAll().Each(func(j int, el *goquery.Selection) {
					nextElements = append(nextElements, el)
				})
			}

			// Process each element to extract content
			for _, el := range nextElements {
				p.collectElementContent(el, &content)
			}

			// Process the collected content to extract method information
			channelData, valid := p.extractMethod(content, category)

			// If the operation ID is set, override the method name
			if urlEntity.OperationID != "" {
				channelData.Name = urlEntity.OperationID
			}

			// Only add valid methods
			if valid && channelData.Name != "" {
				logrus.Debugf("method: %s", channelData.Name)
				p.processMethod(channelData, protectedMethods)
				channels = append(channels, *channelData)
			}
		}
	}

	// Find all API method sections using anchor classes (similar to REST implementation)
	doc.Find("h3.anchor").Each(parseMethod("h3"))
	doc.Find("h4.anchor").Each(parseMethod("h4"))

	logrus.Infof("Extracted %d WebSocket API methods from Binance documentation", len(channels))
	return channels, nil
}

// toCategory converts URL entity to category (borrowed from REST implementation)
func toCategory(urlEntity *config.URLEntity) string {
	items := strings.Split(urlEntity.GroupName, " ")
	for i, item := range items {
		items[i] = strings.Title(item)
	}
	return strings.Join(items, " ")
}

// isNonMethodHeader returns true if the header is not an API method (similar to REST implementation)
func isNonMethodHeader(text string) bool {
	nonMethodHeaders := []string{
		"Terminology",
		"Examples",
		"Table of Contents",
		"On this page",
		"Navigation",
	}

	for _, h := range nonMethodHeaders {
		if strings.Contains(text, h) {
			return true
		}
	}
	return false
}

// cleanText removes invisible Unicode characters and trims whitespace (borrowed from REST implementation)
func cleanText(text string) string {
	text = strings.Map(func(r rune) rune {
		if r == '\u200b' || r == '\u200c' || r == '\u200d' || r == '\ufeff' {
			return -1
		}
		return r
	}, text)
	return strings.TrimSpace(text)
}

// collectElementContent extracts content from HTML elements (adapted from REST implementation)
func (p *DocumentParser) collectElementContent(s *goquery.Selection, content *[]string) {
	// Extract response examples from code blocks (REST implementation approach - try this first)
	if s.HasClass("language-javascript") || s.HasClass("language-json") {
		var lines []string
		code := s.Find("code")
		// for each child of code, get the text
		code.Children().Each(func(i int, child *goquery.Selection) {
			text := cleanResponseLine(child.Text())
			if text != "" {
				lines = append(lines, text)
			}
		})
		responseText := strings.Join(lines, " ")
		if responseText != "" {
			// Check if this follows a "Response:" paragraph
			isResponse := p.isResponseCodeBlock(s)

			if isResponse {
				*content = append(*content, "JSON:"+responseText)
			} else {
				*content = append(*content, "CODE:"+responseText)
			}
			return // Exit early to avoid double processing
		}
	}

	// Extract WebSocket method from code blocks (fallback approach)
	if s.Is(".theme-code-block") {
		var codeText string
		code := s.Find(".prism-code")

		// First try to get the complete text directly
		fullText := code.Text()
		if fullText != "" {
			// Clean the full text
			codeText = cleanResponseLine(fullText)
		}

		// If that didn't work or result is too short, try child element approach
		if codeText == "" || len(codeText) < 50 {
			var lines []string
			// Process each child element to clean comments, similar to language-javascript path
			code.Children().Each(func(i int, child *goquery.Selection) {
				text := cleanResponseLine(child.Text())
				if text != "" {
					lines = append(lines, text)
				}
			})
			if len(lines) > 0 {
				codeText = strings.Join(lines, " ")
			}
		}

		codeText = strings.TrimSpace(codeText)

		if codeText != "" {
			// Check if this code block follows a "Response:" paragraph
			isResponse := p.isResponseCodeBlock(s)

			if isResponse {
				*content = append(*content, "JSON:"+codeText)
			} else {
				*content = append(*content, "CODE:"+codeText)
			}
		}
	}

	// Extract text from paragraphs
	if s.Is("p") {
		text := cleanText(s.Text())
		if text != "" {
			*content = append(*content, text)
		}
	}

	// Look for parameter tables after "Parameters:" paragraph
	if s.Is("p") && strings.Contains(strings.ToLower(s.Text()), "parameters:") {
		var foundTable bool
		s.NextUntil("p").Each(func(i int, el *goquery.Selection) {
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
		s.Children().Each(func(i int, li *goquery.Selection) {
			text := cleanText(li.Text())
			if text != "" {
				*content = append(*content, "- "+text)
			}
		})
	}
}

// isResponseCodeBlock checks if a code block follows a "Response:" paragraph
func (p *DocumentParser) isResponseCodeBlock(s *goquery.Selection) bool {
	// Look for "Response:" in the immediately preceding elements
	prev := s.Prev()
	for prev.Length() > 0 {
		if prev.Is("p") {
			prevText := strings.ToLower(cleanText(prev.Text()))
			if strings.HasPrefix(prevText, "response:") {
				return true
			}
		} else if prev.Is("h1, h2, h3, h4, h5, h6") {
			// If we hit a header before finding Response:, this is likely a request
			break
		}
		prev = prev.Prev()
	}
	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// cleanResponseLine cleans response JSON lines (borrowed from REST implementation)
func cleanResponseLine(text string) string {
	commentRegex := regexp.MustCompile(`(\s+|,)(//|#).*`)
	commentRegex2 := regexp.MustCompile(`//\s+.*`)
	text = cleanText(text)
	text = commentRegex.ReplaceAllString(text, "$1")
	text = commentRegex2.ReplaceAllString(text, "")
	text = strings.ReplaceAll(text, "\t", "")
	text = strings.ReplaceAll(text, "\u00a0", "")
	text = strings.ReplaceAll(text, "\\", "")
	if strings.HasPrefix(strings.TrimSpace(text), "//") {
		return ""
	}
	return text
}

// extractMethod processes the content following a method header to extract method information
func (p *DocumentParser) extractMethod(content []string, category string) (*parser.Channel, bool) {
	channel := &parser.Channel{
		Tags:     []string{category},
		Messages: make(map[string]*parser.Message),
		Metadata: make(map[string]interface{}),
	}

	foundMethod, requestSchema, responseSchema := p.extractContent(channel, content)
	if !foundMethod {
		return nil, false
	}

	if err := p.extractParameters(channel, content); err != nil {
		logrus.Debugf("extractParameters error: %s", err)
	}

	// Merge body parameters into request schema
	requestSchema = p.mergeBodyParametersIntoRequestSchema(channel, requestSchema)

	// Add request and response messages
	if requestSchema != nil {
		channel.Messages["send"] = &parser.Message{
			Title:       fmt.Sprintf("%s Request", channel.Summary),
			Description: fmt.Sprintf("Send a %s request", channel.Name),
			Payload:     requestSchema,
		}
	}

	if responseSchema != nil {
		channel.Messages["receive"] = &parser.Message{
			Title:       fmt.Sprintf("%s Response", channel.Summary),
			Description: fmt.Sprintf("Receive response from %s", channel.Name),
			Payload:     responseSchema,
		}
	}

	return channel, foundMethod
}

// mergeBodyParametersIntoRequestSchema merges body parameters into the request schema's params property
func (p *DocumentParser) mergeBodyParametersIntoRequestSchema(channel *parser.Channel, requestSchema *parser.Schema) *parser.Schema {
	// Collect all body parameters
	var bodyParams []*parser.Parameter
	for _, param := range channel.Parameters {
		if param.Location == "body" {
			bodyParams = append(bodyParams, param)
		}
	}

	// If no body parameters, return original schema
	if len(bodyParams) == 0 {
		return requestSchema
	}

	// If no request schema exists, create a basic one
	if requestSchema == nil {
		requestSchema = &parser.Schema{
			Type:        "object",
			Description: "request schema",
			Properties:  make(map[string]*parser.Schema),
		}
	}

	// Ensure the request schema has properties
	if requestSchema.Properties == nil {
		requestSchema.Properties = make(map[string]*parser.Schema)
	}

	// Create or get the params property
	paramsSchema := &parser.Schema{
		Type:        "object",
		Description: "params property",
		Properties:  make(map[string]*parser.Schema),
	}
	requestSchema.Properties["params"] = paramsSchema

	// Ensure params has properties
	if paramsSchema.Properties == nil {
		paramsSchema.Properties = make(map[string]*parser.Schema)
	}

	// Add each body parameter to the params object
	for _, param := range bodyParams {
		if param.Schema != nil {
			// Create a deep copy of the parameter schema
			paramSchema := &parser.Schema{
				Type:        param.Schema.Type,
				Required:    param.Schema.Required,
				Description: param.Description,
				Example:     param.Schema.Example,
				Enum:        param.Schema.Enum,
			}
			
			// Handle array types - copy Items field
			if param.Schema.Type == "array" && param.Schema.Items != nil {
				paramSchema.Items = &parser.Schema{
					Type:        param.Schema.Items.Type,
					Description: param.Schema.Items.Description,
					Example:     param.Schema.Items.Example,
					Enum:        param.Schema.Items.Enum,
				}
			}
			
			paramsSchema.Properties[param.Name] = paramSchema
		}
	}

	return requestSchema
}

// extractContent extracts method information from content lines
func (p *DocumentParser) extractContent(channel *parser.Channel, content []string) (bool, *parser.Schema, *parser.Schema) {
	// Set the summary from the first content item if available
	if len(content) > 0 {
		channel.Summary = content[0]
	}

	var description strings.Builder
	var foundMethod, foundWeight, foundDataSource bool
	var requestSchema, responseSchema *parser.Schema

	// Regular expressions to identify different sections
	weightRegex := regexp.MustCompile(`^Weight:?\s*(\d+|[a-zA-Z].*)?$`)
	dataSourceRegex := regexp.MustCompile(`^Data Source:?\s*(.+)$`)

	// Process each line of content
	for i, line := range content {
		if i == 0 {
			continue // Skip summary
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Extract JSON from code blocks
		if strings.HasPrefix(line, "CODE:") {
			jsonCode := strings.TrimPrefix(line, "CODE:")
			methodName := p.extractMethodNameFromJSON(jsonCode)
			if methodName != "" && channel.Name == "" {
				channel.Name = methodName
				foundMethod = true
			}
			if requestSchema == nil {
				requestSchema = p.parseJSONSchema(jsonCode, "request")
			}
		}

		// Extract JSON examples
		if strings.HasPrefix(line, "JSON:") {
			jsonCode := strings.TrimPrefix(line, "JSON:")
			if responseSchema == nil {
				responseSchema = p.parseJSONSchema(jsonCode, "response")
			}
		}

		// Check for weight information
		if !foundWeight {
			matches := weightRegex.FindStringSubmatch(line)
			if len(matches) == 2 {
				if weightInt, err := strconv.Atoi(matches[1]); err == nil {
					channel.Metadata["weight"] = weightInt
					foundWeight = true
				}
				continue
			}
		}

		// Check for data source
		if !foundDataSource {
			matches := dataSourceRegex.FindStringSubmatch(line)
			if len(matches) == 2 {
				channel.Metadata["dataSource"] = matches[1]
				foundDataSource = true
				continue
			}
		}

		// Collect description
		if !foundWeight && !foundDataSource && !strings.HasPrefix(line, "TABLE:") &&
			!strings.HasPrefix(line, "CODE:") && !strings.HasPrefix(line, "JSON:") &&
			!strings.HasPrefix(strings.ToLower(line), "parameters:") {
			description.WriteString(line)
			description.WriteString("\n")
		}
	}

	// Set the description
	channel.Description = strings.TrimSpace(description.String())

	// Generate method name if not found
	if channel.Name == "" && channel.Summary != "" {
		channel.Name = p.generateMethodName(channel.Summary)
		foundMethod = true
	}

	return foundMethod, requestSchema, responseSchema
}

// Helper function to get map keys
func getMapKeys(m map[string]*parser.Schema) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// extractMethodNameFromJSON extracts method name from JSON content
func (p *DocumentParser) extractMethodNameFromJSON(jsonCode string) string {
	var requestJSON map[string]interface{}
	if err := json.Unmarshal([]byte(jsonCode), &requestJSON); err != nil {
		return ""
	}

	if method, ok := requestJSON["method"].(string); ok {
		return method
	}

	return ""
}

// generateMethodName generates a method name from the summary
func (p *DocumentParser) generateMethodName(summary string) string {
	name := strings.ToLower(summary)
	name = strings.ReplaceAll(name, " ", "_")
	name = strings.ReplaceAll(name, "-", "_")
	name = regexp.MustCompile(`[^a-z0-9_]`).ReplaceAllString(name, "")
	return name
}

// extractParameters extracts parameters from content
func (p *DocumentParser) extractParameters(channel *parser.Channel, content []string) error {
	for _, line := range content {
		if strings.HasPrefix(line, "TABLE:") {
			tableContent := strings.TrimPrefix(line, "TABLE:")
			return p.parseParameterTable(channel, tableContent)
		}
	}
	return nil
}

// parseParameterTable parses parameter information from HTML table
func (p *DocumentParser) parseParameterTable(channel *parser.Channel, tableContent string) error {
	logrus.Debugf("parseParameterTable: %s", tableContent)
	doc, err := goquery.NewDocumentFromReader(strings.NewReader("<table>" + tableContent + "</table>"))
	if err != nil {
		return fmt.Errorf("creating document from reader: %w", err)
	}

	doc.Find("tr").Each(func(i int, row *goquery.Selection) {
		if i == 0 { // Skip header row
			return
		}

		cells := row.Find("td")
		if cells.Length() < 3 {
			return
		}

		name := cleanText(cells.Eq(0).Text())
		paramType := cleanText(cells.Eq(1).Text())
		mandatory := cleanText(cells.Eq(2).Text())
		description := ""

		if cells.Length() > 3 {
			description = cleanText(cells.Eq(3).Text())
		}

		if name == "" || name == "Name" {
			return
		}

		param := &parser.Parameter{
			Name:        name,
			Description: description,
			Location:    "body",
			Required:    p.isMandatoryParameter(mandatory),
			Schema:      p.convertTypeToJSONSchema(paramType, description),
		}

		channel.Parameters = append(channel.Parameters, param)
	})

	return nil
}

// isMandatoryParameter determines if a parameter is mandatory based on the mandatory field value
func (p *DocumentParser) isMandatoryParameter(mandatory string) bool {
	mandatory = strings.TrimSpace(strings.ToLower(mandatory))

	// Check for explicit "yes" or "true" indicators
	if mandatory == "yes" || mandatory == "true" || mandatory == "1" || mandatory == "required" {
		return true
	}

	// Check for explicit "no" or "false" indicators
	if mandatory == "no" || mandatory == "false" || mandatory == "0" || mandatory == "optional" || mandatory == "" {
		return false
	}

	// For any other value, check if it contains positive indicators
	if strings.Contains(mandatory, "yes") || strings.Contains(mandatory, "required") || strings.Contains(mandatory, "true") {
		return true
	}

	// Default to false for ambiguous cases
	return false
}

// convertTypeToJSONSchema converts parameter type to JSON Schema type
func (p *DocumentParser) convertTypeToJSONSchema(paramType, description string) *parser.Schema {
	paramType = strings.ToLower(paramType)

	switch {
	case strings.Contains(paramType, "array"):
		// Handle array types
		schema := &parser.Schema{
			Type:        "array",
			Description: description,
		}
		
		// Determine the item type
		if strings.Contains(paramType, "string") {
			schema.Items = &parser.Schema{
				Type:        "string",
				Description: "array item",
			}
		} else if strings.Contains(paramType, "number") || strings.Contains(paramType, "integer") || strings.Contains(paramType, "int") {
			schema.Items = &parser.Schema{
				Type:        "integer",
				Description: "array item",
			}
		} else if strings.Contains(paramType, "boolean") {
			schema.Items = &parser.Schema{
				Type:        "boolean",
				Description: "array item",
			}
		} else {
			// Default to string for unknown array item types
			schema.Items = &parser.Schema{
				Type:        "string",
				Description: "array item",
			}
		}
		
		return schema
	case strings.Contains(paramType, "string"):
		return &parser.Schema{
			Type:        "string",
			Description: description,
		}
	case strings.Contains(paramType, "boolean"):
		return &parser.Schema{
			Type:        "boolean",
			Description: description,
		}
	case strings.Contains(paramType, "number") || strings.Contains(paramType, "integer") || strings.Contains(paramType, "int"):
		return &parser.Schema{
			Type:        "integer",
			Description: description,
		}
	case strings.Contains(paramType, "enum"):
		return &parser.Schema{
			Type:        "string",
			Description: description,
		}
	default:
		return &parser.Schema{
			Type:        "string",
			Description: description,
		}
	}
}

// parseJSONSchema parses JSON code and creates a schema
func (p *DocumentParser) parseJSONSchema(jsonCode, schemaType string) *parser.Schema {
	var data interface{}

	if err := json.Unmarshal([]byte(jsonCode), &data); err != nil {
		return &parser.Schema{
			Type:        "object",
			Description: fmt.Sprintf("JSON %s data", schemaType),
		}
	}

	return p.convertToSchema(data, fmt.Sprintf("%s schema", schemaType))
}

// cleanJSONResponse cleans JSON response by removing comments and invalid syntax
func (p *DocumentParser) cleanJSONResponse(jsonStr string) string {
	// Since we now clean at the source level, this function is simplified
	return strings.TrimSpace(jsonStr)
}

// convertToSchema recursively converts parsed JSON to Schema
func (p *DocumentParser) convertToSchema(data interface{}, description string) *parser.Schema {
	switch v := data.(type) {
	case map[string]interface{}:
		schema := &parser.Schema{
			Type:        "object",
			Description: description,
			Properties:  make(map[string]*parser.Schema),
		}

		for key, value := range v {
			schema.Properties[key] = p.convertToSchema(value, fmt.Sprintf("%s property", key))

			// Special handling for method field - if it has a string value, make it an enum
			if key == "method" {
				if methodValue, ok := value.(string); ok && methodValue != "" {
					schema.Properties[key].Enum = []interface{}{methodValue}
				}
			}
		}

		return schema

	case []interface{}:
		itemSchema := &parser.Schema{Type: "object"}
		if len(v) > 0 {
			itemSchema = p.convertToSchema(v[0], "array item")
		}

		return &parser.Schema{
			Type:        "array",
			Description: description,
			Items:       itemSchema,
		}

	case string:
		return &parser.Schema{
			Type:        "string",
			Description: description,
			Example:     v,
		}

	case float64:
		return &parser.Schema{
			Type:        "number",
			Description: description,
			Example:     v,
		}

	case bool:
		return &parser.Schema{
			Type:        "boolean",
			Description: description,
			Example:     v,
		}

	default:
		return &parser.Schema{
			Type:        "string",
			Description: description,
		}
	}
}

// processMethod processes the method and adds authentication information
func (p *DocumentParser) processMethod(channel *parser.Channel, protectedMethods []string) {
	channel.Protected = p.isProtectedMethod(channel.Name, protectedMethods)
}

// isProtectedMethod checks if a method requires authentication
func (p *DocumentParser) isProtectedMethod(methodName string, protectedMethods []string) bool {
	methodLower := strings.ToLower(methodName)

	for _, protected := range protectedMethods {
		if strings.Contains(methodLower, strings.ToLower(protected)) {
			return true
		}
	}

	return false
}
