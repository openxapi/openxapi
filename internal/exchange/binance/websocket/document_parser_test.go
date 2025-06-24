package binance

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/openxapi/openxapi/internal/config"
	wsparser "github.com/openxapi/openxapi/internal/parser/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDocumentParser_Parse(t *testing.T) {
	parser := &DocumentParser{}

	// Load the sample HTML file
	samplePath := filepath.Join("..", "..", "..", "..", "samples", "binance", "websocket", "spot", "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_general-requests.html")

	file, err := os.Open(samplePath)
	require.NoError(t, err, "Failed to open sample file")
	defer file.Close()

	urlEntity := &config.URLEntity{
		URL:     "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/general-requests",
		DocType: "websocket-api",
	}

	channels, err := parser.Parse(file, urlEntity, []string{})
	require.NoError(t, err, "Failed to parse document")

	// We expect to find 3 API methods: ping, time, and exchangeInfo
	assert.Len(t, channels, 3, "Expected 3 WebSocket API methods")

	// Check specific methods
	methodNames := make(map[string]bool)
	for _, channel := range channels {
		methodNames[channel.Name] = true

		// All channels should have send and receive messages
		assert.Contains(t, channel.Messages, "send", "Channel should have send message")
		assert.Contains(t, channel.Messages, "receive", "Channel should have receive message")

		// Check metadata
		assert.Contains(t, channel.Metadata, "weight", "Channel should have weight metadata")
		assert.Contains(t, channel.Metadata, "dataSource", "Channel should have dataSource metadata")

		t.Logf("Found method: %s, Description: %s", channel.Name, channel.Description)
		t.Logf("  Weight: %v", channel.Metadata["weight"])
		t.Logf("  Data Source: %v", channel.Metadata["dataSource"])
		t.Logf("  Parameters: %d", len(channel.Parameters))
	}

	// Check that we found the expected methods
	assert.True(t, methodNames["ping"], "Should find ping method")
	assert.True(t, methodNames["time"], "Should find time method")
	assert.True(t, methodNames["exchangeInfo"], "Should find exchangeInfo method")
}

// TestDocumentParser_MethodEnumConstraints tests that method fields have proper enum constraints
func TestDocumentParser_MethodEnumConstraints(t *testing.T) {
	parser := &DocumentParser{}

	// Load the sample HTML file
	samplePath := filepath.Join("..", "..", "..", "..", "samples", "binance", "websocket", "spot", "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_general-requests.html")

	file, err := os.Open(samplePath)
	require.NoError(t, err, "Failed to open sample file")
	defer file.Close()

	urlEntity := &config.URLEntity{
		URL:     "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/general-requests",
		DocType: "websocket-api",
	}

	channels, err := parser.Parse(file, urlEntity, []string{})
	require.NoError(t, err, "Failed to parse document")

	// Test each method for proper enum constraints
	testCases := []struct {
		methodName     string
		expectedMethod string
	}{
		{"ping", "ping"},
		{"time", "time"},
		{"exchangeInfo", "exchangeInfo"},
	}

	for _, tc := range testCases {
		t.Run(tc.methodName, func(t *testing.T) {
			// Find the method channel
			var channel *wsparser.Channel
			for i := range channels {
				if channels[i].Name == tc.methodName {
					channel = &channels[i]
					break
				}
			}
			require.NotNil(t, channel, "Should find %s method", tc.methodName)

			// Check send message (request)
			sendMsg := channel.Messages["send"]
			require.NotNil(t, sendMsg, "Should have send message for %s", tc.methodName)
			require.NotNil(t, sendMsg.Payload, "Should have request payload for %s", tc.methodName)

			// Check that method field exists and has enum constraint
			assert.Equal(t, "object", sendMsg.Payload.Type, "Request should be object for %s", tc.methodName)
			assert.Contains(t, sendMsg.Payload.Properties, "method", "Request should have method field for %s", tc.methodName)

			methodField := sendMsg.Payload.Properties["method"]
			require.NotNil(t, methodField, "Method field should exist for %s", tc.methodName)
			assert.Equal(t, "string", methodField.Type, "Method field should be string for %s", tc.methodName)

			// CRITICAL: Check that method field has enum constraint
			require.NotNil(t, methodField.Enum, "Method field should have enum constraint for %s", tc.methodName)
			require.Len(t, methodField.Enum, 1, "Method field should have exactly one enum value for %s", tc.methodName)
			assert.Equal(t, tc.expectedMethod, methodField.Enum[0], "Method enum should be %s for %s", tc.expectedMethod, tc.methodName)

			t.Logf("✅ %s method has correct enum constraint: %v", tc.methodName, methodField.Enum)
		})
	}
}

// TestDocumentParser_RequestResponseStructure tests that requests and responses are properly distinguished
func TestDocumentParser_RequestResponseStructure(t *testing.T) {
	parser := &DocumentParser{}

	// Load the sample HTML file
	samplePath := filepath.Join("..", "..", "..", "..", "samples", "binance", "websocket", "spot", "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_general-requests.html")

	file, err := os.Open(samplePath)
	require.NoError(t, err, "Failed to open sample file")
	defer file.Close()

	urlEntity := &config.URLEntity{
		URL:     "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/general-requests",
		DocType: "websocket-api",
	}

	channels, err := parser.Parse(file, urlEntity, []string{})
	require.NoError(t, err, "Failed to parse document")

	// Test each method for proper request/response structure
	testCases := []struct {
		methodName             string
		shouldHaveParams       bool
		expectedRequestFields  []string
		expectedResponseFields []string
	}{
		{
			methodName:             "ping",
			shouldHaveParams:       false,
			expectedRequestFields:  []string{"id", "method"},
			expectedResponseFields: []string{"id", "status", "result", "rateLimits"},
		},
		{
			methodName:             "time",
			shouldHaveParams:       false,
			expectedRequestFields:  []string{"id", "method"},
			expectedResponseFields: []string{"id", "status", "result", "rateLimits"},
		},
		{
			methodName:             "exchangeInfo",
			shouldHaveParams:       true,
			expectedRequestFields:  []string{"id", "method", "params"},
			expectedResponseFields: []string{"id", "status", "result", "rateLimits"},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.methodName, func(t *testing.T) {
			// Find the method channel
			var channel *wsparser.Channel
			for i := range channels {
				if channels[i].Name == tc.methodName {
					channel = &channels[i]
					break
				}
			}
			require.NotNil(t, channel, "Should find %s method", tc.methodName)

			// Test request structure (sendMessage)
			sendMsg := channel.Messages["send"]
			require.NotNil(t, sendMsg, "Should have send message for %s", tc.methodName)
			require.NotNil(t, sendMsg.Payload, "Should have request payload for %s", tc.methodName)

			assert.Equal(t, "object", sendMsg.Payload.Type, "Request should be object for %s", tc.methodName)

			// Check expected request fields
			for _, field := range tc.expectedRequestFields {
				assert.Contains(t, sendMsg.Payload.Properties, field, "Request should have %s field for %s", field, tc.methodName)
			}

			// Check params field specifically
			if tc.shouldHaveParams {
				assert.Contains(t, sendMsg.Payload.Properties, "params", "Request should have params field for %s", tc.methodName)
			}

			// Test response structure (receiveMessage)
			receiveMsg := channel.Messages["receive"]
			require.NotNil(t, receiveMsg, "Should have receive message for %s", tc.methodName)
			require.NotNil(t, receiveMsg.Payload, "Should have response payload for %s", tc.methodName)

			assert.Equal(t, "object", receiveMsg.Payload.Type, "Response should be object for %s", tc.methodName)

			// CRITICAL: Check that response has proper structure (not request fields)
			// Response should NOT have method field (that's a request field)
			assert.NotContains(t, receiveMsg.Payload.Properties, "method", "Response should NOT have method field for %s", tc.methodName)

			// Response should have standard response fields
			for _, field := range tc.expectedResponseFields {
				assert.Contains(t, receiveMsg.Payload.Properties, field, "Response should have %s field for %s", field, tc.methodName)
			}

			// Verify specific response field types
			if statusField, exists := receiveMsg.Payload.Properties["status"]; exists {
				assert.Equal(t, "integer", statusField.Type, "Status field should be integer for %s", tc.methodName)
			}

			if resultField, exists := receiveMsg.Payload.Properties["result"]; exists {
				assert.Equal(t, "object", resultField.Type, "Result field should be object for %s", tc.methodName)
			}

			if rateLimitsField, exists := receiveMsg.Payload.Properties["rateLimits"]; exists {
				assert.Equal(t, "array", rateLimitsField.Type, "RateLimits field should be array for %s", tc.methodName)
			}

			t.Logf("✅ %s has correct request/response structure", tc.methodName)
			t.Logf("   Request fields: %v", getFieldNames(sendMsg.Payload.Properties))
			t.Logf("   Response fields: %v", getFieldNames(receiveMsg.Payload.Properties))
		})
	}
}

// TestDocumentParser_ResponseFieldDetails tests specific response field structures
func TestDocumentParser_ResponseFieldDetails(t *testing.T) {
	parser := &DocumentParser{}

	// Load the sample HTML file
	samplePath := filepath.Join("..", "..", "..", "..", "samples", "binance", "websocket", "spot", "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_general-requests.html")

	file, err := os.Open(samplePath)
	require.NoError(t, err, "Failed to open sample file")
	defer file.Close()

	urlEntity := &config.URLEntity{
		URL:     "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/general-requests",
		DocType: "websocket-api",
	}

	channels, err := parser.Parse(file, urlEntity, []string{})
	require.NoError(t, err, "Failed to parse document")

	// Test time method specifically for serverTime in result
	var timeChannel *wsparser.Channel
	for i := range channels {
		if channels[i].Name == "time" {
			timeChannel = &channels[i]
			break
		}
	}
	require.NotNil(t, timeChannel, "Should find time method")

	receiveMsg := timeChannel.Messages["receive"]
	require.NotNil(t, receiveMsg, "Should have receive message for time")
	require.NotNil(t, receiveMsg.Payload, "Should have response payload for time")

	// Check that result field has serverTime property
	resultField := receiveMsg.Payload.Properties["result"]
	require.NotNil(t, resultField, "Should have result field")
	assert.Equal(t, "object", resultField.Type, "Result should be object")

	if resultField.Properties != nil {
		assert.Contains(t, resultField.Properties, "serverTime", "Result should have serverTime field")
		if serverTimeField := resultField.Properties["serverTime"]; serverTimeField != nil {
			assert.Equal(t, "integer", serverTimeField.Type, "ServerTime should be integer")
		}
	}

	t.Logf("✅ Time method has correct result structure with serverTime")
}

func TestDocumentParser_CorrelationId(t *testing.T) {
	parser := &DocumentParser{}

	// Load the sample HTML file
	samplePath := filepath.Join("..", "..", "..", "..", "samples", "binance", "websocket", "spot", "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_general-requests.html")

	file, err := os.Open(samplePath)
	require.NoError(t, err, "Failed to open sample file")
	defer file.Close()

	urlEntity := &config.URLEntity{
		URL:     "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/general-requests",
		DocType: "websocket-api",
	}

	channels, err := parser.Parse(file, urlEntity, []string{})
	require.NoError(t, err, "Failed to parse document")

	// Check each method to verify correlation ID is set when 'id' property exists
	for _, channel := range channels {
		// Check send message
		if sendMsg, exists := channel.Messages["send"]; exists {
			if sendMsg.Payload != nil && sendMsg.Payload.Properties != nil {
				if _, hasId := sendMsg.Payload.Properties["id"]; hasId {
					require.NotNil(t, sendMsg.CorrelationId, "Send message should have CorrelationId when payload has 'id' property for method: %s", channel.Name)
					assert.Equal(t, "$message.payload#/id", sendMsg.CorrelationId.Location, "CorrelationId location should be '$message.payload#/id' for method: %s", channel.Name)
					assert.Equal(t, "Message correlation ID", sendMsg.CorrelationId.Description, "CorrelationId description should be set for method: %s", channel.Name)
					t.Logf("✅ %s send message has correlation ID: %s", channel.Name, sendMsg.CorrelationId.Location)
				} else {
					t.Logf("ℹ️ %s send message does not have 'id' property, no correlation ID expected", channel.Name)
				}
			}
		}

		// Check receive message
		if receiveMsg, exists := channel.Messages["receive"]; exists {
			if receiveMsg.Payload != nil && receiveMsg.Payload.Properties != nil {
				if _, hasId := receiveMsg.Payload.Properties["id"]; hasId {
					require.NotNil(t, receiveMsg.CorrelationId, "Receive message should have CorrelationId when payload has 'id' property for method: %s", channel.Name)
					assert.Equal(t, "$message.payload#/id", receiveMsg.CorrelationId.Location, "CorrelationId location should be '$message.payload#/id' for method: %s", channel.Name)
					assert.Equal(t, "Message correlation ID", receiveMsg.CorrelationId.Description, "CorrelationId description should be set for method: %s", channel.Name)
					t.Logf("✅ %s receive message has correlation ID: %s", channel.Name, receiveMsg.CorrelationId.Location)
				} else {
					t.Logf("ℹ️ %s receive message does not have 'id' property, no correlation ID expected", channel.Name)
				}
			}
		}
	}
}

// Helper function to get field names from properties map
func getFieldNames(properties map[string]*wsparser.Schema) []string {
	var names []string
	for name := range properties {
		names = append(names, name)
	}
	return names
}

func TestDocumentParser_ParseExchangeInfoMethod(t *testing.T) {
	parser := &DocumentParser{}

	// Load the sample HTML file
	samplePath := filepath.Join("..", "..", "..", "..", "samples", "binance", "websocket", "spot", "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_general-requests.html")

	file, err := os.Open(samplePath)
	require.NoError(t, err, "Failed to open sample file")
	defer file.Close()

	urlEntity := &config.URLEntity{
		URL:     "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/general-requests",
		DocType: "websocket-api",
	}

	channels, err := parser.Parse(file, urlEntity, []string{})
	require.NoError(t, err, "Failed to parse document")

	// Find the exchangeInfo method
	var exchangeInfoChannel *wsparser.Channel
	for i := range channels {
		if channels[i].Name == "exchangeInfo" {
			exchangeInfoChannel = &channels[i]
			break
		}
	}

	require.NotNil(t, exchangeInfoChannel, "Should find exchangeInfo method")

	// Check specific properties of exchangeInfo
	assert.Equal(t, "exchangeInfo", exchangeInfoChannel.Name)
	assert.Contains(t, exchangeInfoChannel.Description, "Query current exchange trading rules")
	assert.Equal(t, 20, exchangeInfoChannel.Metadata["weight"])
	assert.Equal(t, "Memory", exchangeInfoChannel.Metadata["dataSource"])

	// Check parameters - exchangeInfo should have parameters like symbol, symbols, permissions, etc.
	assert.Greater(t, len(exchangeInfoChannel.Parameters), 0, "exchangeInfo should have parameters")

	// Check for specific parameters
	paramNames := make(map[string]bool)
	for _, param := range exchangeInfoChannel.Parameters {
		paramNames[param.Name] = true
		t.Logf("Parameter: %s, Type: %s, Required: %v, Description: %s",
			param.Name, param.Schema.Type, param.Required, param.Description)
	}

	// Should have these parameters based on the HTML documentation
	expectedParams := []string{"symbol", "symbols", "permissions", "showPermissionSets", "symbolStatus"}
	for _, expectedParam := range expectedParams {
		assert.True(t, paramNames[expectedParam], "Should find parameter: "+expectedParam)
	}

	// Check request schema
	sendMsg := exchangeInfoChannel.Messages["send"]
	require.NotNil(t, sendMsg, "Should have send message")
	require.NotNil(t, sendMsg.Payload, "Should have request payload schema")

	// Request should be an object with method and params properties
	assert.Equal(t, "object", sendMsg.Payload.Type)
	assert.Contains(t, sendMsg.Payload.Properties, "method")
	assert.Contains(t, sendMsg.Payload.Properties, "params")

	// Check response schema
	receiveMsg := exchangeInfoChannel.Messages["receive"]
	require.NotNil(t, receiveMsg, "Should have receive message")
	require.NotNil(t, receiveMsg.Payload, "Should have response payload schema")

	// Response should be an object
	assert.Equal(t, "object", receiveMsg.Payload.Type)
}

// TestDocumentParser_IsMandatoryParameter tests the isMandatoryParameter function
func TestDocumentParser_IsMandatoryParameter(t *testing.T) {
	parser := &DocumentParser{}

	testCases := []struct {
		name     string
		input    string
		expected bool
	}{
		// Test explicit "yes" cases
		{"Yes uppercase", "YES", true},
		{"Yes lowercase", "yes", true},
		{"Yes mixed case", "Yes", true},
		{"Yes with spaces", " YES ", true},

		// Test explicit "no" cases
		{"No uppercase", "NO", false},
		{"No lowercase", "no", false},
		{"No mixed case", "No", false},
		{"No with spaces", " NO ", false},

		// Test other positive indicators
		{"True uppercase", "TRUE", true},
		{"True lowercase", "true", true},
		{"Required uppercase", "REQUIRED", true},
		{"Required lowercase", "required", true},
		{"Number 1", "1", true},

		// Test other negative indicators
		{"False uppercase", "FALSE", false},
		{"False lowercase", "false", false},
		{"Optional uppercase", "OPTIONAL", false},
		{"Optional lowercase", "optional", false},
		{"Number 0", "0", false},
		{"Empty string", "", false},

		// Test partial matches
		{"Contains yes", "yes, but conditional", true},
		{"Contains required", "required in some cases", true},
		{"Contains true", "true if authenticated", true},

		// Test ambiguous cases (should default to false)
		{"Maybe", "maybe", false},
		{"Sometimes", "sometimes", false},
		{"Unknown text", "xyz", false},
		{"Question mark", "?", false},

		// Test edge cases
		{"Only whitespace", "   ", false},
		{"Tab characters", "\t\n", false},
		{"Mixed whitespace and yes", " \t YES \n ", true},
		{"Mixed whitespace and no", " \t NO \n ", false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := parser.isMandatoryParameter(tc.input)
			assert.Equal(t, tc.expected, result, "isMandatoryParameter(%q) should return %v", tc.input, tc.expected)
		})
	}
}

// TestDocumentParser_ParseParameterTable_MandatoryHandling tests that parameter table parsing correctly handles mandatory flags
func TestDocumentParser_ParseParameterTable_MandatoryHandling(t *testing.T) {
	parser := &DocumentParser{}

	// Create a mock HTML table with various mandatory values
	tableContent := `
	<tr>
		<th>Name</th>
		<th>Type</th>
		<th>Mandatory</th>
		<th>Description</th>
	</tr>
	<tr>
		<td>symbol</td>
		<td>STRING</td>
		<td>YES</td>
		<td>Trading symbol</td>
	</tr>
	<tr>
		<td>limit</td>
		<td>INT</td>
		<td>NO</td>
		<td>Default: 100; Maximum: 5000</td>
	</tr>
	<tr>
		<td>interval</td>
		<td>STRING</td>
		<td>REQUIRED</td>
		<td>Time interval</td>
	</tr>
	<tr>
		<td>startTime</td>
		<td>LONG</td>
		<td>OPTIONAL</td>
		<td>Start time</td>
	</tr>
	<tr>
		<td>endTime</td>
		<td>LONG</td>
		<td></td>
		<td>End time</td>
	</tr>
	`

	channel := &wsparser.Channel{
		Parameters: []*wsparser.Parameter{},
	}

	err := parser.parseParameterTable(channel, tableContent)
	require.NoError(t, err, "Should parse parameter table without error")

	// Verify we got the expected number of parameters
	assert.Len(t, channel.Parameters, 5, "Should find 5 parameters")

	// Create a map for easier testing
	paramMap := make(map[string]*wsparser.Parameter)
	for i := range channel.Parameters {
		paramMap[channel.Parameters[i].Name] = channel.Parameters[i]
	}

	// Test each parameter's Required field
	testCases := []struct {
		paramName string
		expected  bool
	}{
		{"symbol", true},     // YES -> true
		{"limit", false},     // NO -> false
		{"interval", true},   // REQUIRED -> true
		{"startTime", false}, // OPTIONAL -> false
		{"endTime", false},   // empty -> false
	}

	for _, tc := range testCases {
		t.Run(tc.paramName, func(t *testing.T) {
			param, exists := paramMap[tc.paramName]
			require.True(t, exists, "Parameter %s should exist", tc.paramName)
			assert.Equal(t, tc.expected, param.Required, "Parameter %s Required should be %v", tc.paramName, tc.expected)
		})
	}

	// Additional checks for specific parameters
	symbolParam := paramMap["symbol"]
	assert.Equal(t, "string", symbolParam.Schema.Type, "symbol should be string type")
	assert.Equal(t, "Trading symbol", symbolParam.Description, "symbol should have correct description")

	limitParam := paramMap["limit"]
	assert.Equal(t, "integer", limitParam.Schema.Type, "limit should be integer type")
	assert.Equal(t, "Default: 100; Maximum: 5000", limitParam.Description, "limit should have correct description")
}
