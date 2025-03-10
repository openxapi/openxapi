package binance

import (
	"testing"

	"github.com/adshao/openxapi/internal/parser"
	"github.com/stretchr/testify/assert"
)

func TestExtractEndpoint(t *testing.T) {
	// Create a document parser
	docParser := &DocumentParser{}

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

	endpoint, ok := docParser.extractEndpoint(content, "General", "https://example.com")

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
	docParser := &DocumentParser{}

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

func TestExtractResponse(t *testing.T) {
	docParser := &DocumentParser{}

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
	}

	for _, test := range tests {
		got := operationID(test.docType, test.method, test.path)
		if got != test.want {
			t.Errorf("operationID(%q, %q, %q) = %q; want %q", test.docType, test.method, test.path, got, test.want)
		}
	}
}
