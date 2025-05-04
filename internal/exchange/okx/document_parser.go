package okx

import (
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"regexp"
	"slices"
	"strings"

	"github.com/openxapi/openxapi/internal/config"
	"github.com/openxapi/openxapi/internal/parser"

	"github.com/PuerkitoBio/goquery"
	"github.com/sirupsen/logrus"
	"golang.org/x/net/html"
)

var AuthHeaderMap map[string]string = map[string]string{
	"APIKey":     "OK-ACCESS-KEY",
	"Passphrase": "OK-ACCESS-PASSPHRASE",
}

var ManualAPISchemaMap map[string]parser.Schema = map[string]parser.Schema{
	"/api/v5/public/underlying": {
		Type: parser.ArrayType,
		Items: &parser.Schema{
			Type: parser.StringType,
		},
	},
}

// EndpointDocumentSection represents a section of the endpoint document
type EndpointDocumentSection struct {
	Title                   *goquery.Selection
	Description             []*goquery.Selection
	HttpRequest             *goquery.Selection
	RequestMethodAndPath    *goquery.Selection
	RequestParameters       *goquery.Selection
	RequestParametersTable  *goquery.Selection
	ResponseExample         *goquery.Selection
	ResponseParameters      *goquery.Selection
	ResponseParametersTable *goquery.Selection
	ExtraElements           []*goquery.Selection
}

// DocumentParser is a parser for OKX documents
type DocumentParser struct {
	parser.HTTPDocumentParser
	docType string
}

type OkxAPISubCategory struct {
	CategoryName    string
	SubCategoryName string
	SubCategoryID   string
}

func checkResponseIsArranged(elements []*goquery.Selection) bool {
	content := ""
	for _, ele := range elements {
		content += ele.Text()
	}
	return strings.Contains(strings.ToLower(content), "arranged in an array ")
}

func isParameterDeprecated(paramDesc string) bool {
	return strings.Contains(strings.ToLower(paramDesc), "deprecated")
}

func generateParamDesc(paramEle *html.Node) string {
	nodes := paramEle.ChildNodes()
	description := ""
	for node := range nodes {
		if node.Type == html.TextNode {
			description += node.Data
		} else if node.Type == html.ElementNode {
			switch strings.ToLower(node.Data) {
			case "del":
				description += generateParamDesc(node)
			case "code":
				codeNodes := node.ChildNodes()
				for codeNode := range codeNodes {
					if codeNode.Type == html.TextNode {
						description += fmt.Sprintf("`%s`", codeNode.Data)
					}
				}
			case "br":
				description += "\n\n"
			}
		}
	}
	return description
}

func checkEndpointIsProtected(endpointDesc string) bool {
	rateLimitRuleRegexp := regexp.MustCompile(`(?i)rate limit rule:\s+(.*)`)
	matches := rateLimitRuleRegexp.FindStringSubmatch(endpointDesc)
	requireAuth := true
	if len(matches) == 2 {
		rateLimitRule := matches[1]
		if !strings.Contains(strings.ToLower(rateLimitRule), "user id") {
			requireAuth = false
		}
		if strings.Contains(strings.ToLower(rateLimitRule), " or ") {
			requireAuth = false
		}
	} else {
		requireAuth = false
	}
	return requireAuth
}

func operationID(method, path string) string {
	// GET /api/v5/account/instruments -> GetAccountInstrumentsV5
	pathRegex := regexp.MustCompile(`^/(.*api)/v(\d+)/(.+)/(.+)$`)
	matches := pathRegex.FindStringSubmatch(path)
	if len(matches) == 5 {
		var action string
		items := strings.Split(matches[4], "-")
		for _, item := range items {
			action += strings.Title(item)
		}
		path = fmt.Sprintf("%s%sV%s", strings.Title(matches[3]), action, matches[2])
	}
	path = strings.ReplaceAll(path, "/", " ")
	path = strings.ReplaceAll(path, "-", " ")
	path = strings.Join(strings.Split(strings.Title(path), " "), "")
	return fmt.Sprintf("%s%s", methodToAction(method), path)
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

func generateObjectSchema(paramEle *goquery.Selection, objName string, elePrefix string) *parser.Schema {
	schema := &parser.Schema{
		Type:       parser.ObjectType,
		Properties: make(map[string]*parser.Schema),
	}
	subParamEle := paramEle.Next()
	for subParamEle.Length() > 0 {
		children := subParamEle.Children()
		eleVals := make([]string, children.Length())
		children.Each(func(i int, s *goquery.Selection) {
			eleVals[i] = s.Text()
		})
		paramName, paramType := eleVals[0], eleVals[1]
		if !strings.Contains(paramName, elePrefix) {
			break
		}

		subSchema, _ := createSchema(objName, paramType, paramName, subParamEle)
		subSchema.Description = generateParamDesc(children.Last().Nodes[0])
		subSchema.Deprecated = isParameterDeprecated(subSchema.Description)

		paramName = strings.Split(paramName, " ")[1]
		schema.Properties[paramName] = subSchema
		subParamEle = subParamEle.Next()
	}
	return schema
}

// createSchema creates a schema based on the parameter type
func createSchema(name, paramType, paramName string, paramEle *goquery.Selection) (*parser.Schema, error) {
	typ := normalizeType(paramType)
	switch typ {
	case parser.ObjectType:
		elePrefix := "> "
		if strings.Contains(paramName, elePrefix) {
			elePrefix = ">" + strings.Split(paramName, " ")[0] + " "
		}
		schema := generateObjectSchema(paramEle, paramName, elePrefix)
		schema.Title = name
		return schema, nil
	case parser.ArrayOfStringType:
		schema := &parser.Schema{
			Type: parser.ArrayType,
		}
		schema.Items = &parser.Schema{
			Type: parser.StringType,
		}
		schema.Title = name
		schema.Items.Title = fmt.Sprintf("%sItem", name)
		return schema, nil
	case parser.ArrayOfArrayType:
		schema := &parser.Schema{
			Type: parser.ArrayType,
		}
		schema.Items = &parser.Schema{
			Type: parser.ArrayType,
		}
		schema.Items.Items = &parser.Schema{
			Type: parser.StringType,
		}
		schema.Title = name
		schema.Items.Title = fmt.Sprintf("%sItem", name)
		return schema, nil
	case parser.ArrayOfObjectType:
		schema := &parser.Schema{
			Type: parser.ArrayType,
		}
		elePrefix := "> "
		if strings.Contains(paramName, elePrefix) {
			elePrefix = ">" + strings.Split(paramName, " ")[0] + " "
		}
		itemsSchema := generateObjectSchema(paramEle, paramName, elePrefix)
		schema.Items = itemsSchema
		schema.Title = name
		schema.Items.Title = fmt.Sprintf("%sItem", name)
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

// normalizeType converts OKX types to OpenAPI types
func normalizeType(typ string) string {
	switch strings.ToUpper(typ) {
	case "INT", "LONG", "INTEGER":
		return parser.IntegerType
	case "FLOAT", "DOUBLE":
		return parser.NumberType
	case "STRING", "ENUM", "DECIMAL":
		return parser.StringType
	case "BOOLEAN", "BOOL":
		return parser.BooleanType
	case "ARRAY", "ARRAY OF STRING", "ARRAY OF STRINGS":
		return parser.ArrayOfStringType
	case "ARRAY OF OBJECTS", "ARRAY OF OBJECT":
		return parser.ArrayOfObjectType
	case "ARRAY OF ARRAY":
		return parser.ArrayOfArrayType
	case "OBJECT":
		return parser.ObjectType
	default:
		return parser.StringType
	}
}

func fixInvalidJSON(invalidJSON string) string {
	// remove comment and extra commas
	commentRegexp := regexp.MustCompile(`(\s+|,)(//|#).*`)
	extraCommasRegexp := regexp.MustCompile(`,(\s*?(]|}))`)
	result := commentRegexp.ReplaceAllString(invalidJSON, "$1")
	result = extraCommasRegexp.ReplaceAllString(result, "$1")
	return result
}

// generateEndpointDesc generates the endpoint description using the CommonMark spec
func (p *DocumentParser) generateEndpointDesc(endpointDescElements []*goquery.Selection) string {
	endpointDesc := ""
	for _, ele := range endpointDescElements {
		if ele == nil {
			continue
		}
		if ele.Is("p") {
			endpointDesc += generateParamDesc(ele.Nodes[0]) + "\n\n"
		}
		if ele.Is("h4") {
			endpointDesc += fmt.Sprintf("#### %s \n\n", ele.Text())
		}
		if ele.Is("aside") {
			endpointDesc += fmt.Sprintf("**_%s_**\n\n", strings.ReplaceAll(ele.Text(), "\n", ""))
		}
	}
	return endpointDesc
}

func (p *DocumentParser) generateRespExample(respEle *goquery.Selection) string {
	respExampleText := respEle.Text()
	if respExampleText == "" {
		return respExampleText
	}

	if json.Valid([]byte(respExampleText)) {
		return respExampleText
	}
	respExampleText = fixInvalidJSON(respExampleText)
	if !json.Valid([]byte(respExampleText)) {
		logrus.Debugf("Invalid JSON response example: %s", respExampleText)
		return ""
	}

	return respExampleText
}

func (p *DocumentParser) extractRequestMethodAndPath(endpoint *parser.Endpoint, ele *goquery.Selection) error {
	reqRegex := regexp.MustCompile(`(?i)(GET|Get|POST|Post|PUT|Put|DELETE|Delete|PATCH|Patch)\s+(/api/v\d+/[^ ]+)`)
	matches := reqRegex.FindStringSubmatch(ele.Text())
	if len(matches) != 3 {
		return fmt.Errorf("request method and path not found")
	}
	endpoint.Method = strings.ToUpper(matches[1])
	endpoint.Path = matches[2]
	return nil
}

func (p *DocumentParser) extractSubCategories(doc *goquery.Document, categoryID string) map[string]*OkxAPISubCategory {
	subCategories := map[string]*OkxAPISubCategory{}
	items := strings.Split(categoryID, "-")
	for idx, item := range items {
		items[idx] = strings.Title(strings.ToLower(item))
	}
	categoryName := strings.Join(items, " ")

	// <h1 id="trading-account">Trading Account</h1>
	// <h2 id="trading-account-rest-api">REST API</h2>
	// categoryID is trading-account
	// subCategoryID is trading-account-rest-api
	subGroupAPIElements := doc.Find(fmt.Sprintf("h2[id*='%s']", categoryID))
	subGroupAPIElements.Each(func(i int, subCategory *goquery.Selection) {
		subCategoryID, exists := subCategory.Attr("id")
		if exists {
			items := strings.Split(subCategory.Text(), "-")
			for idx, item := range items {
				items[idx] = strings.Title(strings.ToLower(item))
			}
			subCategoryName := strings.Join(items, " ")
			// skip websocket endpoints
			if !strings.Contains(strings.ToLower(subCategoryID), "websocket") {
				subCategories[subCategoryID] = &OkxAPISubCategory{
					CategoryName:    categoryName,
					SubCategoryName: subCategoryName,
					SubCategoryID:   subCategoryID,
				}
			}
		}
	})
	return subCategories
}

func (p *DocumentParser) extractEndpointDocumentSection(endpointStartElement *goquery.Selection) *EndpointDocumentSection {
	endpointSection := &EndpointDocumentSection{
		Title: endpointStartElement,
	}
	tables := []*goquery.Selection{}
	respParamElements := []*goquery.Selection{}

	ele := endpointStartElement.Next()
	for ele.Length() > 0 {
		// break if we reach the next endpoint section
		if ele.Is("h1") || ele.Is("h2") || ele.Is("h3") {
			break
		}
		// extract description, request parameters, and extra elements
		if ele.Is("p") {
			if strings.Contains(ele.Text(), "# HTTP Request") {
				// compatible with http request element typo
				logrus.Debug("Typo in http request element")
				endpointSection.HttpRequest = ele
			} else if endpointSection.HttpRequest == nil {
				// all elements before the request element are considered description
				endpointSection.Description = append(endpointSection.Description, ele)
			} else if endpointSection.ResponseParameters != nil {
				// all elements after the response parameters element are considered extra elements
				endpointSection.ExtraElements = append(endpointSection.ExtraElements, ele)
			} else {
				// extract request method and path
				codeEle := ele.Find("code").First()
				if codeEle.Size() > 0 {
					requestInfo := codeEle.Text()
					reqRegex := regexp.MustCompile(`(?i)(GET|Get|POST|Post|PUT|Put|DELETE|Delete|PATCH|Patch)\s+(/api/v\d+/[^ ]+)`)
					if reqRegex.MatchString(requestInfo) {
						endpointSection.RequestMethodAndPath = codeEle
					}
				}
			}
		}

		if ele.Is("h4") {
			eleID := ele.AttrOr("id", "")
			if strings.Contains(eleID, "http") {
				// extract http request element
				// usually the element id is end with http-request
				// but in some cases, it is end with http
				if !strings.Contains(eleID, "http-request") {
					logrus.Debug("Typo in http request element")
				}
				endpointSection.HttpRequest = ele
			} else if strings.Contains(eleID, "request-parameters") {
				// extract request parameters element
				endpointSection.RequestParameters = ele
			} else if strings.Contains(eleID, "response-") {
				// extract response parameters element
				// usually the element id is end with response-parameters
				// but in some cases, it is end with response
				if !strings.Contains(eleID, "response-parameters") {
					logrus.Debug("Typo in response parameters element")
				}
				endpointSection.ResponseParameters = ele
				respParamElements = append(respParamElements, ele)
			} else {
				if endpointSection.HttpRequest == nil {
					// all elements before the request element are considered description
					endpointSection.Description = append(endpointSection.Description, ele)
				}
			}
		}
		if ele.Is("aside") {
			if endpointSection.HttpRequest == nil {
				// all elements before the request element are considered description
				endpointSection.Description = append(endpointSection.Description, ele)
			}
			if endpointSection.ResponseParameters != nil {
				// all aside elements after the response parameters element are considered extra elements
				endpointSection.ExtraElements = append(endpointSection.ExtraElements, ele)
			}
		}

		// extract response example, if multiple examples are found, use the last one
		if ele.Is("div[class='highlight']") {
			preEle := ele.Find("pre[class='highlight json tab-json']").First()
			if preEle != nil {
				codeEle := preEle.Find("code").First()
				if codeEle.Length() > 0 {
					endpointSection.ResponseExample = codeEle
				}
			}
		}

		// extract request/response parameters table
		if ele.Is("table") {
			tables = append(tables, ele)
			if endpointSection.ResponseExample != nil && endpointSection.ResponseParametersTable == nil {
				// extract response parameters table
				endpointSection.ResponseParametersTable = ele
			} else {
				if endpointSection.RequestParametersTable == nil {
					endpointSection.RequestParametersTable = ele
				}
			}
		}
		ele = ele.Next()
	}

	// compatible with response parameters table typo
	if len(tables) >= 2 {
		endpointSection.RequestParametersTable = tables[0]
		if len(respParamElements) >= 2 {
			logrus.Debug("Multiple response parameters table found")
			endpointSection.ResponseParametersTable = tables[1]
		}
	}
	return endpointSection
}

func (p *DocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedEndpoints []string) ([]parser.Endpoint, error) {
	u, err := url.Parse(urlEntity.URL)
	if err != nil {
		return nil, fmt.Errorf("parsing URL: %w", err)
	}

	p.docType = urlEntity.DocType
	// Parse HTML document
	document, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML: %w", err)
	}

	// https://www.okx.com/docs-v5/en/#order-book-trading
	// categoryID is order-book-trading
	categoryID := u.EscapedFragment()
	subCategories := p.extractSubCategories(document, categoryID)

	var endpoints []parser.Endpoint
	for subCategoryID, subCategory := range subCategories {
		// <h3 id="trading-account-rest-api-get-instruments">Get instruments</h3>
		endpointSections := document.Find("h3[id*=" + subCategoryID + "]")
		endpointSections.Each(func(i int, endpointTitleEle *goquery.Selection) {
			endpointTitle := endpointTitleEle.Text()
			if strings.Contains(endpointTitle, "WS /") {
				logrus.Debugf("Skipping WebSocket endpoint: %s", endpointTitle)
				return
			}
			logrus.Infof("Parsing endpoint section: %s", endpointTitle)
			u.Fragment = endpointTitleEle.AttrOr("id", "")
			logrus.Debugf("Endpoint URL: %s", u.String())

			var endpoint = &parser.Endpoint{}

			endpoint.Tags = []string{subCategory.CategoryName}
			if !strings.Contains(subCategoryID, "rest-api") {
				endpoint.Tags = []string{subCategory.SubCategoryName}
			} else {
				endpoint.Tags = []string{subCategory.CategoryName}
			}

			endpoint.Extensions = make(map[string]interface{})
			endpoint.Responses = make(map[string]*parser.Response)

			endpointDocSection := p.extractEndpointDocumentSection(endpointTitleEle)

			if endpointDocSection.RequestMethodAndPath == nil {
				logrus.Warnf("Skip invalid endpoint section: %s", endpointTitle)
				return
			}

			endpoint.Description = p.generateEndpointDesc(endpointDocSection.Description)

			endpoint.Summary = endpointTitle

			if endpointDocSection.RequestMethodAndPath == nil {
				logrus.Errorf("Request method and path not found")
				return
			}
			err := p.extractRequestMethodAndPath(endpoint, endpointDocSection.RequestMethodAndPath)
			if err != nil {
				logrus.Errorf("Extracting request method and path error: %s", err)
				return
			}

			endpoint.OperationID = operationID(endpoint.Method, endpoint.Path)

			p.processEndpoint(endpoint, protectedEndpoints)

			requestParamsTableEle := endpointDocSection.RequestParametersTable
			if requestParamsTableEle != nil {
				p.extractParameters(endpoint, requestParamsTableEle)
			} else {
				logrus.Warnf("Request parameters table element not found")
			}

			responseTableElement := endpointDocSection.ResponseParametersTable
			if responseTableElement != nil {
				p.extractResponse(endpoint, endpointDocSection)
			} else {
				logrus.Warnf("Response parameters table element not found")
			}

			endpoints = append(endpoints, *endpoint)
			logrus.Infof("Parsing API section: %s Done", endpointTitle)
		})
	}

	logrus.Debugf("Parsed %d endpoints", len(endpoints))
	return endpoints, nil
}

// extractParameters extracts parameters from the endpoint description
func (p *DocumentParser) extractParameters(endpoint *parser.Endpoint, parametersTable *goquery.Selection) error {
	paramEle := parametersTable.Find("tbody > tr").First()
	for paramEle.Length() > 0 {
		children := paramEle.Children()
		vals := make([]string, children.Length())

		children.Each(func(i int, s *goquery.Selection) {
			vals[i] = s.Text()
		})

		paramName, paramType, requiredText, description := vals[0], vals[1], vals[2], vals[3]
		required := strings.Contains(strings.ToLower(requiredText), "yes")

		// skip sub-parameters
		if strings.Contains(paramName, "> ") {
			paramEle = paramEle.Next()
			continue
		}
		schemaName := fmt.Sprintf("%sParam%s", endpoint.OperationID, strings.Title(paramName))
		schema, err := createSchema(schemaName, paramType, paramName, paramEle)
		if err != nil {
			return fmt.Errorf("creating schema: %w", err)
		}
		schema.Deprecated = isParameterDeprecated(description)
		schema.Description = generateParamDesc(children.Last().Nodes[0])

		if endpoint.Method == parser.MethodGet || endpoint.Method == parser.MethodDelete {
			paramIn := "query"
			if strings.Contains(endpoint.Path, "{"+paramName+"}") {
				paramIn = "path"
			}
			// Create the parameter
			param := &parser.Parameter{
				Name:        paramName,
				Required:    required,
				In:          paramIn,
				Schema:      schema,
				Description: schema.Description,
			}
			endpoint.Parameters = append(endpoint.Parameters, param)
		} else {
			if endpoint.RequestBody == nil {
				endpoint.RequestBody = &parser.RequestBody{
					Content: map[string]*parser.MediaType{
						parser.ContentTypeJSON: {
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
			endpoint.RequestBody.Content[parser.ContentTypeJSON].Schema.Properties[paramName] = schema
			if required {
				endpoint.RequestBody.Content[parser.ContentTypeJSON].Schema.Required = append(endpoint.RequestBody.Content[parser.ContentTypeJSON].Schema.Required, paramName)
			}
		}
		paramEle = paramEle.Next()
	}
	return nil
}

func (p *DocumentParser) generateRespSchema(endpoint *parser.Endpoint, respTableEle *goquery.Selection) (*parser.Schema, error) {
	paramEle := respTableEle.Find("tbody > tr").First()
	respSchema := &parser.Schema{
		Type:       parser.ObjectType,
		Properties: make(map[string]*parser.Schema),
	}
	for paramEle.Length() > 0 {
		children := paramEle.Children()
		vals := make([]string, children.Length())

		children.Each(func(i int, s *goquery.Selection) {
			vals[i] = s.Text()
		})
		paramName, paramType := vals[0], vals[1]
		if strings.Contains(paramName, "> ") || strings.Contains(paramName, ">> ") {
			paramEle = paramEle.Next()
			continue
		}
		schemaName := fmt.Sprintf("%sResp%s", endpoint.OperationID, strings.Title(paramName))
		schema, err := createSchema(schemaName, paramType, paramName, paramEle)
		schema.Description = generateParamDesc(children.Last().Nodes[0])
		schema.Deprecated = isParameterDeprecated(schema.Description)
		if err != nil {
			return nil, fmt.Errorf("creating schema: %w", err)
		}
		respSchema.Properties[paramName] = schema
		paramEle = paramEle.Next()
	}
	return respSchema, nil
}

func (p *DocumentParser) extractResponse(endpoint *parser.Endpoint, endpointDocSection *EndpointDocumentSection) error {
	// Create a default 200 OK response
	response := &parser.Response{
		Description: "Successful operation",
	}

	respExampleText := ""
	respExampleEle := endpointDocSection.ResponseExample
	if respExampleEle != nil {
		respExampleText = p.generateRespExample(respExampleEle)
	}

	response.Content = map[string]*parser.MediaType{
		"application/json": {
			Schema: &parser.Schema{
				Title: fmt.Sprintf("%sResp", endpoint.OperationID),
				Type:  parser.ObjectType,
				Properties: map[string]*parser.Schema{
					"code": {
						Type:    parser.StringType,
						Default: "",
					},
					"msg": {
						Type:    parser.StringType,
						Default: "",
					},
					"data": {
						Title: fmt.Sprintf("%sData", endpoint.OperationID),
						Type:  parser.ArrayType,
					},
				},
				Example: respExampleText,
			},
		},
	}

	if respSchema, ok := ManualAPISchemaMap[endpoint.Path]; ok {
		logrus.Warnf("Manual API schema found for %s", endpoint.Path)
		response.Content[parser.ContentTypeJSON].Schema.Properties["data"].Items = &respSchema
		endpoint.Responses["200"] = response
		return nil
	}
	if checkResponseIsArranged(endpointDocSection.ExtraElements) {
		logrus.Warn("Response is arranged in an array")
		respSchema := &parser.Schema{
			Type: parser.ArrayType,
			Items: &parser.Schema{
				Type: parser.StringType,
			},
		}
		response.Content[parser.ContentTypeJSON].Schema.Properties["data"].Items = respSchema
		endpoint.Responses["200"] = response
		return nil
	}

	if endpointDocSection.ResponseParametersTable == nil {
		response.Content[parser.ContentTypeJSON].Schema.Properties["data"].Items = &parser.Schema{
			Type: parser.StringType,
		}
		endpoint.Responses["200"] = response
		return nil
	}

	respSchema, err := p.generateRespSchema(endpoint, endpointDocSection.ResponseParametersTable)
	if err != nil {
		return fmt.Errorf("generating response schema: %w", err)
	}

	_, codeExists := respSchema.Properties["code"]
	_, msgExists := respSchema.Properties["msg"]
	dataSchema, dataExists := respSchema.Properties["data"]
	if codeExists && msgExists && dataExists {
		logrus.Warnf("duplicate property found in %s", endpoint.Path)
		response.Content[parser.ContentTypeJSON].Schema.Properties["data"].Items = dataSchema.Items
	} else {
		response.Content[parser.ContentTypeJSON].Schema.Properties["data"].Items = respSchema
	}

	endpoint.Responses["200"] = response
	return nil
}

func (p *DocumentParser) processEndpoint(endpoint *parser.Endpoint, protectedEndpoints []string) {
	// Check if the endpoint is protected
	if slices.Contains(protectedEndpoints, fmt.Sprintf("%s %s", strings.ToUpper(endpoint.Method), endpoint.Path)) {
		endpoint.Protected = true
	}
	p.processResponses(endpoint)
	p.processSecurities(endpoint)
}

func (p *DocumentParser) processResponses(endpoint *parser.Endpoint) {
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
		Description: "OKX API error",
		Type:        parser.ObjectType,
		Properties: map[string]*parser.Schema{
			"code": {
				Type: parser.StringType,
			},
			"msg": {
				Type: parser.StringType,
			},
		},
	})
}

func (p *DocumentParser) processSecurities(endpoint *parser.Endpoint) {
	// okx use multiple api keys
	// see https://swagger.io/docs/specification/v3_0/authentication/api-keys/#multiple-api-keys
	if endpoint.SecuritySchemas == nil {
		endpoint.SecuritySchemas = make(map[string]*parser.SecuritySchema)
	}

	requireAuth := checkEndpointIsProtected(endpoint.Description)

	if requireAuth {
		if endpoint.Security == nil {
			endpoint.Security = make([]map[string][]string, 0)
		}

		authHeaders := map[string][]string{}
		for key, value := range AuthHeaderMap {
			endpoint.SecuritySchemas[key] = &parser.SecuritySchema{
				Type: parser.SecurityTypeApiKey,
				In:   parser.SecurityLocationHeader,
				Name: value,
			}
			authHeaders[key] = []string{}
		}
		endpoint.Security = append(endpoint.Security, authHeaders)
	}
}
