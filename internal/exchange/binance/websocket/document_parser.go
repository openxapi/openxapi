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
type DocumentParser struct {
	docType string
}

// Parse parses the Binance WebSocket API documentation and extracts method information
func (p *DocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedMethods []string) ([]parser.Channel, error) {
	logrus.Debugf("DocumentParser.Parse: DocType=%s, URL=%s", urlEntity.DocType, urlEntity.URL)
	switch urlEntity.DocType {
	case "spot":
		sp := &SpotDocumentParser{DocumentParser: p}
		return sp.Parse(r, urlEntity, protectedMethods)
	case "derivatives":
		uf := &UmfuturesDocumentParser{SpotDocumentParser: &SpotDocumentParser{DocumentParser: p}}
		return uf.Parse(r, urlEntity, protectedMethods)
	default:
		// For umfutures, try derivatives parser if DocType is not set
		if strings.Contains(urlEntity.URL, "umfutures") || strings.Contains(urlEntity.URL, "derivatives") {
			uf := &UmfuturesDocumentParser{SpotDocumentParser: &SpotDocumentParser{DocumentParser: p}}
			return uf.Parse(r, urlEntity, protectedMethods)
		}
		sp := &SpotDocumentParser{DocumentParser: p}
		return sp.Parse(r, urlEntity, protectedMethods)
	}
}

// SpotDocumentParser implements the HTTPDocumentParser interface for Binance Spot WebSocket API
type SpotDocumentParser struct {
	*DocumentParser
}

// Parse parses the Binance Spot WebSocket API documentation and extracts method information
func (p *SpotDocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedMethods []string) ([]parser.Channel, error) {
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

	logrus.Debugf("Extracted %d WebSocket API methods from Binance documentation", len(channels))
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
	// Extract response examples from code blocks (improved approach)
	if s.HasClass("language-javascript") || s.HasClass("language-json") {
		code := s.Find("code")
		if code.Length() > 0 {
			// Try smart token extraction first to filter out comments
			smartText := p.extractJSONFromTokens(code)
			if smartText != "" {
				logrus.Debugf("collectElementContent: Smart token extraction succeeded (length: %d): %s", len(smartText), smartText[:min(200, len(smartText))])

				// Determine if this is a request or response based on content
				isResponse := false

				// Parse JSON to check fields
				var jsonMap map[string]interface{}
				if err := json.Unmarshal([]byte(smartText), &jsonMap); err == nil {
					_, hasStatus := jsonMap["status"]
					_, hasResult := jsonMap["result"]
					_, hasMethod := jsonMap["method"]

					// If it has method field, it's definitely a request
					if hasMethod {
						isResponse = false
					} else if hasStatus || hasResult {
						// If it has status/result, it's likely a response
						isResponse = true
					} else {
						// Otherwise, check context
						isResponse = p.isResponseCodeBlock(s)
					}
				} else {
					// If JSON parsing fails, fall back to context check
					isResponse = p.isResponseCodeBlock(s)
				}

				if isResponse {
					*content = append(*content, "JSON:"+smartText)
					logrus.Debugf("collectElementContent: Extracted response JSON via smart tokens (length: %d)", len(smartText))
				} else {
					*content = append(*content, "CODE:"+smartText)
					logrus.Debugf("collectElementContent: Extracted request JSON via smart tokens (length: %d)", len(smartText))
				}
				return // Exit early to avoid double processing
			}

			// Fallback to original approach if smart extraction fails
			rawText := code.Text()
			logrus.Debugf("collectElementContent: Raw text from HTML (length: %d): %s", len(rawText), rawText[:min(200, len(rawText))])

			fullText := cleanResponseLine(rawText)
			logrus.Debugf("collectElementContent: After cleaning (length: %d): %s", len(fullText), fullText[:min(200, len(fullText))])

			if fullText != "" {
				// Check if this follows a "Response:" paragraph
				isResponse := p.isResponseCodeBlock(s)

				if isResponse {
					*content = append(*content, "JSON:"+fullText)
					logrus.Debugf("collectElementContent: Extracted response JSON (length: %d)", len(fullText))
				} else {
					*content = append(*content, "CODE:"+fullText)
					logrus.Debugf("collectElementContent: Extracted request JSON (length: %d)", len(fullText))
				}
				return // Exit early to avoid double processing
			}
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

// isResponseCodeBlock checks if a code block follows a "Response:" paragraph or "Response Example" header
func (p *DocumentParser) isResponseCodeBlock(s *goquery.Selection) bool {
	// Look for "Response:" in the preceding elements, allowing for intervening paragraphs
	prev := s.Prev()
	maxLookBack := 5 // Reduced search depth to avoid crossing method boundaries
	count := 0

	// Get the full code content to check
	codeText := ""
	if code := s.Find("code").First(); code.Length() > 0 {
		codeText = cleanText(code.Text())
	} else if code := s.Find(".prism-code").First(); code.Length() > 0 {
		codeText = cleanText(code.Text())
	}

	// Get preview for logging
	codePreview := codeText
	if len(codeText) > 100 {
		codePreview = codeText[:100]
	}
	logrus.Debugf("isResponseCodeBlock: Checking code block: %s", codePreview)

	// Quick check: if this code block contains "method" field, it's likely a request
	if strings.Contains(codeText, "\"method\"") {
		logrus.Debugf("isResponseCodeBlock: Code block contains 'method' field - likely a request, returning false")
		return false
	}

	for prev.Length() > 0 && count < maxLookBack {
		if prev.Is("p") {
			prevText := strings.ToLower(cleanText(prev.Text()))
			logrus.Debugf("isResponseCodeBlock: Found paragraph [%d]: %s", count, prevText)
			if strings.HasPrefix(prevText, "response:") {
				logrus.Debugf("isResponseCodeBlock: FOUND 'response:' paragraph - returning true")
				return true
			}
			// Continue searching through paragraphs - they might be explanatory text
		} else if prev.Is("h1, h2, h3, h4, h5, h6") {
			// Check if this is a "Response Example" header
			prevText := strings.ToLower(cleanText(prev.Text()))
			logrus.Debugf("isResponseCodeBlock: Found header [%d]: %s", count, prevText)
			if strings.Contains(prevText, "response example") || strings.Contains(prevText, "response:") {
				logrus.Debugf("isResponseCodeBlock: Found response header - returning true")
				return true
			}
			// Stop searching if this is a real method header (general detection)
			if p.isRealMethodHeader(prev, prevText) {
				logrus.Debugf("isResponseCodeBlock: Found real method header [%s] - stopping search", prevText)
				break
			}
			logrus.Debugf("isResponseCodeBlock: Found generic header - continuing search")
		} else {
			// Log other element types for debugging
			tagName := goquery.NodeName(prev)
			logrus.Debugf("isResponseCodeBlock: Found element [%d]: <%s>", count, tagName)
		}
		prev = prev.Prev()
		count++
	}
	logrus.Debugf("isResponseCodeBlock: No response pattern found after %d elements - returning false", count)
	return false
}

// isRealMethodHeader determines if a header element represents a real API method header
// This uses general CSS class patterns and text heuristics
func (p *DocumentParser) isRealMethodHeader(headerElement *goquery.Selection, headerText string) bool {
	words := strings.Fields(headerText)
	wordCount := len(words)

	// Check if header has anchor class (general method header indicator)
	hasAnchor := headerElement.HasClass("anchor")

	// Check for any sticky navigation classes (general pattern, not specific class names)
	hasStickyNav := false
	classList, exists := headerElement.Attr("class")
	if exists {
		// Look for sticky navigation patterns in class names
		classLower := strings.ToLower(classList)
		if strings.Contains(classLower, "sticky") || strings.Contains(classLower, "nav") {
			hasStickyNav = true
		}
	}

	logrus.Debugf("isRealMethodHeader: Checking header '%s' - hasAnchor=%t, hasStickyNav=%t, wordCount=%d", headerText, hasAnchor, hasStickyNav, wordCount)

	// If it has both anchor and sticky nav classes, it's likely a method header
	if hasAnchor && hasStickyNav {
		// Additional validation for known method names or patterns
		headerLower := strings.ToLower(headerText)

		// Check for known WebSocket API method patterns
		knownPatterns := []string{
			"test connectivity",    // ping method
			"check server time",    // time method
			"exchange information", // exchangeInfo method
			"place order",
			"cancel order",
			"query order",
			"get account",
			"ticker",       // ticker methods
			"24hr",         // 24hr ticker
			"price change", // price change statistics
			"order book",   // order book ticker
			"symbol",       // symbol-related methods
		}

		for _, pattern := range knownPatterns {
			if strings.Contains(headerLower, pattern) {
				logrus.Debugf("isRealMethodHeader: Found known method pattern '%s' in header '%s'", pattern, headerText)
				return true
			}
		}

		// Additional validation: real method headers typically have specific patterns
		// like containing dots (method.name) or parentheses (method (type))
		if strings.Contains(headerText, ".") || strings.Contains(headerText, "(") {
			logrus.Debugf("isRealMethodHeader: Found method header '%s' with CSS classes and special chars", headerText)
			return true
		}

		// Also check if it's a simple single word that might be a method name
		if wordCount == 1 && len(words[0]) > 2 {
			logrus.Debugf("isRealMethodHeader: Found single-word method header '%s'", headerText)
			return true
		}

		// For WebSocket API, headers with 2-3 words and proper CSS classes are likely method headers
		if wordCount >= 2 && wordCount <= 3 {
			logrus.Debugf("isRealMethodHeader: Found multi-word method header '%s' with proper CSS classes", headerText)
			return true
		}
	}

	// Check for method-like patterns in text (e.g., "method.name", "methodName (TYPE)")
	if strings.Contains(headerText, ".") && !strings.Contains(headerText, " ") {
		// This looks like a method name (e.g., "order.place", "ticker.24hr")
		logrus.Debugf("isRealMethodHeader: Found dot-notation method header '%s'", headerText)
		return true
	}

	// Check for headers with parentheses that indicate method types
	if strings.Contains(headerText, "(") && strings.Contains(headerText, ")") {
		// This could be a method with type info (e.g., "New Order (TRADE)")
		logrus.Debugf("isRealMethodHeader: Found parentheses method header '%s' with %d words", headerText, wordCount)
		return true
	}

	logrus.Debugf("isRealMethodHeader: Not a method header '%s'", headerText)
	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// cleanResponseLine cleans response JSON lines (borrowed from REST implementation)
// extractJSONFromTokens intelligently extracts JSON content from HTML tokens, filtering out comments
func (p *DocumentParser) extractJSONFromTokens(codeElement *goquery.Selection) string {
	var jsonTokens []string

	// Find all token spans within the code element
	codeElement.Find("span.token-line").Each(func(i int, line *goquery.Selection) {
		var lineTokens []string

		line.Find("span").Each(func(j int, token *goquery.Selection) {
			// Get token class to determine if it's a comment
			class, exists := token.Attr("class")
			if !exists {
				class = ""
			}

			// Skip comment tokens entirely
			if strings.Contains(class, "comment") {
				logrus.Debugf("extractJSONFromTokens: Skipping comment token: %s", token.Text())
				return
			}

			// Get token text
			tokenText := token.Text()
			if tokenText != "" {
				// Replace tabs with spaces to preserve JSON structure
				tokenText = strings.ReplaceAll(tokenText, "\t", " ")
				tokenText = strings.ReplaceAll(tokenText, "\\t", " ")
				lineTokens = append(lineTokens, tokenText)
			}
		})

		// Join tokens on this line with minimal spacing
		if len(lineTokens) > 0 {
			lineContent := strings.Join(lineTokens, "")
			// Add line breaks only for structural elements
			if strings.Contains(lineContent, "{") || strings.Contains(lineContent, "}") ||
				strings.Contains(lineContent, "[") || strings.Contains(lineContent, "]") ||
				strings.Contains(lineContent, ",") {
				jsonTokens = append(jsonTokens, lineContent)
			} else {
				jsonTokens = append(jsonTokens, lineContent)
			}
		}
	})

	if len(jsonTokens) == 0 {
		logrus.Debugf("extractJSONFromTokens: No tokens found, falling back to direct extraction")
		return ""
	}

	// Join all the JSON tokens
	result := strings.Join(jsonTokens, "")

	// Final cleanup - remove any remaining issues
	result = strings.ReplaceAll(result, "\u00a0", " ") // Non-breaking spaces
	result = strings.TrimSpace(result)

	// Validate that this looks like JSON
	if !strings.HasPrefix(result, "{") && !strings.HasPrefix(result, "[") {
		logrus.Debugf("extractJSONFromTokens: Result doesn't look like JSON: %s", result[:min(50, len(result))])
		return ""
	}

	logrus.Debugf("extractJSONFromTokens: Successfully extracted JSON tokens (length: %d)", len(result))
	return result
}

func cleanResponseLine(text string) string {
	originalLength := len(text)
	logrus.Debugf("cleanResponseLine: Input length: %d", originalLength)

	// More precise comment detection - only match comments that are clearly on their own line or after JSON values
	// commentRegex := regexp.MustCompile(`\s+(//|#)[^\r\n]*(?:\r?\n|$)`)
	// commentRegex2 := regexp.MustCompile(`(?:^|\n)\s*(//|#)[^\r\n]*`)
	// Fix missing commas before comments - this handles malformed JSON in Binance docs
	// missingCommaRegex := regexp.MustCompile(`(["}])\s+(//|#)[^\r\n]*`)

	text = cleanText(text)
	logrus.Debugf("cleanResponseLine: After cleanText: %d (removed %d chars)", len(text), originalLength-len(text))

	// Improved comment removal that handles inline comments without truncating JSON
	beforeCommentRemoval := len(text)

	// Remove comment-only tokens that are standalone
	// Use a more conservative approach - only remove comments that are clearly separate tokens
	commentOnlyRegex := regexp.MustCompile(`\s*//[^"]*?(?:\s|$)`)
	text = commentOnlyRegex.ReplaceAllString(text, " ")

	logrus.Debugf("cleanResponseLine: After comment removal: %d (removed %d chars)", len(text), beforeCommentRemoval-len(text))

	text = strings.ReplaceAll(text, "\t", " ")
	text = strings.ReplaceAll(text, "\u00a0", " ")
	text = strings.ReplaceAll(text, "\\t", " ")
	text = strings.ReplaceAll(text, "\\", "")

	// Fix trailing commas in arrays and objects - this handles malformed JSON in Binance docs
	beforeTrailingCommaFix := len(text)
	trailingCommaRegex := regexp.MustCompile(`,\s*([}\]])`)
	text = trailingCommaRegex.ReplaceAllString(text, "$1")
	logrus.Debugf("cleanResponseLine: After trailing comma fix: %d (changed %d chars)", len(text), len(text)-beforeTrailingCommaFix)

	if strings.HasPrefix(strings.TrimSpace(text), "//") {
		logrus.Debugf("cleanResponseLine: Returning empty string due to comment prefix")
		return ""
	}

	logrus.Debugf("cleanResponseLine: Final length: %d (total removed: %d chars)", len(text), originalLength-len(text))
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
		sendMessage := &parser.Message{
			Title:       fmt.Sprintf("%s Request", channel.Summary),
			Description: fmt.Sprintf("Send a %s request", channel.Name),
			Payload:     requestSchema,
		}
		// Set correlation ID if the payload has an 'id' property
		if p.hasIdProperty(requestSchema) {
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
		if p.hasIdProperty(responseSchema) {
			receiveMessage.CorrelationId = &parser.CorrelationId{
				Location:    "$message.payload#/id",
				Description: "Message correlation ID",
			}
		}
		channel.Messages["response"] = receiveMessage
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
				Format:      param.Schema.Format,
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
		logrus.Debugf("Setting channel summary from first content: '%s'", channel.Summary)

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

		// Extract request JSON from CODE blocks
		if strings.HasPrefix(line, "CODE:") {
			jsonCode := strings.TrimPrefix(line, "CODE:")

			// Try to extract method name from request JSON
			methodName := p.extractMethodNameFromJSON(jsonCode)
			if methodName != "" {
				logrus.Debugf("Setting channel name from JSON: '%s' (was: '%s')", methodName, channel.Name)
				channel.Name = methodName
				foundMethod = true
			}

			// Parse request schema
			if requestSchema == nil {
				requestSchema = p.parseJSONSchema(jsonCode, "request")
			}
		}

		// Extract response JSON examples
		if strings.HasPrefix(line, "JSON:") {
			jsonCode := strings.TrimPrefix(line, "JSON:")

			// Check if this JSON has typical response fields (status, result)
			var jsonMap map[string]interface{}
			isValidResponse := false
			hasStatus := false
			hasResult := false
			hasMethod := false

			if err := json.Unmarshal([]byte(jsonCode), &jsonMap); err == nil {
				_, hasStatus = jsonMap["status"]
				_, hasResult = jsonMap["result"]
				_, hasMethod = jsonMap["method"]

				// A valid response should have status/result but not method
				isValidResponse = (hasStatus || hasResult) && !hasMethod
			}

			// Only try to extract method name if we haven't found one yet
			// Some response examples may have method field for documentation purposes
			if channel.Name == "" && !isValidResponse {
				methodName := p.extractMethodNameFromJSON(jsonCode)
				if methodName != "" {
					logrus.Debugf("Setting channel name from JSON: '%s'", methodName)
					channel.Name = methodName
					foundMethod = true
				}
			}

			// Parse response schema only if it's a valid response
			if responseSchema == nil && isValidResponse {
				logrus.Debugf("Parsing valid response schema (has status: %v, has result: %v)", hasStatus, hasResult)
				responseSchema = p.parseJSONSchema(jsonCode, "response")
			} else if responseSchema == nil {
				logrus.Debugf("Skipping response schema - not a valid response (has method: %v, has status: %v, has result: %v)", hasMethod, hasStatus, hasResult)
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
		generatedName := p.generateMethodName(channel.Summary)
		logrus.Debugf("Generating method name from summary: '%s' -> '%s'", channel.Summary, generatedName)
		channel.Name = generatedName
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
		logrus.Debugf("Failed to unmarshal JSON for method extraction: %v", err)
		return ""
	}

	if method, ok := requestJSON["method"].(string); ok {
		logrus.Debugf("Extracted method name from JSON: '%s'", method)
		return method
	}

	logrus.Debugf("No method field found in JSON")
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

		param := &parser.Parameter{
			Name:        name,
			Description: description,
			Location:    "body",
			Required:    isRequired,
			Schema:      p.convertTypeToJSONSchema(name, paramType, description),
		}

		channel.Parameters = append(channel.Parameters, param)
	})

	return nil
}

// contains checks if a slice contains a string
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// determineParameterRequirement determines if a parameter is required based on mandatory field and context
func (p *DocumentParser) determineParameterRequirement(mandatory, paramName string, eitherOrGroup []string) bool {
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
func (p *DocumentParser) convertTypeToJSONSchema(name, paramType, description string) *parser.Schema {
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
	case strings.Contains(paramType, "number") || strings.Contains(paramType, "integer") || strings.Contains(paramType, "int") || strings.Contains(paramType, "long"):
		logrus.Debugf("convertTypeToJSONSchema: %s, %s, %s", name, paramType, description)
		schema := &parser.Schema{
			Type:        "integer",
			Description: description,
		}
		if strings.Contains(paramType, "long") {
			schema.Format = "int64"
		}
		if name == "timestamp" || strings.HasSuffix(name, "Time") || strings.HasSuffix(name, "Id") || name == "id" {
			logrus.Debugf("Setting format int64 for parameter: %s", name)
			schema.Format = "int64"
		} else {
			logrus.Debugf("No format int64 for parameter: %s (suffix checks: Id=%v, id=%v)", name, strings.HasSuffix(name, "Id"), strings.HasSuffix(name, "id"))
		}
		return schema
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

	logrus.Debugf("parseJSONSchema: Parsing %s JSON (length: %d)", schemaType, len(jsonCode))
	maxLen := 500
	if len(jsonCode) < maxLen {
		maxLen = len(jsonCode)
	}
	logrus.Debugf("parseJSONSchema: JSON content: %s", jsonCode[:maxLen])

	if err := json.Unmarshal([]byte(jsonCode), &data); err != nil {
		logrus.Errorf("parseJSONSchema: JSON unmarshal failed for %s: %v", schemaType, err)
		logrus.Errorf("Malformed JSON content (length %d): %s", len(jsonCode), jsonCode)
		logrus.Fatalf("Malformed JSON in API documentation prevents proper parsing. Please fix the JSON syntax in the %s schema", schemaType)
	}

	logrus.Debugf("parseJSONSchema: JSON unmarshal succeeded for %s", schemaType)
	return p.convertToSchema("", data, fmt.Sprintf("%s schema", schemaType))
}

// cleanJSONResponse cleans JSON response by removing comments and invalid syntax
func (p *DocumentParser) cleanJSONResponse(jsonStr string) string {
	// Since we now clean at the source level, this function is simplified
	return strings.TrimSpace(jsonStr)
}

// convertToSchema recursively converts parsed JSON to Schema
func (p *DocumentParser) convertToSchema(key string, data interface{}, description string) *parser.Schema {
	switch v := data.(type) {
	case map[string]interface{}:
		schema := &parser.Schema{
			Type:        "object",
			Description: description,
			Properties:  make(map[string]*parser.Schema),
		}

		for key, value := range v {
			schema.Properties[key] = p.convertToSchema(key, value, fmt.Sprintf("%s property", key))

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
			itemSchema = p.convertToSchema(key, v[0], "array item")
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
		if v == float64(int(v)) {
			logrus.Debugf("schema key: %s, v: %f, int(v): %d", key, v, int(v))
			schema := &parser.Schema{
				Type:        "integer",
				Description: description,
				Example:     int(v),
			}
			if key == "id" || strings.HasSuffix(key, "Id") || key == "time" || key == "timestamp" || strings.HasSuffix(key, "Time") {
				schema.Format = "int64"
			}
			return schema
		}
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

// isFinancialField checks if a field name represents a financial value that should be treated as string
func isFinancialField(key string) bool {
	// Convert to lowercase for case-insensitive comparison
	lowerKey := strings.ToLower(key)

	// Financial field patterns that should always be strings to preserve precision
	financialFields := []string{
		"price", "quantity", "amount", "fee", "commission", "balance", "volume",
		"qty", "quoteqty", "quotevolume", "quoteasset", "executedqty", "cummulativequoteqty",
		"origqty", "origquoteorderqty", "stopPrice", "icebergqty", "lastexecutedprice",
		"lastquoteasset", "weightedavgprice", "prevday", "change", "low", "high", "open",
		"weightedavg", "bidprice", "askprice", "bidqty", "askqty", "lastprice", "lastqty",
		"delta", "free", "locked", "available", "total", "borrowed", "interest",
		"pricechange", "pricechangepercent", "tradingday", "percentchange", "value",
	}

	// Check exact matches and partial matches (e.g., "bidPrice", "askQty", etc.)
	for _, field := range financialFields {
		if lowerKey == field || strings.Contains(lowerKey, field) {
			return true
		}
	}

	// Check common financial field suffixes
	financialSuffixes := []string{"price", "qty", "amount", "fee", "commission", "balance", "volume"}
	for _, suffix := range financialSuffixes {
		if strings.HasSuffix(lowerKey, suffix) {
			return true
		}
	}

	return false
}

// processMethod processes the method and adds authentication information
func (p *DocumentParser) processMethod(channel *parser.Channel, protectedMethods []string) {
	channel.Protected = p.isProtectedMethod(channel.Name, protectedMethods)
}

// isProtectedMethod checks if a method requires authentication
func (p *DocumentParser) isProtectedMethod(methodName string, protectedMethods []string) bool {
	methodLower := strings.ToLower(methodName)

	for _, protected := range protectedMethods {
		protectedLower := strings.ToLower(protected)
		// Check for exact match the protected method
		if methodLower == protectedLower {
			logrus.Debugf("Method %s marked as protected (matched: %s)", methodName, protected)
			return true
		}
	}

	return false
}

// hasIdProperty checks if a schema has an 'id' property
func (p *DocumentParser) hasIdProperty(schema *parser.Schema) bool {
	if schema == nil || schema.Properties == nil {
		return false
	}

	_, exists := schema.Properties["id"]
	return exists
}
