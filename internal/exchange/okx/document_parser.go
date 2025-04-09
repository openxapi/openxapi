package okx

import (
	"fmt"
	"io"
	URL "net/url"
	"regexp"
	"slices"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/openxapi/openxapi/internal/parser"
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

// DocumentParser is a parser for OKX documents
type DocumentParser struct {
	parser.HTTPDocumentParser
	docType string
}

type OkxSubAPIGroup struct {
	GroupName    string
	SubGroupName string
	SubGroupID   string
}

func checkResponseIsArranged(table *goquery.Selection) bool {
	ele := table.Next()
	content := ""
	for ele.Length() > 0 {
		if ele.Is("h3") {
			break
		}
		if ele.Is("aside") || ele.Is("p") {
			content += ele.Text()
		}
		ele = ele.Next()
	}
	return strings.Contains(strings.ToLower(content), "arranged in an array ")
}

func isParameterDeprecated(paramDesc string) bool {
	return strings.Contains(strings.ToLower(paramDesc), "deprecated")
}

func formatParameterDescription(paramEle *html.Node) string {
	nodes := paramEle.ChildNodes()
	description := ""
	for node := range nodes {
		if node.Type == html.TextNode {
			description += node.Data
		} else if node.Type == html.ElementNode {
			switch strings.ToLower(node.Data) {
			case "del":
				description += formatParameterDescription(node)
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

func checkEndpointIsProtected(rateLimitRule string) bool {
	if !strings.Contains(strings.ToLower(rateLimitRule), "user id") {
		return false
	}

	// Todo optional
	if strings.Contains(strings.ToLower(rateLimitRule), " or ") {
		return false
	}
	return true
}

func operationID(docType, method, path string) string {
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
	path = strings.Join(strings.Split(strings.Title(strings.ReplaceAll(path, "/", " ")), " "), "")
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

func generateObjectSchema(row *goquery.Selection, objName string, prefix string) *parser.Schema {
	schema := &parser.Schema{
		Type:       parser.ObjectType,
		Properties: make(map[string]*parser.Schema),
	}
	row = row.Next()
	for row.Length() > 0 {
		children := row.Children()
		rowVals := make([]string, children.Length())
		children.Each(func(i int, s *goquery.Selection) {
			rowVals[i] = s.Text()
		})
		paramName, paramType := rowVals[0], rowVals[1]
		if !strings.Contains(paramName, prefix) {
			break
		}

		subSchema, _ := createSchema(objName, paramType, paramName, row)
		subSchema.Description = formatParameterDescription(children.Last().Nodes[0])
		subSchema.Deprecated = isParameterDeprecated(subSchema.Description)

		paramName = strings.Split(paramName, " ")[1]
		schema.Properties[paramName] = subSchema
		row = row.Next()
	}
	return schema
}

// createSchema creates a schema based on the parameter type
func createSchema(name, paramType, paramName string, row *goquery.Selection) (*parser.Schema, error) {
	typ := normalizeType(paramType)
	switch typ {
	case parser.ObjectType:
		prefix := "> "
		if strings.Contains(paramName, prefix) {
			prefix = ">" + strings.Split(paramName, " ")[0] + " "
		}
		schema := generateObjectSchema(row, paramName, prefix)
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
		prefix := "> "
		if strings.Contains(paramName, prefix) {
			prefix = ">" + strings.Split(paramName, " ")[0] + " "
		}
		itemsSchema := generateObjectSchema(row, paramName, prefix)
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

func generateSubAPIGroupName(apiHeader string) string {
	subAPIGroupName := strings.ToLower(apiHeader)
	subAPIGroupName = strings.ReplaceAll(subAPIGroupName, "'", " 39 ")
	subAPIGroupName = strings.ReplaceAll(subAPIGroupName, "&", " amp ")
	subAPIGroupName = strings.ReplaceAll(subAPIGroupName, "/", " ")
	subAPIGroupName = strings.ReplaceAll(subAPIGroupName, "  ", "")
	subAPIGroupName = strings.ReplaceAll(subAPIGroupName, "(", "")
	subAPIGroupName = strings.ReplaceAll(subAPIGroupName, " ", "-")
	subAPIGroupName = strings.ReplaceAll(subAPIGroupName, ")", "")
	return subAPIGroupName
}

// generateEndpointDesc generates the endpoint description using the CommonMark spec
func (p *DocumentParser) generateEndpointDesc(line *goquery.Selection, subAPIGroupID, subAPIGroupName string) string {
	endpointDesc := ""
	for line.Length() > 0 {
		if line.Length() == 0 {
			continue
		}
		if line.Is(fmt.Sprintf("h4[id*='%s-%s-http']", subAPIGroupID, subAPIGroupName)) {
			break
		}
		if line.Is("p") {
			endpointDesc += formatParameterDescription(line.Nodes[0]) + "\n\n"
		}
		if line.Is("h4") {
			endpointDesc += fmt.Sprintf("#### %s \n\n", line.Text())
		}
		if line.Is("aside") {
			endpointDesc += fmt.Sprintf("**_%s_**\n\n", strings.ReplaceAll(line.Text(), "\n", ""))
		}
		line = line.Next()
	}
	return endpointDesc
}

func (p *DocumentParser) generateEndpointSummary(line *goquery.Selection, subAPIGroupID, subAPIGroupName string) string {
	endpointDesc := ""
	for line.Length() > 0 {
		if line.Length() == 0 {
			continue
		}
		if line.Is(fmt.Sprintf("h4[id*='%s-%s-http']", subAPIGroupID, subAPIGroupName)) {
			break
		}
		if line.Is("p") {
			endpointDesc += formatParameterDescription(line.Nodes[0]) + "\n\n"
		}
		line = line.Next()
	}
	return endpointDesc
}

func (p *DocumentParser) generateRespExample(respEle *goquery.Selection) string {
	anchor := respEle
	for anchor.Length() > 0 {
		if anchor.Is("div[class='highlight']") {
			code := anchor.Find("code").First()
			if code.Length() == 0 {
				return ""
			}
			return code.Text()
		}
		if anchor.Is("h4[id*='permission-read']") {
			break
		}
		anchor = anchor.Prev()
	}
	return ""
}

func (p *DocumentParser) Parse(r io.Reader, url string, docType string, protectedEndpoints []string) ([]parser.Endpoint, error) {
	u, err := URL.Parse(url)
	if err != nil {
		return nil, fmt.Errorf("parsing URL: %w", err)
	}

	p.docType = docType
	// Parse HTML document
	document, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML: %w", err)
	}

	// https://www.okx.com/docs-v5/en/#order-book-trading
	apiGroupID := u.EscapedFragment()
	subAPIGroups := map[string]*OkxSubAPIGroup{}
	items := strings.Split(apiGroupID, "-")
	for idx, item := range items {
		items[idx] = strings.Title(strings.ToLower(item))
	}
	apiGroupName := strings.Join(items, " ")
	// https://www.okx.com/docs-v5/en/#order-book-trading-trade
	subGroupAPIElements := document.Find(fmt.Sprintf("h2[id*='%s']", apiGroupID))
	subGroupAPIElements.Each(func(i int, subCategory *goquery.Selection) {
		subAPIGroupID, exists := subCategory.Attr("id")
		if exists {
			items := strings.Split(subCategory.Text(), "-")
			for idx, item := range items {
				items[idx] = strings.Title(strings.ToLower(item))
			}
			subGroupName := strings.Join(items, " ")
			// skip websocket endpoints
			if !strings.Contains(strings.ToLower(subAPIGroupID), "websocket") {
				subAPIGroups[subAPIGroupID] = &OkxSubAPIGroup{
					GroupName:    apiGroupName,
					SubGroupName: subGroupName,
					SubGroupID:   subAPIGroupID,
				}
			}
		}
	})

	var endpoints []parser.Endpoint

	for subAPIGroupID, subAPIGroup := range subAPIGroups {
		apiSections := document.Find("h3[id*=" + subAPIGroupID + "]")
		apiSections.Each(func(i int, header *goquery.Selection) {
			headerText := header.Text()

			var endpoint = &parser.Endpoint{}

			endpoint.Tags = []string{subAPIGroup.GroupName}
			if !strings.Contains(subAPIGroupID, "rest-api") {
				endpoint.Tags = []string{subAPIGroup.SubGroupName}
			} else {
				endpoint.Tags = []string{subAPIGroup.GroupName}
			}

			endpoint.Extensions = make(map[string]interface{})
			endpoint.Responses = make(map[string]*parser.Response)
			subAPIGroupName := generateSubAPIGroupName(headerText)
			endpoint.Description = p.generateEndpointDesc(header, subAPIGroupID, subAPIGroupName)
			endpoint.Summary = p.generateEndpointSummary(header, subAPIGroupID, subAPIGroupName)

			requestInfoEle := document.Find(fmt.Sprintf("h4[id*='%s-%s-http'] + p > code", subAPIGroupID, subAPIGroupName))
			if requestInfoEle.Length() == 0 {
				logrus.Debugf("Request info not found for %s", headerText)
				return
			}

			requestInfo := strings.Split(requestInfoEle.Text(), " ")
			if len(requestInfo) < 2 {
				logrus.Debugf("Request info not found for %s", headerText)
				return
			}

			method, path := requestInfo[0], requestInfo[1]
			endpoint.Method = method
			endpoint.Path = path
			endpoint.OperationID = operationID(p.docType, endpoint.Method, path)

			rateLimitRuleSelector := fmt.Sprintf("h4[id*='%s-%s-rate-limit-rule']", subAPIGroupID, subAPIGroupName)
			rateLimitRuleEle := document.Find(rateLimitRuleSelector).First()
			p.processEndpoint(endpoint, protectedEndpoints, rateLimitRuleEle)

			requestParamSelector := fmt.Sprintf("h4[id='%s-%s-%s']", subAPIGroupID, subAPIGroupName, "request-parameters")
			isRequestParamsEleExists := document.Find(requestParamSelector).Length() > 0
			if isRequestParamsEleExists {
				requestParamsTableEle := document.Find(fmt.Sprintf("h4[id='%s-%s-%s'] + table", subAPIGroupID, subAPIGroupName, "request-parameters"))
				p.extractParameters(endpoint, requestParamsTableEle)
			}

			responseParamSelector := fmt.Sprintf("h4[id='%s-%s-%s'] + table", subAPIGroupID, subAPIGroupName, "response-parameters")
			responseTableElement := document.Find(responseParamSelector)

			p.extractResponse(endpoint, responseTableElement)
			endpoints = append(endpoints, *endpoint)
		})
	}

	return endpoints, nil
}

// extractParameters extracts parameters from the endpoint description
func (p *DocumentParser) extractParameters(endpoint *parser.Endpoint, parametersTable *goquery.Selection) error {
	row := parametersTable.Find("tbody > tr").First()
	for row.Length() > 0 {
		children := row.Children()
		vals := make([]string, children.Length())

		children.Each(func(i int, s *goquery.Selection) {
			vals[i] = s.Text()
		})
		paramName, paramType, requiredText, description := vals[0], vals[1], vals[2], vals[3]
		required := strings.Contains(strings.ToLower(requiredText), "yes")
		if strings.Contains(paramName, "> ") {
			row = row.Next()
			continue
		}
		schema, err := createSchema(fmt.Sprintf("%sParam%s", endpoint.OperationID, strings.Title(paramName)), paramType, paramName, row)
		if err != nil {
			return fmt.Errorf("creating schema: %w", err)
		}
		schema.Deprecated = isParameterDeprecated(description)
		schema.Description = formatParameterDescription(children.Last().Nodes[0])
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
		row = row.Next()
	}
	return nil
}

func (p *DocumentParser) extractResponse(endpoint *parser.Endpoint, table *goquery.Selection) error {
	// Create a default 200 OK response
	response := &parser.Response{
		Description: "Successful operation",
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
				Example: p.generateRespExample(table),
			},
		},
	}

	if respSchema, ok := ManualAPISchemaMap[endpoint.Path]; ok {
		logrus.Debugf("Manual API schema found for %s", endpoint.Path)
		response.Content[parser.ContentTypeJSON].Schema.Properties["data"].Items = &respSchema
		endpoint.Responses["200"] = response
		return nil
	}
	if checkResponseIsArranged(table) {
		logrus.Debug("Response is arranged in an array")
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
	row := table.Find("tbody > tr").First()
	respSchema := &parser.Schema{
		Type:       parser.ObjectType,
		Properties: make(map[string]*parser.Schema),
	}
	for row.Length() > 0 {
		children := row.Children()
		vals := make([]string, children.Length())

		children.Each(func(i int, s *goquery.Selection) {
			vals[i] = s.Text()
		})
		paramName, paramType := vals[0], vals[1]
		if strings.Contains(paramName, "> ") || strings.Contains(paramName, ">> ") {
			row = row.Next()
			continue
		}
		schema, err := createSchema(fmt.Sprintf("%sResp%s", endpoint.OperationID, strings.Title(paramName)), paramType, paramName, row)
		schema.Description = formatParameterDescription(children.Last().Nodes[0])
		schema.Deprecated = isParameterDeprecated(schema.Description)
		if err != nil {
			return fmt.Errorf("creating schema: %w", err)
		}
		respSchema.Properties[paramName] = schema
		row = row.Next()
	}
	_, codeExists := respSchema.Properties["code"]
	_, msgExists := respSchema.Properties["msg"]
	dataSchema, dataExists := respSchema.Properties["data"]
	if codeExists && msgExists && dataExists {
		logrus.Debugf("duplicate property found in %s", endpoint.Path)
		response.Content[parser.ContentTypeJSON].Schema.Properties["data"].Items = dataSchema.Items
	} else {
		response.Content[parser.ContentTypeJSON].Schema.Properties["data"].Items = respSchema
	}

	endpoint.Responses["200"] = response
	return nil
}

func (p *DocumentParser) processEndpoint(endpoint *parser.Endpoint, protectedEndpoints []string, rateLimitRuleEle *goquery.Selection) {
	// Check if the endpoint is protected
	if slices.Contains(protectedEndpoints, fmt.Sprintf("%s %s", strings.ToUpper(endpoint.Method), endpoint.Path)) {
		endpoint.Protected = true
	}
	p.processResponses(endpoint)
	p.processSecurities(endpoint, rateLimitRuleEle)
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

func (p *DocumentParser) processSecurities(endpoint *parser.Endpoint, rateLimitRuleEle *goquery.Selection) {
	// okx use multiple api keys
	// see https://swagger.io/docs/specification/v3_0/authentication/api-keys/#multiple-api-keys
	if endpoint.SecuritySchemas == nil {
		endpoint.SecuritySchemas = make(map[string]*parser.SecuritySchema)
	}

	requireAuth := false
	if rateLimitRuleEle.Length() > 0 {
		requireAuth = checkEndpointIsProtected(rateLimitRuleEle.Text())
	}

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
