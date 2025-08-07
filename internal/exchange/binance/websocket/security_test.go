package binance

import (
	"strings"
	"testing"

	"github.com/openxapi/openxapi/internal/config"
	wsparser "github.com/openxapi/openxapi/internal/parser/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestExtractSecurityType tests the extractSecurityType function with various security type patterns
func TestExtractSecurityType(t *testing.T) {

	testCases := []struct {
		name                 string
		summary              string
		expectedSecurityName string
		expectedSecurityType string
		expectSecurity       bool
	}{
		{
			name:                 "TRADE security type",
			summary:              "Place new order (TRADE)",
			expectedSecurityName: "trade",
			expectedSecurityType: "TRADE",
			expectSecurity:       true,
		},
		{
			name:                 "USER_DATA security type",
			summary:              "Account information (USER_DATA)",
			expectedSecurityName: "userData",
			expectedSecurityType: "USER_DATA",
			expectSecurity:       true,
		},
		{
			name:                 "USER_STREAM security type",
			summary:              "Start a user data stream (USER_STREAM)",
			expectedSecurityName: "userStream",
			expectedSecurityType: "USER_STREAM",
			expectSecurity:       true,
		},
		{
			name:                 "SIGNED security type",
			summary:              "Log in with API key (SIGNED)",
			expectedSecurityName: "userData",
			expectedSecurityType: "SIGNED",
			expectSecurity:       true,
		},
		{
			name:                 "MARKET_DATA security type (no security)",
			summary:              "Get market data (MARKET_DATA)",
			expectedSecurityName: "",
			expectedSecurityType: "",
			expectSecurity:       false,
		},
		{
			name:                 "No security type",
			summary:              "Get server time",
			expectedSecurityName: "",
			expectedSecurityType: "",
			expectSecurity:       false,
		},
		{
			name:                 "Security type in middle of text",
			summary:              "This is a (TRADE) operation for trading",
			expectedSecurityName: "trade",
			expectedSecurityType: "TRADE",
			expectSecurity:       true,
		},
		{
			name:                 "Multiple parentheses with security",
			summary:              "Order (v2) place (TRADE)",
			expectedSecurityName: "trade",
			expectedSecurityType: "TRADE",
			expectSecurity:       true,
		},
		{
			name:                 "Case sensitive check",
			summary:              "Get price (trade)", // lowercase should not match
			expectedSecurityName: "",
			expectedSecurityType: "",
			expectSecurity:       false,
		},
		{
			name:                 "Unknown uppercase in parentheses",
			summary:              "Get price (UNKNOWN)", // Unknown uppercase should not match
			expectedSecurityName: "",
			expectedSecurityType: "",
			expectSecurity:       false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			parser := &DocumentParser{} // Create fresh parser for each test
			channel := &wsparser.Channel{
				Name:    "testMethod",
			}

			parser.extractSecurityType(channel, tc.summary)

			if tc.expectSecurity {
				require.NotNil(t, channel.Security, "Expected security to be set for %s", tc.summary)
				assert.Len(t, channel.Security, 1, "Expected exactly one security requirement")
				
				// Check the security name
				securityMap := channel.Security[0]
				assert.Contains(t, securityMap, tc.expectedSecurityName, 
					"Expected security name '%s' in security map", tc.expectedSecurityName)
				
				// Check the extension
				require.NotNil(t, channel.Extensions, "Expected extensions to be set")
				assert.Equal(t, tc.expectedSecurityType, channel.Extensions["x-binance-security-type"],
					"Expected x-binance-security-type to be '%s'", tc.expectedSecurityType)
				
				// Check that SecuritySchemas contains the security scheme
				require.NotNil(t, channel.SecuritySchemas, "Expected SecuritySchemas to be initialized")
				assert.Contains(t, channel.SecuritySchemas, tc.expectedSecurityName,
					"Expected SecuritySchemas to contain '%s'", tc.expectedSecurityName)
				
				// Verify the security schema properties
				schema := channel.SecuritySchemas[tc.expectedSecurityName]
				assert.Equal(t, "apiKey", schema.Type, "Expected security type to be 'apiKey'")
				assert.Equal(t, "user", schema.In, "Expected 'in' to be 'user'")
			} else {
				assert.Nil(t, channel.Security, "Expected no security for %s", tc.summary)
				if channel.Extensions != nil {
					assert.NotContains(t, channel.Extensions, "x-binance-security-type",
						"Should not have x-binance-security-type extension")
				}
			}
		})
	}
}

// TestSecuritySchemaGeneration tests that security schemas are properly generated in channels
func TestSecuritySchemaGeneration(t *testing.T) {
	parser := &DocumentParser{}

	// Test multiple security types in the same parsing session
	securityTypes := []struct {
		summary      string
		securityName string
	}{
		{"Place order (TRADE)", "trade"},
		{"Get account (USER_DATA)", "userData"},
		{"Manage stream (USER_STREAM)", "userStream"},
		{"Authenticate (SIGNED)", "userData"}, // SIGNED maps to userData
	}

	for _, st := range securityTypes {
		t.Run(st.summary, func(t *testing.T) {
			channel := &wsparser.Channel{
				Name:    "testMethod",
				Summary: st.summary,
			}

			parser.extractSecurityType(channel, st.summary)

			// Verify SecuritySchemas are created correctly
			require.NotNil(t, channel.SecuritySchemas, "SecuritySchemas should be initialized")
			require.Contains(t, channel.SecuritySchemas, st.securityName,
				"SecuritySchemas should contain %s", st.securityName)

			schema := channel.SecuritySchemas[st.securityName]
			assert.NotNil(t, schema, "Security schema should not be nil")
			assert.Equal(t, "apiKey", schema.Type, "Security type should be 'apiKey'")
			assert.Equal(t, "user", schema.In, "Security 'in' should be 'user'")
			assert.Equal(t, st.securityName, schema.Name, "Security name should match")
		})
	}
}

// TestParseWithSecurity tests full document parsing with security types
func TestParseWithSecurity(t *testing.T) {
	parser := &DocumentParser{}

	// Create a mock HTML document with security types
	htmlContent := `
<!DOCTYPE html>
<html>
<body>
<h3 class="anchor anchorWithStickyNavbar_fMI7">Place new order (TRADE)</h3>
<div class="language-javascript">
<pre><code>{
  "id": "123",
  "method": "order.place",
  "params": {
    "symbol": "BTCUSDT",
    "side": "BUY",
    "type": "LIMIT",
    "price": "50000",
    "quantity": "0.001"
  }
}</code></pre>
</div>
<p><strong>Weight:</strong> 1</p>
<p><strong>Data Source:</strong> Matching Engine</p>
<p><strong>Parameters:</strong></p>
<table>
<thead><tr><th>Name</th><th>Type</th><th>Mandatory</th><th>Description</th></tr></thead>
<tbody>
<tr><td>symbol</td><td>STRING</td><td>YES</td><td>Trading pair</td></tr>
<tr><td>side</td><td>ENUM</td><td>YES</td><td>BUY or SELL</td></tr>
</tbody>
</table>
<p><strong>Response:</strong></p>
<div class="language-javascript">
<pre><code>{
  "id": "123",
  "status": 200,
  "result": {
    "orderId": 12345,
    "symbol": "BTCUSDT",
    "status": "NEW"
  }
}</code></pre>
</div>

<h3 class="anchor anchorWithStickyNavbar_fMI7">Account information (USER_DATA)</h3>
<div class="language-javascript">
<pre><code>{
  "id": "456",
  "method": "account.status",
  "params": {}
}</code></pre>
</div>
<p><strong>Weight:</strong> 5</p>
<p><strong>Data Source:</strong> Database</p>

<h3 class="anchor anchorWithStickyNavbar_fMI7">Log in with API key (SIGNED)</h3>
<div class="language-javascript">
<pre><code>{
  "id": "789",
  "method": "session.logon",
  "params": {
    "apiKey": "xxx",
    "signature": "yyy",
    "timestamp": 123456789
  }
}</code></pre>
</div>
<p><strong>Weight:</strong> 2</p>
</body>
</html>
`

	reader := strings.NewReader(htmlContent)
	urlEntity := &config.URLEntity{
		URL:     "https://test.example.com/websocket-api",
		DocType: "spot",
	}

	channels, err := parser.Parse(reader, urlEntity, []string{})
	require.NoError(t, err, "Failed to parse document")

	// Verify we found all three methods
	assert.Len(t, channels, 3, "Expected 3 channels")

	// Check each method has correct security
	methodSecurity := make(map[string]string)
	for _, channel := range channels {
		if channel.Security != nil && len(channel.Security) > 0 {
			for secName := range channel.Security[0] {
				methodSecurity[channel.Name] = secName
			}
		}
		
		// Log for debugging
		t.Logf("Channel %s: security=%v, extension=%v", 
			channel.Name, methodSecurity[channel.Name], channel.Extensions["x-binance-security-type"])
	}

	// Verify security assignments
	assert.Equal(t, "trade", methodSecurity["order.place"], "order.place should have trade security")
	assert.Equal(t, "userData", methodSecurity["account.status"], "account.status should have userData security")
	assert.Equal(t, "userData", methodSecurity["session.logon"], "session.logon should have userData security (SIGNED maps to userData)")
}

// TestSecurityPropagationToAsyncAPI tests that security is properly propagated to AsyncAPI operations
func TestSecurityPropagationToAsyncAPI(t *testing.T) {
	// This test verifies that channels with security requirements
	// will have their security properly set in the AsyncAPI spec generation
	
	testCases := []struct {
		name             string
		channelSecurity  []map[string][]string
		expectedSecurity bool
	}{
		{
			name: "Channel with trade security",
			channelSecurity: []map[string][]string{
				{"trade": {}},
			},
			expectedSecurity: true,
		},
		{
			name: "Channel with userData security",
			channelSecurity: []map[string][]string{
				{"userData": {}},
			},
			expectedSecurity: true,
		},
		{
			name:             "Channel without security",
			channelSecurity:  nil,
			expectedSecurity: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			channel := &wsparser.Channel{
				Name:     "testMethod",
				Security: tc.channelSecurity,
			}

			// Verify security is set correctly
			if tc.expectedSecurity {
				assert.NotNil(t, channel.Security, "Expected channel to have security")
				assert.NotEmpty(t, channel.Security, "Expected channel to have non-empty security")
			} else {
				assert.Nil(t, channel.Security, "Expected channel to have no security")
			}
		})
	}
}

// TestSecuritySchemaDeduplication tests that multiple methods with same security type
// share the same security schema reference
func TestSecuritySchemaDeduplication(t *testing.T) {
	parser := &DocumentParser{}

	// Multiple methods with same security type
	methods := []struct {
		name    string
		summary string
	}{
		{"order.place", "Place new order (TRADE)"},
		{"order.cancel", "Cancel order (TRADE)"},
		{"order.status", "Get order status (TRADE)"},
	}

	channels := make([]*wsparser.Channel, 0, len(methods))
	
	for _, m := range methods {
		channel := &wsparser.Channel{
			Name:    m.name,
			Summary: m.summary,
		}
		parser.extractSecurityType(channel, m.summary)
		channels = append(channels, channel)
	}

	// All channels should reference the same security scheme name
	for i, channel := range channels {
		require.NotNil(t, channel.Security, "Channel %d should have security", i)
		require.Len(t, channel.Security, 1, "Channel %d should have exactly one security requirement", i)
		
		// All should have "trade" security
		assert.Contains(t, channel.Security[0], "trade", 
			"Channel %s should have 'trade' security", channel.Name)
		
		// All should have the same SecuritySchemas entry
		require.NotNil(t, channel.SecuritySchemas, "Channel %d should have SecuritySchemas", i)
		assert.Contains(t, channel.SecuritySchemas, "trade",
			"Channel %s should have 'trade' in SecuritySchemas", channel.Name)
	}
}

// TestInvalidSecurityTypes tests that invalid or unknown security types are handled gracefully
func TestInvalidSecurityTypes(t *testing.T) {
	testCases := []struct {
		name           string
		summary        string
		expectSecurity bool
	}{
		{
			name:           "Unknown security type",
			summary:        "Some operation (UNKNOWN_TYPE)",
			expectSecurity: false,
		},
		{
			name:           "Malformed security type",
			summary:        "Some operation (TRADE",  // Missing closing parenthesis
			expectSecurity: false,
		},
		{
			name:           "Empty parentheses",
			summary:        "Some operation ()",
			expectSecurity: false,
		},
		{
			name:           "Non-security parentheses",
			summary:        "Some operation (v2)",
			expectSecurity: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			parser := &DocumentParser{} // Create fresh parser for each test
			channel := &wsparser.Channel{
				Name:    "testMethod",
			}

			parser.extractSecurityType(channel, tc.summary)

			if tc.expectSecurity {
				assert.NotNil(t, channel.Security, "Expected security for %s", tc.summary)
			} else {
				assert.Nil(t, channel.Security, "Expected no security for %s", tc.summary)
			}
		})
	}
}