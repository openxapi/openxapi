package bybit

import (
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"regexp"
	"slices"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/openxapi/openxapi/internal/parser"
	"github.com/sirupsen/logrus"
	"golang.org/x/net/html"
)

const DocumentURL string = "https://bybit-exchange.github.io"

type EndpointDocumentSection struct {
	Title                   *goquery.Selection
	Description             []*goquery.Selection
	RequestMethodAndPath    *goquery.Selection
	RequestParametersTable  *goquery.Selection
	ResponseExample         *goquery.Selection
	ResponseParametersTable *goquery.Selection
}

// DocumentParser is a parser for Bybit documents
type DocumentParser struct {
	parser.HTTPDocumentParser
	docType string
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

func operationID(method, path string) string {
	// GET /v5/spread/instrument -> GetSpreadInstrumentV5
	pathRegex := regexp.MustCompile(`^/v(\d+)/(.+)/(.+)$`)
	matches := pathRegex.FindStringSubmatch(path)
	if len(matches) == 4 {
		var action string
		items := strings.Split(matches[3], "-")
		for _, item := range items {
			action += strings.Title(item)
		}
		path = fmt.Sprintf("%s%sV%s", strings.Title(matches[2]), action, matches[1])
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

		paramName = strings.Split(paramName, " ")[1]
		schema.Properties[paramName] = subSchema
		subParamEle = subParamEle.Next()
	}
	return schema
}

// createSchema creates a schema based on the parameter type
func createSchema(name, paramType, paramName string, paramEle *goquery.Selection) (*parser.Schema, error) {
	typ := determineParamType(paramEle)
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

// normalizeType converts Bybit types to OpenAPI types
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
	case "ARRAY":
		return parser.ArrayType
	case "ARRAY OF OBJECTS", "ARRAY OF OBJECT", "ARRAY<OBJECT>":
		return parser.ArrayOfObjectType
	case "ARRAY OF ARRAY":
		return parser.ArrayOfArrayType
	case "OBJECT":
		return parser.ObjectType
	default:
		return parser.StringType
	}
}

func determineParamType(param *goquery.Selection) string {
	itemsCount := param.Children().Size()

	paramName := param.Children().First().Text()
	paramDesc := param.Children().Last().Text()
	paramRawType := param.Children().Eq(itemsCount - 2).Text()
	paramType := normalizeType(paramRawType)
	if paramType == parser.ArrayType {
		if strings.Contains(strings.ToLower(paramDesc), "object") {
			paramType = parser.ArrayOfObjectType
		}
		subItemParam := param.Next()
		if subItemParam.Size() == 0 {
			paramType = parser.ArrayOfStringType
		} else {
			subItemParamName := subItemParam.Children().First().Text()
			elePrefix := "> "
			if strings.Contains(paramName, elePrefix) {
				elePrefix = ">" + strings.Split(paramName, " ")[0] + " "
			}
			if strings.Contains(subItemParamName, elePrefix) {
				indexRegexp := regexp.MustCompile(`.*?\[(\d+)\]`)
				if indexRegexp.MatchString(subItemParamName) {
					return parser.ArrayOfStringType
				}
				return parser.ArrayOfObjectType
			}
			return parser.ArrayOfStringType
		}
	}
	return paramType
}

func fixInvalidJSON(invalidJSON string) string {
	// remove comment and extra commas
	etcRegexp := regexp.MustCompile(`\s+[\.]+?\s+`)
	commentRegexp := regexp.MustCompile(`(\s+|,)(//|#).*`)
	commentRegexp1 := regexp.MustCompile(`^//(\s)+?.*(\s)+?`)
	extraCommasRegexp := regexp.MustCompile(`,(\s*?(]|}))`)
	result := commentRegexp.ReplaceAllString(invalidJSON, "$1")
	result = commentRegexp1.ReplaceAllString(result, "")
	result = etcRegexp.ReplaceAllString(result, "")
	result = extraCommasRegexp.ReplaceAllString(result, "$1")
	return result
}

// generateEndpointDesc generates the endpoint description using the CommonMark spec
func (p *DocumentParser) generateEndpointDesc(endpointDescElements []*goquery.Selection) string {
	endpointDesc := ""
	for _, ele := range endpointDescElements {
		endpointDesc += ele.Text() + "\n\n"
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
	respExampleText = ""
	respEle.Children().Each(func(i int, s *goquery.Selection) {
		respExampleText += s.Text() + "\n"
	})
	respExampleText = fixInvalidJSON(respExampleText)
	if !json.Valid([]byte(respExampleText)) {
		logrus.Debugf("Invalid JSON response example: %s", respExampleText)
		return ""
	}

	return respExampleText
}

func (p *DocumentParser) extractRequestMethodAndPath(endpoint *parser.Endpoint, ele *goquery.Selection) error {
	reqRegex := regexp.MustCompile(`(?i)(GET|POST|PUT|DELETE|PATCH)\s+(/v\d+/[^ ]+)`)
	matches := reqRegex.FindStringSubmatch(ele.Text())
	if len(matches) != 3 {
		return fmt.Errorf("request method and path not found")
	}
	endpoint.Method = strings.ToUpper(matches[1])
	endpoint.Path = matches[2]
	return nil
}

func (p *DocumentParser) extractEndpointDocumentSection(document *goquery.Document) *EndpointDocumentSection {
	endpointSection := &EndpointDocumentSection{
		Title: document.Find("h1").First(),
	}

	// extract endpoint description
	endpointContentEle := document.Find("div[class='row'] > div[class='col col--12']")
	contentStartEle := endpointContentEle.Children().First()
	if contentStartEle.Is("p") {
		endpointSection.Description = append(endpointSection.Description, contentStartEle)
	}
	if !contentStartEle.Is("h3") {
		contentStartEle.NextUntil("h3#http-request").Each(func(i int, ele *goquery.Selection) {
			tagName := goquery.NodeName(ele)
			switch tagName {
			case "p":
				endpointSection.Description = append(endpointSection.Description, ele)
			case "ul":
				ele.Find("li").Each(func(i int, liEle *goquery.Selection) {
					endpointSection.Description = append(endpointSection.Description, liEle)
				})
			case "blockquote":
				if ele.Children().Size() > 0 {
					ele.Find("p").Each(func(i int, pEle *goquery.Selection) {
						endpointSection.Description = append(endpointSection.Description, pEle)
					})
				}
			}
		})
	}

	// extract information
	endpointContentEle.Find("div.theme-admonition-info p").Each(func(i int, infoEle *goquery.Selection) {
		if strings.Contains(infoEle.Text(), "authentication") {
			endpointSection.Description = append(endpointSection.Description, infoEle)
		}
	})

	// extract request method and path
	requestMethodAndPathEle := endpointContentEle.Find("h3#http-request + p").First()
	codeEle := requestMethodAndPathEle.Find("code").First()
	if codeEle.Size() > 0 {
		requestInfo := requestMethodAndPathEle.Text()
		reqRegex := regexp.MustCompile(`(?i)(GET|POST|PUT|DELETE|PATCH)\s+(/v\d+/[^ ]+)`)
		if reqRegex.MatchString(requestInfo) {
			endpointSection.RequestMethodAndPath = requestMethodAndPathEle
		}
	}

	// extract request parameters table
	endpointSection.RequestParametersTable = endpointContentEle.Find("h3#request-parameters +  table").First()

	// extract response parameters table
	endpointSection.ResponseParametersTable = endpointContentEle.Find("h3#response-parameters + table").First()

	// extract response example
	endpointSection.ResponseExample = endpointContentEle.Find("h3#response-example + div.language-json > div > pre >code").First()

	return endpointSection
}

func (p *DocumentParser) Parse(r io.Reader, docURL string, docType string, protectedEndpoints []string) ([]parser.Endpoint, error) {
	u, err := url.Parse(docURL)
	if err != nil {
		return nil, fmt.Errorf("parsing URL: %w", err)
	}

	p.docType = docType
	// Parse HTML document
	document, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML: %w", err)
	}

	category := "Public"
	categoryEle := document.Find("li.theme-doc-sidebar-item-category-level-1:not(.menu__list-item--collapsed) > div > a").First()
	if categoryEle.Size() > 0 {
		category = categoryEle.Text()
	}

	var endpoints []parser.Endpoint
	endpointTitleEle := document.Find("h1").First()
	endpointTitle := endpointTitleEle.Text()

	logrus.Infof("Parsing endpoint section: %s", endpointTitle)
	logrus.Debugf("Endpoint URL: %s", u.String())

	var endpoint = &parser.Endpoint{}

	endpoint.Tags = []string{category}

	endpoint.Extensions = make(map[string]interface{})
	endpoint.Responses = make(map[string]*parser.Response)

	endpointDocSection := p.extractEndpointDocumentSection(document)

	if endpointDocSection.RequestMethodAndPath == nil {
		logrus.Debugf("Request method and path not found : %s", document.Url)
		return nil, fmt.Errorf("invalid endpoint document")
	}

	endpoint.Description = p.generateEndpointDesc(endpointDocSection.Description)

	endpoint.Summary = endpointTitle

	err = p.extractRequestMethodAndPath(endpoint, endpointDocSection.RequestMethodAndPath)
	if err != nil {
		logrus.Errorf("Extracting request method and path error: %s", err)
		return nil, err
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

		paramName, paramType, requiredText := vals[0], vals[1], vals[2]
		required := strings.Contains(strings.ToLower(requiredText), "true")

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
		// schema.Deprecated = isParameterDeprecated(description)
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
		// schema.Deprecated = isParameterDeprecated(schema.Description)
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
					"retCode": {
						Type:    parser.IntegerType,
						Default: "",
					},
					"retMsg": {
						Type:    parser.StringType,
						Default: "",
					},
					"result": {
						Title: fmt.Sprintf("%sResult", endpoint.OperationID),
						Type:  parser.ObjectType,
					},
					"retExtInfo": {
						Type: parser.ObjectType,
					},
					"time": {
						Type: parser.IntegerType,
					},
				},
				Example: respExampleText,
			},
		},
	}

	respSchema, err := p.generateRespSchema(endpoint, endpointDocSection.ResponseParametersTable)
	if err != nil {
		return fmt.Errorf("generating response schema: %w", err)
	}

	response.Content[parser.ContentTypeJSON].Schema.Properties["result"] = respSchema

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
		Description: "BYBIT API error",
		Type:        parser.ObjectType,
		Properties: map[string]*parser.Schema{
			"retCode": {
				Type: parser.StringType,
			},
			"retMsg": {
				Type: parser.StringType,
			},
		},
	})
}

func (p *DocumentParser) processSecurities(endpoint *parser.Endpoint) {
	if endpoint.SecuritySchemas == nil {
		endpoint.SecuritySchemas = make(map[string]*parser.SecuritySchema)
	}
	needAuth := true
	description := strings.ToLower(endpoint.Description)
	if strings.HasPrefix(endpoint.Path, "/v5/market") || strings.Contains(description, "does not need authentication") {
		needAuth = false
	}

	if needAuth {
		endpoint.SecuritySchemas["ApiKey"] = &parser.SecuritySchema{
			Type: parser.SecurityTypeApiKey,
			In:   parser.SecurityLocationHeader,
			Name: "X-BAPI-API-KEY",
		}
		if endpoint.Security == nil {
			endpoint.Security = make([]map[string][]string, 0)
		}
		endpoint.Security = append(endpoint.Security, map[string][]string{
			"ApiKey": {},
		})
	}
}
