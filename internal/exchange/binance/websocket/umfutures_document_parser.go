package binance

import (
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/openxapi/openxapi/internal/config"
	"github.com/openxapi/openxapi/internal/parser/websocket"
	"github.com/sirupsen/logrus"
)

// UmfuturesDocumentParser implements the HTTPDocumentParser interface for Binance USD-M Futures WebSocket API
type UmfuturesDocumentParser struct {
	*SpotDocumentParser
}

// Parse parses the Binance USD-M Futures WebSocket API documentation and extracts method information
func (p *UmfuturesDocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedMethods []string) ([]parser.Channel, error) {
	doc, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML document: %w", err)
	}

	var channels []parser.Channel
	category := toCategory(urlEntity)
	seenMethods := make(map[string]bool) // Track already processed methods

	parseMethod := func(headerElement string) func(i int, header *goquery.Selection) {
		return func(i int, header *goquery.Selection) {
			// Get the header text and clean it
			headerText := cleanText(header.Text())

			// Skip headers that are not methods (similar to REST implementation)
			if isNonMethodHeader(headerText) {
				return
			}

			// Skip if this looks like a general description header
			if p.isGeneralDescriptionHeader(headerText) {
				return
			}

			// Collect all content elements after the header until we find the next header
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

			// Debug: log content collected for each method
			if strings.Contains(headerText, "Account Balance") {
				logrus.Debugf("Content collected for %s:", headerText)
				for idx, line := range content {
					if strings.HasPrefix(line, "JSON:") {
						logrus.Debugf("  [%d] JSON content (length %d)", idx, len(line)-5)
					} else if strings.HasPrefix(line, "CODE:") {
						logrus.Debugf("  [%d] CODE content (length %d)", idx, len(line)-5)
					} else {
						logrus.Debugf("  [%d] %s", idx, line)
					}
				}
			}

			// Process the collected content to extract method information
			channelData, valid := p.extractMethod(content, category)

			// If the operation ID is set, override the method name
			if urlEntity.OperationID != "" {
				channelData.Name = urlEntity.OperationID
			}

			// Only add valid methods that haven't been seen before
			if valid && channelData.Name != "" {
				if !seenMethods[channelData.Name] {
					seenMethods[channelData.Name] = true
					logrus.Debugf("umfutures method: %s", channelData.Name)
					// Log if we have a response
					if respMsg, hasResp := channelData.Messages["response"]; hasResp {
						logrus.Debugf("Method %s has response message: %v", channelData.Name, respMsg != nil)
					} else {
						logrus.Debugf("Method %s has NO response message", channelData.Name)
					}
					p.processMethod(channelData, protectedMethods)
					channels = append(channels, *channelData)
				} else {
					logrus.Debugf("Skipping duplicate method: %s", channelData.Name)
				}
			}
		}
	}

	// Find all API method sections using different header patterns for derivatives docs
	// For umfutures, h1 headers are the main method headers
	// h2 headers are section headers within methods (like "Response Example")
	// so we should NOT process h2 as methods
	doc.Find("h1").Each(parseMethod("h1"))
	// Also check for h3/h4 headers in case some pages use them
	doc.Find("h3.anchor").Each(parseMethod("h3"))
	doc.Find("h4.anchor").Each(parseMethod("h4"))

	logrus.Debugf("Extracted %d USD-M Futures WebSocket API methods from Binance documentation", len(channels))
	return channels, nil
}

// isGeneralDescriptionHeader checks if the header is a general description that we should skip
func (p *UmfuturesDocumentParser) isGeneralDescriptionHeader(text string) bool {
	generalHeaders := []string{
		"Introduction",
		"Overview",
		"Getting Started",
		"API Description",
		"WebSocket API",
		"General Information",
		"Rate Limits",
		"Connection Limits",
		"Error Codes",
		"General WSS information",
		"Live Subscribing/Unsubscribing to streams",
		"Request Format",
		"Response Format",
		"Authentication",
		"How to sign",
		// Removed "Response Example" - it's a valid section header within methods
		"Request Weight",
		"Request Parameters",
	}

	textLower := strings.ToLower(text)
	for _, h := range generalHeaders {
		if strings.Contains(textLower, strings.ToLower(h)) {
			return true
		}
	}
	return false
}

// convertParameterTypeToJSONSchema converts umfutures parameter type to JSON Schema type with proper precision handling
func (p *UmfuturesDocumentParser) convertParameterTypeToJSONSchema(name, paramType, description string) *parser.Schema {
	paramType = strings.ToUpper(strings.TrimSpace(paramType))

	switch paramType {
	case "DECIMAL":
		// Financial precision fields should be strings to preserve precision
		return &parser.Schema{
			Type:        "string",
			Description: description,
		}
	case "LONG":
		// Large integers like timestamps and IDs
		return &parser.Schema{
			Type:        "integer",
			Format:      "int64",
			Description: description,
		}
	case "STRING":
		return &parser.Schema{
			Type:        "string",
			Description: description,
		}
	case "ENUM":
		return &parser.Schema{
			Type:        "string",
			Description: description,
			// TODO: Could add enum values if we parse them from documentation
		}
	case "INT", "INTEGER":
		return &parser.Schema{
			Type:        "integer",
			Description: description,
		}
	case "BOOLEAN", "BOOL":
		return &parser.Schema{
			Type:        "boolean",
			Description: description,
		}
	default:
		// For array types or unknown types, fall back to parent implementation
		return p.SpotDocumentParser.convertTypeToJSONSchema(name, paramType, description)
	}
}

// cleanUmfuturesJSON cleans JSON specifically for umfutures documentation
func (p *UmfuturesDocumentParser) cleanUmfuturesJSON(text string) string {
	originalText := text

	// Log the original text for debugging
	logrus.Debugf("=== cleanUmfuturesJSON BEFORE CLEANING ===")
	logrus.Debugf("Original text length: %d", len(originalText))
	lines := strings.Split(originalText, "\n")
	for i, line := range lines {
		logrus.Debugf("  Before Line %d: %s", i+1, line)
	}

	// First clean using base cleanText function
	text = cleanText(text)

	// Replace tabs with spaces to preserve JSON structure
	text = strings.ReplaceAll(text, "\t", " ")
	text = strings.ReplaceAll(text, "\\t", " ")

	// Fix missing commas before comments - critical for umfutures JSON
	// Match patterns like: "value"  // comment  (missing comma after "value")
	missingCommaRegex := regexp.MustCompile(`(["}\]0-9a-zA-Z]|true|false)\s+(//[^\r\n]*)`)
	text = missingCommaRegex.ReplaceAllString(text, "$1, $2")

	// Also fix missing commas when comment text appears without // prefix
	// Match patterns like: "value" comment text
	missingCommaNoSlashRegex := regexp.MustCompile(`(["}\]0-9a-zA-Z]|true|false)\s+([a-zA-Z][^"]*?)(?:\s*")`)
	text = missingCommaNoSlashRegex.ReplaceAllString(text, `$1, //$2"`)

	// Remove comments while preserving JSON structure
	commentRegex := regexp.MustCompile(`\s*//[^"]*?(?:\s|$)`)
	text = commentRegex.ReplaceAllString(text, " ")

	// Fix trailing commas
	trailingCommaRegex := regexp.MustCompile(`,\s*([}\]])`)
	text = trailingCommaRegex.ReplaceAllString(text, "$1")

	cleanedText := strings.TrimSpace(text)

	// Log the cleaned text for debugging
	logrus.Debugf("=== cleanUmfuturesJSON AFTER CLEANING ===")
	logrus.Debugf("Cleaned text length: %d", len(cleanedText))
	cleanedLines := strings.Split(cleanedText, "\n")
	for i, line := range cleanedLines {
		logrus.Debugf("  After Line %d: %s", i+1, line)
	}

	return cleanedText
}

// collectElementContent extracts content from HTML elements, adapted for derivatives documentation structure
func (p *UmfuturesDocumentParser) collectElementContent(s *goquery.Selection, content *[]string) {
	// For JSON extraction, handle umfutures-specific cleaning
	if s.Is(".language-javascript") || s.Is(".theme-code-block") {
		code := s.Find("code")
		if code.Length() == 0 {
			code = s.Find(".prism-code")
		}

		if code.Length() > 0 {
			// Try smart token extraction first to properly filter out comments
			cleanedText := p.SpotDocumentParser.DocumentParser.extractJSONFromTokens(code)

			// If smart extraction fails, fallback to raw text extraction
			if cleanedText == "" {
				rawText := code.Text()
				// Apply umfutures-specific JSON cleaning
				cleanedText = p.cleanUmfuturesJSON(rawText)
			}

			if cleanedText != "" {
				// Check if this is a response
				isResponse := p.SpotDocumentParser.DocumentParser.isResponseCodeBlock(s)

				logrus.Debugf("umfutures: Checking if code block is response: %v", isResponse)

				if isResponse {
					*content = append(*content, "JSON:"+cleanedText)
					logrus.Debugf("umfutures: Extracted response JSON (length: %d)", len(cleanedText))
				} else {
					*content = append(*content, "CODE:"+cleanedText)
					logrus.Debugf("umfutures: Extracted request JSON (length: %d)", len(cleanedText))
				}
				return // Don't process this element again in base implementation
			}
		}
	}

	// For non-JSON content, use the base implementation
	// But skip if this is a code block we already tried to process
	if !s.Is(".language-javascript") && !s.Is(".theme-code-block") {
		p.SpotDocumentParser.DocumentParser.collectElementContent(s, content)
	}

	// Add additional handling for derivatives-specific patterns only

	// Handle API Description sections (common in derivatives docs)
	if s.Is("h2") && strings.Contains(s.Text(), "API Description") {
		// get the next p element
		nextP := s.Next()
		if nextP.Length() > 0 {
			*content = append(*content, "API Description: "+nextP.Text())
		}
	}

	// Handle Request Weight sections (common in derivatives docs)
	if s.Is("h2") && strings.Contains(s.Text(), "Request Weight") {
		// Extract the weight from the next line
		weight := s.Next().Text()
		weight = strings.TrimSpace(weight)
		if weight != "" {
			*content = append(*content, "Weight: "+weight)
		}
	}

	// Handle parameter tables that might be after h2 headers in derivatives docs
	if s.Is("h2") && strings.Contains(s.Text(), "Parameters") {
		// Find the next table that is a direct sibling
		var foundTable bool
		s.NextUntil("h2").Each(func(i int, el *goquery.Selection) {
			if !foundTable && el.Is("table") {
				tableHtml, _ := el.Html()
				if tableHtml != "" {
					*content = append(*content, "TABLE:"+tableHtml)
					foundTable = true
				}
			}
		})
	}
}

// extractMethod processes the content following a method header to extract method information
// Adapts the base extractMethod for derivatives-specific patterns
func (p *UmfuturesDocumentParser) extractMethod(content []string, category string) (*parser.Channel, bool) {
	channel := &parser.Channel{
		Tags:     []string{category},
		Messages: make(map[string]*parser.Message),
		Metadata: make(map[string]interface{}),
	}

	foundMethod, requestSchema, responseSchema := p.extractContent(channel, content)
	if !foundMethod {
		return nil, false
	}

	// Use umfutures-specific parameter extraction
	if err := p.extractParameters(channel, content); err != nil {
		logrus.Debugf("extractParameters error: %s", err)
	}

	// Merge body parameters into request schema
	requestSchema = p.SpotDocumentParser.mergeBodyParametersIntoRequestSchema(channel, requestSchema)

	// Add request and response messages
	if requestSchema != nil {
		sendMessage := &parser.Message{
			Title:       fmt.Sprintf("%s Request", channel.Summary),
			Description: fmt.Sprintf("Send a %s request", channel.Name),
			Payload:     requestSchema,
		}
		// Set correlation ID if the payload has an 'id' property
		if p.SpotDocumentParser.hasIdProperty(requestSchema) {
			sendMessage.CorrelationId = &parser.CorrelationId{
				Location:    "$message.payload#/id",
				Description: "Message correlation ID",
			}
		}
		channel.Messages["request"] = sendMessage
	}

	if responseSchema != nil {
		receiveMessage := &parser.Message{
			Title:       fmt.Sprintf("%s Response", channel.Summary),
			Description: fmt.Sprintf("Receive response from %s", channel.Name),
			Payload:     responseSchema,
		}
		// Set correlation ID if the payload has an 'id' property
		if p.SpotDocumentParser.hasIdProperty(responseSchema) {
			receiveMessage.CorrelationId = &parser.CorrelationId{
				Location:    "$message.payload#/id",
				Description: "Message correlation ID",
			}
		}
		channel.Messages["response"] = receiveMessage
	}

	return channel, foundMethod
}

// extractContent extracts method information from content lines, adapted for derivatives documentation
func (p *UmfuturesDocumentParser) extractContent(channel *parser.Channel, content []string) (bool, *parser.Schema, *parser.Schema) {
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
			methodName := p.SpotDocumentParser.extractMethodNameFromJSON(jsonCode)
			if methodName != "" && channel.Name == "" {
				channel.Name = methodName
				foundMethod = true
			}
			if requestSchema == nil {
				requestSchema = p.SpotDocumentParser.DocumentParser.parseJSONSchema(jsonCode, "request")
			}
		}

		// Extract JSON examples
		if strings.HasPrefix(line, "JSON:") {
			jsonCode := strings.TrimPrefix(line, "JSON:")
			// Don't apply additional cleaning here - it's already been cleaned in collectElementContent
			logrus.Debugf("Processing JSON response for channel %s, JSON length: %d", channel.Name, len(jsonCode))

			if responseSchema == nil {
				logrus.Infof("Attempting to parse response JSON for channel %s", channel.Name)
				maxLen := 500
				if len(jsonCode) < maxLen {
					maxLen = len(jsonCode)
				}
				logrus.Infof("JSON to parse (first %d chars): %s", maxLen, jsonCode[:maxLen])
				responseSchema = p.SpotDocumentParser.DocumentParser.parseJSONSchema(jsonCode, "response")
				// Check if the schema was parsed successfully by checking the description
				if responseSchema != nil && responseSchema.Type != "" && len(responseSchema.Properties) > 0 {
					logrus.Infof("Successfully parsed response schema for channel %s with %d properties", channel.Name, len(responseSchema.Properties))
				} else {
					logrus.Errorf("Failed to parse response schema for channel %s", channel.Name)
					logrus.Errorf("Failed JSON for %s: %s", channel.Name, jsonCode)
					// Log the JSON that failed to parse
					if len(jsonCode) < 1000 {
						logrus.Errorf("Failed JSON for %s: %s", channel.Name, jsonCode)
					} else {
						logrus.Errorf("Failed JSON for %s (first 1000 chars): %s", channel.Name, jsonCode[:1000])
					}
					logrus.Fatalf("Malformed JSON in API documentation prevents proper parsing. Please fix the JSON syntax in the documentation for channel %s", channel.Name)
				}
			}
		}

		// Use parent implementation for common parsing logic
		// Check for weight information
		if !foundWeight {
			matches := weightRegex.FindStringSubmatch(line)
			if len(matches) == 2 {
				channel.Metadata["weight"] = matches[1]
				foundWeight = true
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

		// Collect description (skip derivative-specific patterns)
		if !foundWeight && !foundDataSource && !strings.HasPrefix(line, "TABLE:") &&
			!strings.HasPrefix(line, "CODE:") && !strings.HasPrefix(line, "JSON:") &&
			!strings.HasPrefix(strings.ToLower(line), "parameters:") &&
			!strings.HasPrefix(line, "API Description:") {
			description.WriteString(line)
			description.WriteString("\n")
		}
	}

	// Set the description
	channel.Description = strings.TrimSpace(description.String())

	// Generate method name if not found - reuse parent method
	if channel.Name == "" && channel.Summary != "" {
		// Use parent's generateMethodName method
		channel.Name = strings.ToLower(channel.Summary)
		channel.Name = strings.ReplaceAll(channel.Name, " ", "_")
		channel.Name = strings.ReplaceAll(channel.Name, "-", "_")
		channel.Name = regexp.MustCompile(`[^a-z0-9_]`).ReplaceAllString(channel.Name, "")
		foundMethod = true
	}

	if responseSchema != nil {
		logrus.Debugf("Returning response schema for channel %s", channel.Name)
	}

	return foundMethod, requestSchema, responseSchema
}

// extractParameters extracts parameters from content - umfutures specific implementation
func (p *UmfuturesDocumentParser) extractParameters(channel *parser.Channel, content []string) error {
	for _, line := range content {
		if strings.HasPrefix(line, "TABLE:") {
			tableContent := strings.TrimPrefix(line, "TABLE:")
			return p.parseParameterTable(channel, tableContent)
		}
	}
	return nil
}

// parseParameterTable parses parameter information from HTML table - umfutures specific implementation
func (p *UmfuturesDocumentParser) parseParameterTable(channel *parser.Channel, tableContent string) error {
	logrus.Debugf("umfutures parseParameterTable: %s", tableContent)
	doc, err := goquery.NewDocumentFromReader(strings.NewReader("<table>" + tableContent + "</table>"))
	if err != nil {
		return fmt.Errorf("creating document from reader: %w", err)
	}

	var mandatoryFromRowspan string
	var isFirstDataRow bool = true
	var eitherOrGroup []string // Track parameters that are in "either/or" groups

	doc.Find("tr").Each(func(i int, row *goquery.Selection) {
		if i == 0 { // Skip header row
			return
		}

		cells := row.Find("td")
		if cells.Length() < 2 {
			return
		}

		name := cleanText(cells.Eq(0).Text())
		paramType := cleanText(cells.Eq(1).Text())

		var mandatory string
		var description string

		// Handle rowspan: if this is the first data row, it might have all columns
		// If subsequent rows have fewer columns, it means some cells are spanned from previous rows
		if isFirstDataRow && cells.Length() >= 3 {
			mandatory = cleanText(cells.Eq(2).Text())
			// Check if this cell has rowspan by looking for the rowspan attribute
			if rowspanAttr, exists := cells.Eq(2).Attr("rowspan"); exists && rowspanAttr != "" {
				mandatoryFromRowspan = mandatory
				// If there's a rowspan on mandatory column, it indicates an either/or requirement
				eitherOrGroup = append(eitherOrGroup, name)
			}
			if cells.Length() > 3 {
				description = cleanText(cells.Eq(3).Text())
			}
			isFirstDataRow = false
		} else {
			// For subsequent rows, use the rowspan value if available, otherwise try to get from current row
			if mandatoryFromRowspan != "" {
				mandatory = mandatoryFromRowspan
				// If we're still using rowspan value, this parameter is part of the either/or group
				eitherOrGroup = append(eitherOrGroup, name)
			} else if cells.Length() >= 3 {
				mandatory = cleanText(cells.Eq(2).Text())
			}

			// Description is in the last cell
			if cells.Length() > 2 {
				description = cleanText(cells.Eq(cells.Length() - 1).Text())
			}
		}

		if name == "" || name == "Name" {
			return
		}

		// Determine if parameter is required based on mandatory field and rowspan logic
		isRequired := p.determineParameterRequirement(mandatory, name, eitherOrGroup)

		// Use umfutures-specific type conversion
		param := &parser.Parameter{
			Name:        name,
			Description: description,
			Location:    "body",
			Required:    isRequired,
			Schema:      p.convertParameterTypeToJSONSchema(name, paramType, description),
		}

		channel.Parameters = append(channel.Parameters, param)
	})

	return nil
}

// determineParameterRequirement determines if a parameter is required - reuse from parent
func (p *UmfuturesDocumentParser) determineParameterRequirement(mandatory, paramName string, eitherOrGroup []string) bool {
	mandatory = strings.TrimSpace(strings.ToLower(mandatory))

	// Handle explicit mandatory indicators
	if p.isMandatoryParameter(mandatory) {
		// If this parameter is part of an either/or group (detected by rowspan)
		// we should NOT mark any individual parameter as required since they're mutually exclusive
		// The AsyncAPI generator will need to handle this at the schema level
		if len(eitherOrGroup) > 1 && contains(eitherOrGroup, paramName) {
			// For either/or groups, mark all as optional since the requirement is at the group level
			// The validation logic should ensure at least one is provided
			return false
		}
		return true
	}

	return false
}

// isMandatoryParameter determines if a parameter is mandatory - reuse from parent
func (p *UmfuturesDocumentParser) isMandatoryParameter(mandatory string) bool {
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
