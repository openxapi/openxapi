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

	// Look for h3 headers that represent API methods
	doc.Find("h3").Each(func(i int, s *goquery.Selection) {
		methodTitle := strings.TrimSpace(s.Text())

		// Skip if this is not a WebSocket API method
		if !p.isWebSocketAPIMethod(methodTitle) {
			return
		}

		logrus.Debugf("Processing WebSocket API method: %s", methodTitle)

		channel := p.parseMethodFromSection(s, urlEntity, protectedMethods)
		if channel != nil {
			channels = append(channels, *channel)
		}
	})

	logrus.Infof("Extracted %d WebSocket API methods from Binance documentation", len(channels))
	return channels, nil
}

// isWebSocketAPIMethod checks if the section title represents a WebSocket API method
func (p *DocumentParser) isWebSocketAPIMethod(title string) bool {
	// Skip headers that are not API methods
	skipPatterns := []string{
		"on this page",
		"table of contents",
		"navigation",
		"breadcrumb",
	}

	lowerTitle := strings.ToLower(title)
	for _, pattern := range skipPatterns {
		if strings.Contains(lowerTitle, pattern) {
			return false
		}
	}

	// Look for typical API method patterns
	methodPatterns := []string{
		"test connectivity",
		"check server time",
		"exchange information",
		"information",
		"connectivity",
		"ping",
		"time",
		"request",
		"query",
		"get",
		"fetch",
		"retrieve",
	}

	for _, pattern := range methodPatterns {
		if strings.Contains(lowerTitle, pattern) {
			return true
		}
	}

	return false
}

// parseMethodFromSection parses API method information from a documentation section
func (p *DocumentParser) parseMethodFromSection(section *goquery.Selection, urlEntity *config.URLEntity, protectedMethods []string) *parser.Channel {
	methodTitle := strings.TrimSpace(section.Text())

	// Extract method name from the first code block following the title
	methodName := ""
	requestSchema := &parser.Schema{Type: "object"}
	responseSchema := &parser.Schema{Type: "object"}

	// Look for the first code block after the section title to get the request
	requestCodeBlock := section.NextAllFiltered("div.language-javascript").First()
	if requestCodeBlock.Length() > 0 {
		requestCode := strings.TrimSpace(requestCodeBlock.Find("code").Text())
		methodName = p.extractMethodNameFromRequest(requestCode)
		requestSchema = p.parseJSONSchema(requestCode, "request")
	}

	// Extract description
	description := ""
	section.NextAllFiltered("p").First().Each(func(i int, s *goquery.Selection) {
		text := strings.TrimSpace(s.Text())
		if text != "" && !strings.HasPrefix(strings.ToLower(text), "note:") {
			description = text
		}
	})

	// Extract weight
	weight := p.extractWeight(section)

	// Extract parameters from table
	parameters := p.extractParameters(section)

	// Extract data source
	dataSource := p.extractDataSource(section)

	// Extract response from the last code block in the section
	responseCodeBlocks := section.NextAllFiltered("div.language-javascript")
	if responseCodeBlocks.Length() > 1 {
		responseCode := strings.TrimSpace(responseCodeBlocks.Last().Find("code").Text())
		responseSchema = p.parseJSONSchema(responseCode, "response")
	}

	// Use method name from request, or derive from title
	if methodName == "" {
		methodName = p.extractMethodNameFromTitle(methodTitle)
	}

	// Create channel
	channel := &parser.Channel{
		Name:        methodName,
		Description: description,
		Summary:     methodTitle,
		Parameters:  parameters,
		Messages:    make(map[string]*parser.Message),
		Tags:        []string{urlEntity.DocType},
		Protected:   p.isProtectedMethod(methodName, protectedMethods),
		Metadata: map[string]interface{}{
			"weight":      weight,
			"dataSource":  dataSource,
			"methodTitle": methodTitle,
		},
	}

	// Add request message
	channel.Messages["send"] = &parser.Message{
		Title:       fmt.Sprintf("%s Request", methodTitle),
		Description: fmt.Sprintf("Send a %s request", methodName),
		Payload:     requestSchema,
	}

	// Add response message
	channel.Messages["receive"] = &parser.Message{
		Title:       fmt.Sprintf("%s Response", methodTitle),
		Description: fmt.Sprintf("Receive response from %s", methodName),
		Payload:     responseSchema,
	}

	return channel
}

// extractMethodNameFromRequest extracts method name from JSON request
func (p *DocumentParser) extractMethodNameFromRequest(requestCode string) string {
	var requestJSON map[string]interface{}
	if err := json.Unmarshal([]byte(requestCode), &requestJSON); err != nil {
		return ""
	}

	if method, ok := requestJSON["method"].(string); ok {
		return method
	}

	return ""
}

// extractMethodNameFromTitle derives method name from section title
func (p *DocumentParser) extractMethodNameFromTitle(title string) string {
	title = strings.ToLower(title)
	title = strings.ReplaceAll(title, " ", "_")
	title = strings.ReplaceAll(title, "-", "_")

	// Clean up common words
	cleanWords := []string{"test", "check", "get", "fetch", "query", "retrieve"}
	for _, word := range cleanWords {
		title = strings.ReplaceAll(title, word+"_", "")
		title = strings.ReplaceAll(title, "_"+word, "")
	}

	return title
}

// extractWeight extracts the weight value from the section
func (p *DocumentParser) extractWeight(section *goquery.Selection) int {
	// Look for "Weight:" pattern in following text
	current := section
	for i := 0; i < 10; i++ { // Search next 10 siblings
		current = current.Next()
		if current.Length() == 0 {
			break
		}

		text := strings.TrimSpace(current.Text())
		if strings.HasPrefix(strings.ToLower(text), "weight:") {
			// Extract number from "Weight: 20" format
			re := regexp.MustCompile(`weight:\s*(\d+)`)
			matches := re.FindStringSubmatch(strings.ToLower(text))
			if len(matches) > 1 {
				if weight, err := strconv.Atoi(matches[1]); err == nil {
					return weight
				}
			}
		}
	}

	return 1 // Default weight
}

// extractDataSource extracts the data source from the section
func (p *DocumentParser) extractDataSource(section *goquery.Selection) string {
	// Look for "Data Source:" pattern
	current := section
	for i := 0; i < 15; i++ { // Search next 15 siblings
		current = current.Next()
		if current.Length() == 0 {
			break
		}

		text := strings.TrimSpace(current.Text())
		if strings.HasPrefix(strings.ToLower(text), "data source:") {
			// Extract value after "Data Source:"
			parts := strings.SplitN(text, ":", 2)
			if len(parts) > 1 {
				return strings.TrimSpace(parts[1])
			}
		}
	}

	return "Unknown"
}

// extractParameters extracts parameters from parameter table
func (p *DocumentParser) extractParameters(section *goquery.Selection) []*parser.Parameter {
	var parameters []*parser.Parameter

	// Look for "Parameters:" text first, then find the table after it
	parametersFound := false
	current := section
	for i := 0; i < 25; i++ { // Search next 25 siblings
		current = current.Next()
		if current.Length() == 0 {
			break
		}

		text := strings.TrimSpace(current.Text())

		// Check if we found "Parameters:" section
		if strings.HasPrefix(strings.ToLower(text), "parameters:") {
			parametersFound = true
			// Check if parameters are NONE
			if strings.Contains(strings.ToUpper(text), "NONE") {
				return parameters // No parameters for this method
			}
			continue
		}

		// Only look for tables after we've found the Parameters section
		if parametersFound {
			// Check if this element contains a table
			table := current.Find("table").First()
			if table.Length() == 0 {
				table = current.Filter("table").First()
			}

			if table.Length() > 0 {
				// Found a table after Parameters section, parse it
				table.Find("tr").Each(func(i int, row *goquery.Selection) {
					if i == 0 { // Skip header row
						return
					}

					param := p.parseParameterFromTableRow(row)
					if param != nil {
						parameters = append(parameters, param)
					}
				})
				break // Stop after finding first table
			}

			// If we hit another section (like "Data Source:"), stop looking
			if strings.Contains(strings.ToLower(text), "data source:") ||
				strings.Contains(strings.ToLower(text), "response:") ||
				strings.Contains(strings.ToLower(text), "weight:") {
				break
			}
		}
	}

	return parameters
}

// parseParameterFromTableRow parses parameter information from a table row
func (p *DocumentParser) parseParameterFromTableRow(row *goquery.Selection) *parser.Parameter {
	cells := row.Find("td")
	if cells.Length() < 3 {
		return nil
	}

	name := strings.TrimSpace(cells.Eq(0).Text())
	paramType := strings.TrimSpace(cells.Eq(1).Text())
	mandatory := strings.TrimSpace(cells.Eq(2).Text())
	description := ""

	if cells.Length() > 3 {
		description = strings.TrimSpace(cells.Eq(3).Text())
	}

	if name == "" || name == "Name" { // Skip header or empty rows
		return nil
	}

	param := &parser.Parameter{
		Name:        name,
		Description: description,
		Location:    "body", // WebSocket API parameters are in JSON body
		Required:    strings.ToLower(mandatory) != "no" && mandatory != "",
		Schema: &parser.Schema{
			Type:        p.convertTypeToJSONSchema(paramType),
			Description: description,
		},
	}

	return param
}

// convertTypeToJSONSchema converts parameter type to JSON Schema type
func (p *DocumentParser) convertTypeToJSONSchema(paramType string) string {
	paramType = strings.ToLower(paramType)

	switch {
	case strings.Contains(paramType, "string"):
		return "string"
	case strings.Contains(paramType, "array"):
		return "array"
	case strings.Contains(paramType, "boolean"):
		return "boolean"
	case strings.Contains(paramType, "number") || strings.Contains(paramType, "integer") || strings.Contains(paramType, "int"):
		return "integer"
	case strings.Contains(paramType, "enum"):
		return "string"
	default:
		return "string"
	}
}

// parseJSONSchema parses JSON code and creates a basic schema
func (p *DocumentParser) parseJSONSchema(jsonCode, schemaType string) *parser.Schema {
	var data interface{}

	if err := json.Unmarshal([]byte(jsonCode), &data); err != nil {
		// If parsing fails, return a basic object schema
		return &parser.Schema{
			Type:        "object",
			Description: fmt.Sprintf("JSON %s data", schemaType),
		}
	}

	return p.convertToSchema(data, fmt.Sprintf("%s schema", schemaType))
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

// isProtectedMethod checks if a method requires authentication
func (p *DocumentParser) isProtectedMethod(methodName string, protectedMethods []string) bool {
	methodLower := strings.ToLower(methodName)

	for _, protected := range protectedMethods {
		if strings.Contains(methodLower, strings.ToLower(protected)) {
			return true
		}
	}

	// Common patterns for protected methods
	protectedPatterns := []string{
		"account",
		"order",
		"balance",
		"trade",
		"user",
		"private",
		"auth",
		"session",
	}

	for _, pattern := range protectedPatterns {
		if strings.Contains(methodLower, pattern) {
			return true
		}
	}

	return false
}
