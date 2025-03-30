package binance

import (
	"fmt"
	"testing"

	"github.com/adshao/openxapi/internal/parser"
	"github.com/stretchr/testify/assert"
)

func TestExtractEndpoint(t *testing.T) {
	// Create a document parser
	docParser := &SpotDocumentParser{
		DocumentParser: &DocumentParser{},
	}

	// Test with a simple endpoint
	content := []string{
		"Test connectivity",
		"GET /api/v3/ping",
		"Test connectivity to the Rest API.",
		"Weight: 1",
		"Parameters: NONE",
		"Data Source: Memory",
		"Response: {}",
	}

	endpoint, ok := docParser.extractEndpoint(content, "General")

	assert.True(t, ok, "Should have extracted the endpoint")
	assert.Equal(t, "GET", endpoint.Method)
	assert.Equal(t, "/api/v3/ping", endpoint.Path)
	assert.Equal(t, "Test connectivity", endpoint.Summary)
	assert.Equal(t, "Test connectivity to the Rest API.", endpoint.Description)
	assert.Equal(t, "1", endpoint.Extensions["x-weight"])
	assert.Equal(t, "Memory", endpoint.Extensions["x-data-source"])
	assert.Empty(t, endpoint.Parameters)
	assert.Contains(t, endpoint.Responses, "200")

	// Verify response content
	response, exists := endpoint.Responses["200"]
	assert.True(t, exists, "Should have a 200 response")
	assert.Equal(t, "Successful operation", response.Description)
	assert.Contains(t, response.Content, "application/json")
}

func TestExtractParameters(t *testing.T) {
	// Create a document parser
	docParser := &SpotDocumentParser{
		DocumentParser: &DocumentParser{},
	}

	// Create a test endpoint directly
	endpoint := parser.Endpoint{
		Method:      "GET",
		Path:        "/api/v3/exchangeInfo",
		Summary:     "Exchange Information",
		Description: "Current exchange trading rules and symbol information",
		Parameters:  []*parser.Parameter{},
		Extensions:  map[string]interface{}{"x-weight": "20", "x-data-source": "Memory"},
	}

	// Set the table content directly
	docParser.tableContent = `<thead><tr><th>Name</th><th>Type</th><th>Mandatory</th><th>Description</th></tr></thead><tbody><tr><td>symbol</td><td>STRING</td><td>No</td><td>Example: curl -X GET &#34;<a href="https://api.binance.com/api/v3/exchangeInfo?symbol=BNBBTC" target="_blank" rel="noopener noreferrer">https://api.binance.com/api/v3/exchangeInfo?symbol=BNBBTC</a>&#34;</td></tr><tr><td>symbols</td><td>ARRAY OF STRING</td><td>No</td><td>Examples: curl -X GET &#34;<a href="https://api.binance.com/api/v3/exchangeInfo?symbols=%5B%22BNBBTC%22,%22BTCUSDT%22%5D" target="_blank" rel="noopener noreferrer">https://api.binance.com/api/v3/exchangeInfo?symbols=%5B%22BNBBTC%22,%22BTCUSDT%22%5D</a>&#34; <br/> or <br/> curl -g -X  GET &#39;<a href="https://api.binance.com/api/v3/exchangeInfo?symbols=%5B%22BTCUSDT%22,%22BNBBTC" target="_blank" rel="noopener noreferrer">https://api.binance.com/api/v3/exchangeInfo?symbols=[&#34;BTCUSDT&#34;,&#34;BNBBTC</a>&#34;]&#39;</td></tr><tr><td>permissions</td><td>ENUM</td><td>No</td><td>Examples: curl -X GET &#34;<a href="https://api.binance.com/api/v3/exchangeInfo?permissions=SPOT" target="_blank" rel="noopener noreferrer">https://api.binance.com/api/v3/exchangeInfo?permissions=SPOT</a>&#34; <br/> or <br/> curl -X GET &#34;<a href="https://api.binance.com/api/v3/exchangeInfo?permissions=%5B%22MARGIN%22%2C%22LEVERAGED%22%5D" target="_blank" rel="noopener noreferrer">https://api.binance.com/api/v3/exchangeInfo?permissions=%5B%22MARGIN%22%2C%22LEVERAGED%22%5D</a>&#34; <br/> or <br/> curl -g -X GET &#39;<a href="https://api.binance.com/api/v3/exchangeInfo?permissions=%5B%22MARGIN%22,%22LEVERAGED" target="_blank" rel="noopener noreferrer">https://api.binance.com/api/v3/exchangeInfo?permissions=[&#34;MARGIN&#34;,&#34;LEVERAGED</a>&#34;]&#39;</td></tr><tr><td>showPermissionSets</td><td>BOOLEAN</td><td>No</td><td>Controls whether the content of the <code>permissionSets</code> field is populated or not. Defaults to <code>true</code></td></tr><tr><td>symbolStatus</td><td>ENUM</td><td>No</td><td>Filters symbols that have this <code>tradingStatus</code>. Valid values: <code>TRADING</code>, <code>HALT</code>, <code>BREAK</code> <br/> Cannot be used in combination with <code>symbols</code> or <code>symbol</code>.</td></tr></tbody>`

	docParser.extractParameters(&endpoint)

	// Check that parameters were extracted
	assert.Equal(t, 5, len(endpoint.Parameters), "Should have extracted 5 parameters")

	// Check each parameter by name
	paramMap := make(map[string]*parser.Parameter)
	for _, param := range endpoint.Parameters {
		paramMap[param.Name] = param
	}

	// Check symbol parameter
	symbolParam, ok := paramMap["symbol"]
	assert.True(t, ok, "Should have extracted the symbol parameter")
	assert.Equal(t, "string", symbolParam.Schema.Type)
	assert.False(t, symbolParam.Required)
	assert.Contains(t, symbolParam.Description, "Example:")

	// Check symbols parameter
	symbolsParam, ok := paramMap["symbols"]
	assert.True(t, ok, "Should have extracted the symbols parameter")
	assert.Equal(t, "array", symbolsParam.Schema.Type)
	assert.NotNil(t, symbolsParam.Schema.Items, "Should have items schema for array type")
	assert.Equal(t, "string", symbolsParam.Schema.Items.Type)
	assert.False(t, symbolsParam.Required)

	// Check permissions parameter
	permissionsParam, ok := paramMap["permissions"]
	assert.True(t, ok, "Should have extracted the permissions parameter")
	assert.Equal(t, "string", permissionsParam.Schema.Type)
	assert.False(t, permissionsParam.Required)

	// Check showPermissionSets parameter
	showPermissionSetsParam, ok := paramMap["showPermissionSets"]
	assert.True(t, ok, "Should have extracted the showPermissionSets parameter")
	assert.Equal(t, "boolean", showPermissionSetsParam.Schema.Type)
	assert.Contains(t, showPermissionSetsParam.Description, "Defaults to `true`")
	assert.False(t, showPermissionSetsParam.Required)

	// Check symbolStatus parameter
	symbolStatusParam, ok := paramMap["symbolStatus"]
	assert.True(t, ok, "Should have extracted the symbolStatus parameter")
	assert.Equal(t, "string", symbolStatusParam.Schema.Type)
	assert.False(t, symbolStatusParam.Required)
}

func TestExtractEnumValues(t *testing.T) {
	description := "Filters symbols that have this `tradingStatus`. Valid values: `TRADING`, `HALT`, `BREAK` <br/> Cannot be used in combination with `symbols` or `symbol`."
	values := extractEnumValues(description)
	assert.Equal(t, []interface{}{"TRADING", "HALT", "BREAK"}, values)
}

func TestExtractEnumWithSupportedValues(t *testing.T) {
	description := "Supported values: `FULL` or `MINI`. <br/>If none provided, the default is `FULL`"
	values := extractEnumValues(description)
	assert.Equal(t, []interface{}{"FULL", "MINI"}, values)

	description = "Supported values: `STOP_LOSS_LIMIT`, `STOP_LOSS`, `LIMIT_MAKER`, `TAKE_PROFIT`, `TAKE_PROFIT_LIMIT`"
	values = extractEnumValues(description)
	assert.Equal(t, []interface{}{"STOP_LOSS_LIMIT", "STOP_LOSS", "LIMIT_MAKER", "TAKE_PROFIT", "TAKE_PROFIT_LIMIT"}, values)

	description = "Supported values: `STOP_LOSS_LIMIT`, `STOP_LOSS`, `LIMIT_MAKER`, `TAKE_PROFIT`, `TAKE_PROFIT_LIMIT`"
	values = extractEnumValues(description)
	assert.Equal(t, []interface{}{"STOP_LOSS_LIMIT", "STOP_LOSS", "LIMIT_MAKER", "TAKE_PROFIT", "TAKE_PROFIT_LIMIT"}, values)

	description = "'Supported values: `STOP_LOSS`, `STOP_LOSS_LIMIT`, `TAKE_PROFIT`,`TAKE_PROFIT_LIMIT`'"
	values = extractEnumValues(description)
	assert.Equal(t, []interface{}{"STOP_LOSS", "STOP_LOSS_LIMIT", "TAKE_PROFIT", "TAKE_PROFIT_LIMIT"}, values)

	description = "'Select response format: `ACK`, `RESULT`, `FULL`'"
	values = extractEnumValues(description)
	assert.Equal(t, []interface{}{"ACK", "RESULT", "FULL"}, values)
}

func TestCleanResponseLine(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{
			`"positionInitialMargin": "0.61571385",// initial margin required for positions with current mark price"`,
			`"positionInitialMargin": "0.61571385",`,
		},
		{
			`// initial margin required with current mark price`,
			``,
		},
		{
			`"positionInitialMargin": "0.61571385", // initial margin required for positions with current mark price"`,
			`"positionInitialMargin": "0.61571385", `,
		},
		{
			`"url": "https://www.binance.com/en/futures/BTCUSDT", // url to the position`,
			`"url": "https://www.binance.com/en/futures/BTCUSDT", `,
		},
	}
	for _, test := range tests {
		assert.Equal(t, test.expected, cleanResponseLine(test.input))
	}
}

func TestExtractResponse(t *testing.T) {
	docParser := &SpotDocumentParser{
		DocumentParser: &DocumentParser{},
	}

	endpoint := &parser.Endpoint{
		Method:      "GET",
		Path:        "/api/v3/exchangeInfo",
		Summary:     "Exchange Information",
		Description: "Current exchange trading rules and symbol information",
		Parameters:  []*parser.Parameter{},
		Responses:   map[string]*parser.Response{},
	}

	docParser.extractResponse(endpoint, true, "{ \"message\": \"Success\" }")

	assert.Equal(t, "Successful operation", endpoint.Responses["200"].Description)
	assert.Contains(t, endpoint.Responses["200"].Content, "application/json")
}

func TestOperationID(t *testing.T) {
	tests := []struct {
		docType string
		method  string
		path    string
		want    string
	}{
		{"Spot", "GET", "/api/v3/exchangeInfo", "SpotGetExchangeInfoV3"},
		{"Spot", "POST", "/api/v3/account", "SpotCreateAccountV3"},
		{"Spot", "PUT", "/api/v3/order", "SpotUpdateOrderV3"},
		{"Spot", "DELETE", "/api/v3/order/oco", "SpotDeleteOrderOcoV3"},
		{"Spot", "GET", "/api/v3/order/oco", "SpotGetOrderOcoV3"},
		{"Future", "GET", "/fapi/v1/exchangeInfo", "FutureGetExchangeInfoV1"},
		{"Future", "POST", "/fapi/v1/order", "FutureCreateOrderV1"},
		{"Ufutures", "GET", "/futures/data/basis", "UfuturesGetFuturesDataBasis"},
	}

	for _, test := range tests {
		got := operationID(test.docType, test.method, test.path)
		if got != test.want {
			t.Errorf("operationID(%q, %q, %q) = %q; want %q", test.docType, test.method, test.path, got, test.want)
		}
	}
}

func TestExtractContent(t *testing.T) {
	docParser := &SpotDocumentParser{
		DocumentParser: &DocumentParser{
			docType: "spot",
		},
	}
	endpoint := &parser.Endpoint{
		Tags:       []string{"Market Data"},
		Extensions: make(map[string]interface{}),
	}
	content := []string{
		"Order book",
		"GET /api/v3/depth",
		"Weight: Adjusted based on the limit:",
		"Parameters:",
		"TABLE:<thead><tr><th>Name</th><th>Type</th><th>Mandatory</th><th>Description</th></tr></thead><tbody><tr><td>symbol</td><td>STRING</td><td>YES</td><td></td></tr><tr><td>limit</td><td>INT</td><td>NO</td><td>Default 100; max 5000. <br/> If limit &gt; 5000. then the response will truncate to 5000.</td></tr></tbody>",
		"Data Source: Memory",
		"Response: {  \"lastUpdateId\": 1027024,  \"bids\": [    [      \"4.00000000\",     // PRICE      \"431.00000000\"    // QTY    ]  ],  \"asks\": [    [      \"4.00000200\",      \"12.00000000\"    ]  ]}",
	}

	foundEndpoint, foundResponse, _ := docParser.extractContent(endpoint, content)
	assert.True(t, foundEndpoint)
	assert.True(t, foundResponse)
	assert.Equal(t, "GET", endpoint.Method)
	assert.Equal(t, "/api/v3/depth", endpoint.Path)
	assert.Equal(t, "Order book", endpoint.Summary)
	assert.Equal(t, "", endpoint.Description)
	assert.Equal(t, nil, endpoint.Extensions["x-weight"])
	assert.Equal(t, "Memory", endpoint.Extensions["x-data-source"])
	assert.Equal(t, "SpotGetDepthV3", endpoint.OperationID)
	assert.Equal(t, []string{"Market Data", "V3"}, endpoint.Tags)
}

func TestExtractMaxMinDefault(t *testing.T) {
	schema := &parser.Schema{
		Type: parser.IntegerType,
	}
	extractMaxMinDefault(schema, "Default 500; max 1000.")
	assert.NotNil(t, schema.Max, "maxValue should not be nil")
	assert.InDelta(t, 1000, *schema.Max, 0.001, "maxValue should be 1000")
	assert.Nil(t, schema.Min, "minValue should be nil")
	assert.NotNil(t, schema.Default, "defaultValue should not be nil")
	assert.Equal(t, 500, schema.Default.(int), "defaultValue should be 500")

	schema = &parser.Schema{
		Type: parser.NumberType,
	}
	extractMaxMinDefault(schema, "Default 100; max 5000. If limit > 5000. then the response will truncate to 5000.")
	assert.NotNil(t, schema.Max, "maxValue should not be nil")
	assert.InDelta(t, 5000, *schema.Max, 0.001, "maxValue should be 5000")
	assert.Nil(t, schema.Min, "minValue should be nil")
	assert.NotNil(t, schema.Default, "defaultValue should not be nil")
	assert.Equal(t, 100.0, schema.Default.(float64), "defaultValue should be 100")

	schema = &parser.Schema{
		Type: parser.BooleanType,
	}
	extractMaxMinDefault(schema, "Default `false`")
	assert.NotNil(t, schema.Default, "defaultValue should not be nil")
	assert.Equal(t, false, schema.Default.(bool), "defaultValue should be false")
}

func TestProcessSecurities(t *testing.T) {
	docParser := &SpotDocumentParser{
		DocumentParser: &DocumentParser{},
	}
	endpoint := &parser.Endpoint{
		Summary: "Create a new order (TRADE)",
	}
	docParser.processSecurities(endpoint)
	assert.Equal(t, parser.SecurityTypeApiKey, endpoint.SecuritySchemas["ApiKey"].Type)
	assert.Equal(t, parser.SecurityLocationHeader, endpoint.SecuritySchemas["ApiKey"].In)
	assert.Equal(t, "X-MBX-APIKEY", endpoint.SecuritySchemas["ApiKey"].Name)

	endpoint = &parser.Endpoint{
		Summary: "Get account information (USER_DATA)",
	}
	docParser.processSecurities(endpoint)
	assert.Equal(t, parser.SecurityTypeApiKey, endpoint.SecuritySchemas["ApiKey"].Type)
	assert.Equal(t, parser.SecurityLocationHeader, endpoint.SecuritySchemas["ApiKey"].In)
	assert.Equal(t, "X-MBX-APIKEY", endpoint.SecuritySchemas["ApiKey"].Name)

	endpoint = &parser.Endpoint{
		Summary: "Get account information (USER_STREAM)",
	}
	docParser.processSecurities(endpoint)
	assert.Equal(t, parser.SecurityTypeApiKey, endpoint.SecuritySchemas["ApiKey"].Type)
	assert.Equal(t, parser.SecurityLocationHeader, endpoint.SecuritySchemas["ApiKey"].In)
	assert.Equal(t, "X-MBX-APIKEY", endpoint.SecuritySchemas["ApiKey"].Name)

	endpoint = &parser.Endpoint{
		Summary: "Get account information",
	}
	docParser.processSecurities(endpoint)
	assert.Nil(t, endpoint.SecuritySchemas["ApiKey"], "ApiKey should not be added")
}

func TestCreateSchema(t *testing.T) {
	tests := []struct {
		name      string
		paramType string
		content   string
		want      *parser.Schema
		wantErr   bool
	}{
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "STRING",
			content:   "",
			want: &parser.Schema{
				Type:    parser.StringType,
				Default: "",
				Title:   "SpotGetAccountV4Resp",
			},
			wantErr: false,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "INT",
			content:   "",
			want: &parser.Schema{
				Type:  parser.IntegerType,
				Title: "SpotGetAccountV4Resp",
			},
			wantErr: false,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "LONG",
			content:   "",
			want: &parser.Schema{
				Type:   parser.IntegerType,
				Title:  "SpotGetAccountV4Resp",
				Format: "int64",
			},
			wantErr: false,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "FLOAT",
			content:   "",
			want: &parser.Schema{
				Type:  parser.NumberType,
				Title: "SpotGetAccountV4Resp",
			},
			wantErr: false,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "BOOLEAN",
			content:   "",
			want: &parser.Schema{
				Type:  parser.BooleanType,
				Title: "SpotGetAccountV4Resp",
			},
			wantErr: false,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "ARRAY",
			content:   "[\"test\"]",
			want: &parser.Schema{
				Type:  parser.ArrayType,
				Title: "SpotGetAccountV4Resp",
				Items: &parser.Schema{
					Type:  parser.StringType,
					Title: "SpotGetAccountV4RespItem",
				},
			},
			wantErr: false,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "ARRAY OF STRING",
			content:   "[\"test\"]",
			want: &parser.Schema{
				Type:  parser.ArrayType,
				Title: "SpotGetAccountV4Resp",
				Items: &parser.Schema{
					Type:  parser.StringType,
					Title: "SpotGetAccountV4RespItem",
				},
			},
			wantErr: false,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "OBJECT",
			content:   "{\"key\": \"value\"}",
			want: &parser.Schema{
				Type:  parser.ObjectType,
				Title: "SpotGetAccountV4Resp",
				Properties: map[string]*parser.Schema{
					"key": {
						Type:  parser.StringType,
						Title: "",
					},
				},
			},
			wantErr: false,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "ENUM",
			content:   "",
			want: &parser.Schema{
				Type:  parser.StringType,
				Title: "SpotGetAccountV4Resp",
			},
			wantErr: false,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "OBJECT",
			content:   "invalid json",
			want:      nil,
			wantErr:   true,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "ARRAY",
			content:   "invalid json",
			want:      nil,
			wantErr:   true,
		},
		{
			name:      "SpotGetAccountV4Resp",
			paramType: "UNKNOWN",
			content:   "{}",
			want: &parser.Schema{
				Type:  parser.ObjectType,
				Title: "SpotGetAccountV4Resp",
			},
			wantErr: false,
		},
		{
			name:      "",
			paramType: "LIST<STRING>",
			content:   "",
			want: &parser.Schema{
				Type: parser.ArrayType,
				Items: &parser.Schema{
					Type: parser.StringType,
				},
			},
			wantErr: false,
		},
		{
			name:      "",
			paramType: "LIST<LONG>",
			content:   "",
			want: &parser.Schema{
				Type: parser.ArrayType,
				Items: &parser.Schema{
					Type:   parser.IntegerType,
					Format: "int64",
				},
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := createSchema(tt.name, tt.paramType, tt.content)
			if (err != nil) != tt.wantErr {
				t.Errorf("createSchema() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.wantErr {
				return
			}
			assert.Equal(t, tt.want.Type, got.Type)
			assert.Equal(t, tt.want.Title, got.Title)
			assert.Equal(t, tt.want.Format, got.Format)
			if tt.want.Items != nil {
				assert.Equal(t, tt.want.Items.Type, got.Items.Type)
				assert.Equal(t, tt.want.Items.Title, got.Items.Title)
			}
			if tt.want.Properties != nil {
				assert.Equal(t, len(tt.want.Properties), len(got.Properties))
				for key, value := range tt.want.Properties {
					assert.Contains(t, got.Properties, key)
					assert.Equal(t, value.Type, got.Properties[key].Type)
					assert.Equal(t, fmt.Sprintf("%s.%s", tt.name, key), got.Properties[key].Title)
				}
			}
		})
	}
}
