package binance

import (
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/openxapi/openxapi/internal/parser"
	"github.com/sirupsen/logrus"
)

// SpotDocumentParser is a parser for Binance documents
type DocumentParser struct {
	parser.HTTPDocumentParser
	docType string
}

func (p *DocumentParser) Parse(r io.Reader, url string, docType string, protectedEndpoints []string) ([]parser.Endpoint, error) {
	switch docType {
	case "spot":
		sp := &SpotDocumentParser{DocumentParser: p}
		return sp.Parse(r, url, docType, protectedEndpoints)
	case "umfutures", "cmfutures", "options", "pmargin", "pmarginpro", "futuresdata":
		uf := &DerivativesDocumentParser{
			SpotDocumentParser: &SpotDocumentParser{DocumentParser: p},
		}
		return uf.Parse(r, url, docType, protectedEndpoints)
	case "margin", "algo", "wallet":
		uf := &MarginDocumentParser{
			DerivativesDocumentParser: &DerivativesDocumentParser{
				SpotDocumentParser: &SpotDocumentParser{DocumentParser: p},
			},
		}
		return uf.Parse(r, url, docType, protectedEndpoints)
	default:
		sp := &SpotDocumentParser{DocumentParser: p}
		return sp.Parse(r, url, docType, protectedEndpoints)
	}
}

type SpotDocumentParser struct {
	*DocumentParser
	tableContent      string
	collectedElements map[string]*goquery.Selection
}

// Parse parses an HTML document and extracts API endpoints
func (p *SpotDocumentParser) Parse(r io.Reader, url string, docType string, protectedEndpoints []string) ([]parser.Endpoint, error) {
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

	parseEndpoint := func(headerElement string) func(i int, header *goquery.Selection) {
		return func(i int, header *goquery.Selection) {
			// Get the header text and clean it
			headerText := cleanText(header.Text())
			// Skip headers that are not endpoints (like "Terminology")
			if isNonEndpointHeader(headerText) {
				return
			}

			// Collect all content elements after the header until we find the next h3
			var content []string
			// Add the header text as the first item in content
			content = append(content, headerText)

			// Find all elements between this h3 and the next h3
			var nextElements []*goquery.Selection
			// Get the next h3 element
			nextH3 := header.NextAll().Filter(headerElement).First()
			if nextH3.Length() > 0 {
				// If there's a next h3, get all elements between current h3 and next h3
				header.NextUntil(headerElement).Each(func(j int, el *goquery.Selection) {
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
			endpointData, valid := p.extractEndpoint(content, category)

			// Only add valid endpoints
			if valid && endpointData.Path != "" && endpointData.Method != "" {
				p.processEndpoint(endpointData, protectedEndpoints)
				endpoints = append(endpoints, *endpointData)
			}
		}
	}

	// Find all API endpoint sections
	// In the Binance docs, each endpoint is under an h3 with class "anchor"
	document.Find("h3.anchor").Each(parseEndpoint("h3"))
	// sometimes the endpoints are under h4
	document.Find("h4.anchor").Each(parseEndpoint("h4"))

	return endpoints, nil
}

// extractEndpoint processes the content following an API header to extract endpoint information
func (p *SpotDocumentParser) extractEndpoint(content []string, category string) (*parser.Endpoint, bool) {
	for i, line := range content {
		logrus.Debugf("line %d: %s", i, line)
	}
	var endpoint = &parser.Endpoint{}
	endpoint.Tags = []string{category}
	endpoint.Extensions = make(map[string]interface{})
	endpoint.Responses = make(map[string]*parser.Response)

	foundEndpoint, foundResponse, responseContent := p.extractContent(endpoint, content)
	if !foundEndpoint {
		return nil, false
	}
	if err := p.extractParameters(endpoint); err != nil {
		logrus.Debugf("extractParameters error: %s", err)
	}
	if err := p.extractResponse(endpoint, foundResponse, responseContent); err != nil {
		logrus.Debugf("extractResponse error: %s", err)
	}

	return endpoint, foundEndpoint
}

func (p *SpotDocumentParser) extractContent(endpoint *parser.Endpoint, content []string) (bool, bool, string) {
	// Set the summary from the first content item if available
	if len(content) > 0 {
		endpoint.Summary = content[0]
	}
	// Initialize variables to track what we've found
	var description strings.Builder
	var foundEndpoint, foundWeight, foundParameters, foundDataSource, foundResponse bool
	var responseContent strings.Builder
	p.tableContent = ""

	// Regular expressions to identify different sections
	endpointRegex := regexp.MustCompile(`^(GET|POST|PUT|DELETE|PATCH) (.+)$`)
	weightRegex := regexp.MustCompile(`^Weight:?\s*(\d+|[a-zA-Z].*)?$`)
	parametersRegex := regexp.MustCompile(`^Parameters:$`)
	dataSourceRegex := regexp.MustCompile(`^Data Source:?\s*(.+)$`)
	responseRegex := regexp.MustCompile(`^Response:\s*(.*)$`)
	apiVersionRegex := regexp.MustCompile(`/(v\d+)/`)

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
				endpoint.OperationID = operationID(p.docType, endpoint.Method, endpoint.Path)

				// Extract the API version from the path
				apiVersionMatches := apiVersionRegex.FindStringSubmatch(endpoint.Path)
				if len(apiVersionMatches) == 2 {
					apiVersion := apiVersionMatches[1]
					endpoint.Tags = append(endpoint.Tags, strings.ToUpper(apiVersion))
				}
				continue
			}
		}

		// Check for weight information
		if !foundWeight {
			matches := weightRegex.FindStringSubmatch(line)
			if len(matches) == 2 {
				// if weight is a number, set it
				if _, err := strconv.Atoi(matches[1]); err == nil {
					endpoint.Extensions["x-weight"] = matches[1]
					foundWeight = true
				}
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
	if endpoint.OperationID == "" {
		return false, false, ""
	}
	// Set the description
	endpoint.Description = strings.TrimSpace(description.String())
	return foundEndpoint, foundResponse, responseContent.String()
}

func operationID(docType, method, path string) string {
	// GET /api/v3/exchangeInfo -> SpotGetExchangeInfoV3
	// Spot is the capitalized version of the docType
	// ExchangeInfoV3 is the method capitalized + the path capitalized
	title := func(s string) string {
		return strings.Title(strings.ToLower(s))
	}
	pathRegex := regexp.MustCompile(`^/(.*api)/v(\d+)/(.+)$`)
	matches := pathRegex.FindStringSubmatch(path)
	if len(matches) == 4 {
		var action string
		items := strings.Split(matches[3], "/")
		for _, item := range items {
			action += strings.Title(item)
		}
		path = fmt.Sprintf("%sV%s", action, matches[2])
	}
	path = strings.Join(strings.Split(strings.Title(strings.ReplaceAll(strings.ReplaceAll(path, "/", " "), "-", " ")), " "), "")
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
func (p *SpotDocumentParser) extractParameters(endpoint *parser.Endpoint) error {
	logrus.Debugf("tableContent: %s", p.tableContent)
	doc, err := goquery.NewDocumentFromReader(strings.NewReader("<table>" + p.tableContent + "</table>"))
	if err != nil {
		return fmt.Errorf("creating document from reader: %w", err)
	}

	var paramName, paramType, requiredText, html string
	// Process each row in the table
	doc.Find("tr").Each(func(i int, row *goquery.Selection) {
		// Skip header row
		if i == 0 {
			return
		}
		paramName = ""

		cells := row.Find("td")
		// FIXME: we should identify each column name
		if cells.Length() >= 3 {
			// Reset the variables
			paramType = ""
			requiredText = ""
		}
		if cells.Length() >= 4 {
			html = ""
		}

		// Extract parameter information
		if paramName == "" {
			paramName = cleanText(cells.Eq(0).Text())
		}
		if paramType == "" {
			paramType = cleanText(cells.Eq(1).Text())
		}

		// Determine if parameter is required
		if requiredText == "" {
			requiredText = cleanText(cells.Eq(2).Text())
		}
		required := strings.Contains(strings.ToLower(requiredText), "yes") ||
			strings.Contains(strings.ToLower(requiredText), "mandatory")

		// Extract description
		description := ""
		if html == "" && cells.Length() >= 4 {
			// Replace <code></code> with `
			html, _ = cells.Eq(3).Html()
			html = strings.ReplaceAll(html, "<code>", "`")
			html = strings.ReplaceAll(html, "</code>", "`")
			html = strings.ReplaceAll(html, "<tt>", "`")
			html = strings.ReplaceAll(html, "</tt>", "`")
		}
		if html != "" {
			description = cleanText(html)
		}

		// Create schema based on parameter type
		schema, err := createSchema(fmt.Sprintf("%sParam%s", endpoint.OperationID, strings.Title(paramName)), paramType, "")
		if err != nil {
			return
		}

		// Extract enum values from description if present
		if strings.Contains(description, "Supported values") ||
			strings.Contains(description, "Possible values") ||
			strings.Contains(description, "Valid values") ||
			strings.Contains(description, "Select response format") {
			schema.Enum = extractEnumValues(description)
		}

		// Extract max, min, and default values from description if present
		extractMaxMinDefault(schema, description)

		if len(schema.Enum) > 0 && schema.Default == nil {
			// If the default value is not in the enum, set it to the first enum value
			schema.Default = schema.Enum[0]
		}

		// We use query parameters for GET, DELETE requests
		// As per https://www.rfc-editor.org/rfc/rfc7231#section-4.3.5, DELETE requests should not use request body
		if endpoint.Method == parser.MethodGet || endpoint.Method == parser.MethodDelete {
			// Determine parameter location (in)
			paramIn := "query" // Default to query for REST APIs
			if strings.Contains(endpoint.Path, "{"+paramName+"}") {
				paramIn = "path"
			}
			// Create the parameter
			param := &parser.Parameter{
				Name:        paramName,
				Required:    required,
				Description: description,
				In:          paramIn,
				Schema:      schema,
			}
			endpoint.Parameters = append(endpoint.Parameters, param)
		} else {
			// Otherwise, we use request body for POST, PUT, PATCH
			if endpoint.RequestBody == nil {
				endpoint.RequestBody = &parser.RequestBody{
					Content: map[string]*parser.MediaType{
						parser.ContentTypeFormUrlencoded: {
							Schema: &parser.Schema{
								Title:      fmt.Sprintf("%sReq", endpoint.OperationID),
								Type:       parser.ObjectType,
								Properties: make(map[string]*parser.Schema),
							},
						},
					},
					Required:    true,
					Description: fmt.Sprintf("The request body for %s", endpoint.OperationID),
				}
			}
			endpoint.RequestBody.Content[parser.ContentTypeFormUrlencoded].Schema.Properties[paramName] = schema
			if required {
				endpoint.RequestBody.Content[parser.ContentTypeFormUrlencoded].Schema.Required = append(endpoint.RequestBody.Content[parser.ContentTypeFormUrlencoded].Schema.Required, paramName)
			}
		}
	})
	return nil
}

func (p *SpotDocumentParser) extractResponse(endpoint *parser.Endpoint, foundResponse bool, responseContent string) error {
	// Create a default 200 OK response
	response := &parser.Response{
		Description: "Successful operation",
	}
	// Process response content if we found it
	if foundResponse && responseContent != "" {
		schema, err := p.createResponseSchema(fmt.Sprintf("%sResp", endpoint.OperationID), responseContent)
		if err != nil {
			return fmt.Errorf("creating response schema: %w", err)
		}
		response.Content = map[string]*parser.MediaType{
			"application/json": {
				Schema: schema,
			},
		}
	} else {
		// If no response content, still create a default response
		response.Content = map[string]*parser.MediaType{
			"application/json": {
				Schema: &parser.Schema{
					Type:     parser.ObjectType,
					Nullable: true,
				},
			},
		}
	}
	endpoint.Responses["200"] = response
	return nil
}

// createResponseSchema attempts to create a schema from response example text
func (p *SpotDocumentParser) createResponseSchema(name, responseText string) (*parser.Schema, error) {
	responseText = strings.TrimSpace(responseText)
	logrus.Debugf("responseText: %s", responseText)
	schema, err := createSchema(name, "", responseText)
	if err != nil {
		return nil, fmt.Errorf("creating response schema: %w", err)
	}
	// Add the example text
	schema.Example = responseText
	return schema, nil
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
		return values
	}
	// Supported values: `FULL` or `MINI`. <br/>If none provided, the default is `FULL`
	if strings.Contains(description, "<br/>") {
		description = strings.Split(description, "<br/>")[0]
	}
	description = strings.Trim(description, " .'")
	regex = regexp.MustCompile(`(Supported values:|Select response format:) (.*)`)
	matches = regex.FindStringSubmatch(description)
	if len(matches) > 2 {
		s := matches[2]
		var items []string
		if strings.Contains(s, " or ") {
			items = strings.Split(s, " or ")
		} else if strings.Contains(s, ", ") {
			items = strings.Split(s, ", ")
		} else {
			items = []string{s}
		}
		for _, item := range items {
			if strings.Contains(item, ",") {
				for _, subItem := range strings.Split(item, ",") {
					if strings.HasPrefix(subItem, "<") {
						continue
					}
					values = append(values, strings.Trim(strings.TrimSpace(subItem), "`"))
				}
			} else {
				if strings.HasPrefix(item, "<") {
					continue
				}
				values = append(values, strings.Trim(strings.TrimSpace(item), "`"))
			}
		}
		return values
	}
	return values
}

func extractMaxMinDefault(schema *parser.Schema, description string) {
	var defaultValue, minValue, maxValue string
	DefaultRegex := regexp.MustCompile(`(Default|default):? ` + "`?" + `(\d+|true|false)` + "`?" + `?`)
	MinRegex := regexp.MustCompile(`(Min|min):? ` + "`?" + `(\d+)` + "`?" + `?`)
	MaxRegex := regexp.MustCompile(`(Max|max):? ` + "`?" + `(\d+)` + "`?" + `?`)

	timeRegex := regexp.MustCompile(`\d+ (days|day|month|months|week|weeks|year|years)`)
	matches := timeRegex.FindStringSubmatch(description)
	if len(matches) > 1 {
		// Give up if we find a time value
		return
	}

	matches = DefaultRegex.FindStringSubmatch(description)
	if len(matches) > 2 {
		defaultValue = matches[2]
	}
	matches = MinRegex.FindStringSubmatch(description)
	if len(matches) > 2 {
		minValue = matches[2]
	}
	matches = MaxRegex.FindStringSubmatch(description)
	if len(matches) > 2 {
		maxValue = matches[2]
	}
	switch schema.Type {
	case parser.IntegerType:
		if defaultValue != "" {
			defaultInt, err := strconv.Atoi(defaultValue)
			if err == nil {
				schema.Default = defaultInt
			}
		}
		if minValue != "" {
			minFloat, err := strconv.ParseFloat(minValue, 64)
			if err == nil {
				schema.Min = &minFloat
			}
		}
		if maxValue != "" {
			maxFloat, err := strconv.ParseFloat(maxValue, 64)
			if err == nil {
				schema.Max = &maxFloat
			}
		}
	case parser.NumberType:
		if defaultValue != "" {
			defaultFloat, err := strconv.ParseFloat(defaultValue, 64)
			if err == nil {
				schema.Default = defaultFloat
			}
		}
		if minValue != "" {
			minFloat, err := strconv.ParseFloat(minValue, 64)
			if err == nil {
				schema.Min = &minFloat
			}
		}
		if maxValue != "" {
			maxFloat, err := strconv.ParseFloat(maxValue, 64)
			if err == nil {
				schema.Max = &maxFloat
			}
		}
	case parser.StringType:
		if defaultValue != "" {
			schema.Default = defaultValue
		}
	case parser.BooleanType:
		if defaultValue != "" {
			defaultBool, err := strconv.ParseBool(defaultValue)
			if err == nil {
				schema.Default = defaultBool
			}
		}
	}
}

// createSchema creates a schema based on the parameter type
func createSchema(name, paramType string, content string) (*parser.Schema, error) {
	listRegex := regexp.MustCompile(`LIST<(\w+)>`)
	matches := listRegex.FindStringSubmatch(paramType)
	if len(matches) > 1 {
		paramType = matches[1]
		itemSchema, err := createSchema(name, paramType, content)
		if err != nil {
			return nil, err
		}
		return &parser.Schema{
			Type:  parser.ArrayType,
			Items: itemSchema,
		}, nil
	}
	typ, content := normalizeType(paramType, content)
	switch typ {
	case parser.ObjectType:
		// If the content is a JSON object, unmarshal it into the map
		v := make(map[string]interface{})
		err := json.Unmarshal([]byte(content), &v)
		if err != nil {
			return nil, fmt.Errorf("unmarshalling JSON: %w", err)
		}
		schema, err := createSchemaWithValue(v, name)
		if err != nil {
			return nil, fmt.Errorf("creating schema with value: %w", err)
		}
		return schema, nil
	case parser.ArrayType:
		// If the content is a JSON array, unmarshal it into the array
		v := make([]interface{}, 0)
		err := json.Unmarshal([]byte(content), &v)
		if err != nil {
			return nil, fmt.Errorf("unmarshalling JSON: %w", err)
		}
		schema, err := createSchemaWithValue(v, name)
		if err != nil {
			return nil, fmt.Errorf("creating schema with value: %w", err)
		}
		return schema, nil
	case parser.StringType:
		schema := &parser.Schema{
			Type:    typ,
			Default: "",
			Title:   name,
		}
		return schema, nil
	default:
		if typ == parser.IntegerType && strings.ToUpper(paramType) == "LONG" {
			return &parser.Schema{
				Type:   typ,
				Title:  name,
				Format: "int64",
			}, nil
		}
		schema := &parser.Schema{
			Type:  typ,
			Title: name,
		}
		return schema, nil
	}
}

func createSchemaWithValue(v interface{}, title string) (*parser.Schema, error) {
	typ := reflect.TypeOf(v)
	if typ == nil {
		return &parser.Schema{
			Title:    title,
			Type:     parser.ObjectType,
			Nullable: true,
		}, nil
	}
	if typ.Kind() == reflect.Ptr {
		typ = typ.Elem()
	}
	if typ.Kind() == reflect.Slice {
		schema := &parser.Schema{
			Title: title,
			Type:  parser.ArrayType,
		}
		if reflect.ValueOf(v).Len() > 0 {
			itemsSchema, err := createSchemaWithValue(reflect.ValueOf(v).Index(0).Interface(), fmt.Sprintf("%sItem", title))
			if err != nil {
				return nil, fmt.Errorf("creating schema for items: %w", err)
			}
			schema.Title = title
			schema.Items = itemsSchema
		}
		// TODO: handle empty array
		return schema, nil
	}
	if typ.Kind() == reflect.Map {
		schema := &parser.Schema{
			Title:      title,
			Type:       parser.ObjectType,
			Properties: make(map[string]*parser.Schema),
		}
		// create a schema for each k, v pair
		keys := reflect.ValueOf(v).MapKeys()
		for _, key := range keys {
			valueSchema, err := createSchemaWithValue(reflect.ValueOf(v).MapIndex(key).Interface(), fmt.Sprintf("%s.%s", title, key.String()))
			if err != nil {
				return nil, fmt.Errorf("creating schema for value: %w", err)
			}
			schema.Properties[key.String()] = valueSchema
			// FIXME: this is a hack to fix the format of the time fields
			if (strings.HasSuffix(key.String(), "Time") || strings.HasSuffix(key.String(), "time") || strings.HasSuffix(key.String(), "timestamp") || strings.HasSuffix(key.String(), "Timestamp")) && valueSchema.Type == parser.IntegerType {
				schema.Properties[key.String()].Format = "int64"
			}
			if strings.HasSuffix(key.String(), "Id") && valueSchema.Type == parser.IntegerType {
				schema.Properties[key.String()].Format = "int64"
			}
			if key.String() == "goodTillDate" && valueSchema.Type == parser.IntegerType {
				schema.Properties[key.String()].Format = "int64"
			}
		}
		return schema, nil
	}
	if typ.Kind() == reflect.String {
		schema := &parser.Schema{
			Title: title,
			Type:  parser.StringType,
		}
		return schema, nil
	}
	if typ.Kind() == reflect.Bool {
		schema := &parser.Schema{
			Title: title,
			Type:  parser.BooleanType,
		}
		return schema, nil
	}
	if typ.Kind() == reflect.Int || typ.Kind() == reflect.Int8 || typ.Kind() == reflect.Int16 || typ.Kind() == reflect.Int32 || typ.Kind() == reflect.Int64 {
		schema := &parser.Schema{
			Title: title,
			Type:  parser.IntegerType,
		}
		if typ.Kind() == reflect.Int64 {
			schema.Format = "int64"
		}
		return schema, nil
	}
	if typ.Kind() == reflect.Float32 || typ.Kind() == reflect.Float64 {
		// Check if the value is actually an integer
		if reflect.ValueOf(v).Float() == float64(int(reflect.ValueOf(v).Float())) {
			schema := &parser.Schema{
				Title: title,
				Type:  parser.IntegerType,
			}
			// TODO: we can collect all the LONG parameters from documents and compare the key with the name
			// if they are the same, we can set the format to int64
			return schema, nil
		} else {
			schema := &parser.Schema{
				Title: title,
				Type:  parser.NumberType,
			}
			return schema, nil
		}
	}
	return nil, fmt.Errorf("unsupported type: %s", typ.String())
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
		return strings.TrimSuffix(strings.TrimSuffix(strings.TrimSpace(parts[0]), " endpoints"), " Endpoints")
	}
	return "General"
}

// normalizeType converts Binance types to OpenAPI types
func normalizeType(typ, content string) (string, string) {
	switch strings.ToUpper(typ) {
	case "INT", "LONG", "INTEGER":
		return parser.IntegerType, content
	case "FLOAT", "DOUBLE":
		return parser.NumberType, content
	case "STRING", "ENUM", "DECIMAL":
		return parser.StringType, content
	case "BOOLEAN", "BOOL":
		return parser.BooleanType, content
	case "ARRAY", "ARRAY OF STRING", "LIST":
		if content == "" {
			content = "[\"\"]"
		}
		return parser.ArrayType, content
	case "OBJECT":
		if content == "" {
			content = "{}"
		}
		return parser.ObjectType, content
	default:
		return guessType(content)
	}
}

func guessType(content string) (string, string) {
	// If the content starts with "{", then it's a JSON object;
	// If the content starts with "[", then it's a JSON array;
	content = strings.TrimSpace(content)
	if strings.HasPrefix(content, "{") {
		return parser.ObjectType, content
	} else if strings.HasPrefix(content, "[") {
		return parser.ArrayType, content
	}
	if content == "" {
		content = "{}"
	}
	return parser.ObjectType, content
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
func (p *SpotDocumentParser) collectElementContent(s *goquery.Selection, content *[]string) {
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
			*content = append(*content, "Response: "+responseText)
		}
	}

	// Look for parameter tables after "Parameters:" paragraph
	// Only look at tables that are direct siblings of the paragraph
	if s.Is("p") && strings.Contains(s.Text(), "Parameters:") {
		// Find the next table that is a direct sibling
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
		s.Children().Each(func(i int, li *goquery.Selection) {
			text := cleanText(li.Text())
			if text != "" {
				*content = append(*content, "- "+text)
			}
		})
	}
}

func cleanResponseLine(text string) string {
	var commentRegex = regexp.MustCompile(`(\s+|,)(//|#).*`)
	var commentRegex2 = regexp.MustCompile(`//\s+.*`)
	text = cleanText(text)
	text = commentRegex.ReplaceAllString(text, "$1")
	text = commentRegex2.ReplaceAllString(text, "")
	// remove `\t` and `\u00a0`
	text = strings.ReplaceAll(text, "\t", "")
	text = strings.ReplaceAll(text, "\u00a0", "")
	text = strings.ReplaceAll(text, "\\", "")
	if strings.HasPrefix(strings.TrimSpace(text), "//") {
		return ""
	}
	return text
}

func (p *SpotDocumentParser) processEndpoint(endpoint *parser.Endpoint, protectedEndpoints []string) {
	// Check if the endpoint is protected
	if slices.Contains(protectedEndpoints, fmt.Sprintf("%s %s", strings.ToUpper(endpoint.Method), endpoint.Path)) {
		endpoint.Protected = true
	}
	p.processResponses(endpoint)
	p.processSecurities(endpoint)
}

func (p *SpotDocumentParser) processResponses(endpoint *parser.Endpoint) {
	// Add default responses for 4XX and 5XX
	endpoint.Responses["4XX"] = &parser.Response{
		Description: "Client Error",
		Content: map[string]*parser.MediaType{
			parser.ContentTypeJSON: {
				Schema: &parser.Schema{
					Title: "APIError",
				},
			},
		},
	}
	endpoint.Responses["5XX"] = &parser.Response{
		Description: "Server Error",
		Content: map[string]*parser.MediaType{
			parser.ContentTypeJSON: {
				Schema: &parser.Schema{
					Title: "APIError",
				},
			},
		},
	}
	// Add APIError schema
	endpoint.Schemas = append(endpoint.Schemas, &parser.Schema{
		Title:       "APIError",
		Description: "binance API error",
		Type:        parser.ObjectType,
		Properties: map[string]*parser.Schema{
			"code": {
				Type: parser.IntegerType,
			},
			"msg": {
				Type: parser.StringType,
			},
		},
	})
}

func (p *SpotDocumentParser) processSecurities(endpoint *parser.Endpoint) {
	if endpoint.SecuritySchemas == nil {
		endpoint.SecuritySchemas = make(map[string]*parser.SecuritySchema)
	}
	// Extract the security type from the endpoint summary
	summary := strings.TrimSpace(endpoint.Summary)
	// TODO: no need to sign for USER_STREAM endpoints
	if strings.HasSuffix(summary, "(USER_DATA)") || strings.HasSuffix(summary, "(USER_STREAM)") || strings.HasSuffix(summary, "(TRADE)") {
		endpoint.SecuritySchemas["ApiKey"] = &parser.SecuritySchema{
			Type: parser.SecurityTypeApiKey,
			In:   parser.SecurityLocationHeader,
			Name: "X-MBX-APIKEY",
		}
		if endpoint.Security == nil {
			endpoint.Security = make([]map[string][]string, 0)
		}
		endpoint.Security = append(endpoint.Security, map[string][]string{
			"ApiKey": {},
		})
	}
}
