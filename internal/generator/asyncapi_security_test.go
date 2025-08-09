package generator

import (
	"testing"

	wsparser "github.com/openxapi/openxapi/internal/parser/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// TestConvertToAsyncAPISecurityScheme tests the conversion of WebSocket security schemas to AsyncAPI format
func TestConvertToAsyncAPISecurityScheme(t *testing.T) {
	g := &Generator{}

	testCases := []struct {
		name                 string
		inputSchema          *wsparser.SecuritySchema
		expectedType         string
		expectedIn           string
		expectedDescContains string
	}{
		{
			name: "Trade security schema",
			inputSchema: &wsparser.SecuritySchema{
				Type: "apiKey",
				Name: "trade",
				In:   "user",
			},
			expectedType:         "apiKey",
			expectedIn:           "user",
			expectedDescContains: "Trading operations",
		},
		{
			name: "User data security schema",
			inputSchema: &wsparser.SecuritySchema{
				Type: "apiKey",
				Name: "userData",
				In:   "user",
			},
			expectedType:         "apiKey",
			expectedIn:           "user",
			expectedDescContains: "Private user data",
		},
		{
			name: "User stream security schema",
			inputSchema: &wsparser.SecuritySchema{
				Type: "apiKey",
				Name: "userStream",
				In:   "user",
			},
			expectedType:         "apiKey",
			expectedIn:           "user",
			expectedDescContains: "User Data Stream",
		},
		{
			name: "Default security schema",
			inputSchema: &wsparser.SecuritySchema{
				Type: "apiKey",
				Name: "customAuth",
				In:   "user",
			},
			expectedType:         "apiKey",
			expectedIn:           "user",
			expectedDescContains: "API key authentication",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := g.convertToAsyncAPISecurityScheme(tc.inputSchema)

			assert.NotNil(t, result, "Converted schema should not be nil")
			assert.Equal(t, tc.expectedType, result.Type, "Security type should match")
			assert.Equal(t, tc.expectedIn, result.In, "Security 'in' should match")
			assert.Contains(t, result.Description, tc.expectedDescContains,
				"Description should contain expected text")

			// Name should NOT be set for apiKey type in AsyncAPI 3.0
			assert.Empty(t, result.Name, "Name should not be set for apiKey type")
		})
	}
}

// TestAsyncAPIOperationSecurityGeneration tests that operations get correct security references
func TestAsyncAPIOperationSecurityGeneration(t *testing.T) {
	g := &Generator{}

	// Create test channels with different security requirements
	channels := []wsparser.Channel{
		{
			Name:    "order.place",
			Summary: "Place new order (TRADE)",
			Security: []map[string][]string{
				{"trade": {}},
			},
			Extensions: map[string]interface{}{
				"x-binance-security-type": "TRADE",
			},
		},
		{
			Name:    "account.status",
			Summary: "Account information (USER_DATA)",
			Security: []map[string][]string{
				{"userData": {}},
			},
			Extensions: map[string]interface{}{
				"x-binance-security-type": "USER_DATA",
			},
		},
		{
			Name:    "time",
			Summary: "Get server time",
			// No security
		},
	}

	// Test that convertToAsyncAPIOperations properly handles security
	for _, channel := range channels {
		// Create operations from channel
		operations := g.convertToAsyncAPIOperations([]wsparser.Channel{channel})

		// Should have both send and receive operations
		assert.Contains(t, operations, "send"+capitalize(channel.Name),
			"Should have send operation for %s", channel.Name)
		assert.Contains(t, operations, "receive"+capitalize(channel.Name),
			"Should have receive operation for %s", channel.Name)

		sendOp := operations["send"+capitalize(channel.Name)]
		receiveOp := operations["receive"+capitalize(channel.Name)]

		if channel.Security != nil && len(channel.Security) > 0 {
			// Both operations should have security references
			require.NotNil(t, sendOp.Security, "Send operation should have security for %s", channel.Name)
			require.NotNil(t, receiveOp.Security, "Receive operation should have security for %s", channel.Name)

			// Check that security is a reference
			assert.Len(t, sendOp.Security, 1, "Should have one security requirement")
			assert.Contains(t, sendOp.Security[0], "$ref", "Security should be a reference")

			// Check extension
			if channel.Extensions != nil {
				assert.Equal(t, channel.Extensions["x-binance-security-type"],
					sendOp.Extensions["x-binance-security-type"],
					"Extension should be propagated to operation")
			}
		} else {
			// No security for public methods
			assert.Nil(t, sendOp.Security, "Send operation should not have security for %s", channel.Name)
			assert.Nil(t, receiveOp.Security, "Receive operation should not have security for %s", channel.Name)
		}
	}
}

// TestAsyncAPISecuritySchemesGeneration tests the generation of security schemes in components
func TestAsyncAPISecuritySchemesGeneration(t *testing.T) {
	g := &Generator{}

	// Create channels with various security schemas
	channels := []wsparser.Channel{
		{
			Name: "order.place",
			SecuritySchemas: map[string]*wsparser.SecuritySchema{
				"trade": {
					Type: "apiKey",
					Name: "trade",
					In:   "user",
				},
			},
		},
		{
			Name: "account.status",
			SecuritySchemas: map[string]*wsparser.SecuritySchema{
				"userData": {
					Type: "apiKey",
					Name: "userData",
					In:   "user",
				},
			},
		},
		{
			Name: "session.logon",
			SecuritySchemas: map[string]*wsparser.SecuritySchema{
				"userData": { // SIGNED maps to userData, so same schema
					Type: "apiKey",
					Name: "userData",
					In:   "user",
				},
			},
		},
	}

	// Generate AsyncAPI spec
	spec := g.GenerateAsyncAPISpecFromChannels(channels, "Test API", "1.0.0", nil)

	require.NotNil(t, spec, "Generated spec should not be nil")
	require.NotNil(t, spec.Components, "Components should not be nil")
	require.NotNil(t, spec.Components.SecuritySchemes, "SecuritySchemes should not be nil")

	// Check that security schemes are correctly generated
	assert.Contains(t, spec.Components.SecuritySchemes, "trade",
		"Should have trade security scheme")
	assert.Contains(t, spec.Components.SecuritySchemes, "userData",
		"Should have userData security scheme")

	// Verify trade schema properties
	tradeSchema := spec.Components.SecuritySchemes["trade"]
	assert.Equal(t, "apiKey", tradeSchema.Type, "Trade schema type should be apiKey")
	assert.Equal(t, "user", tradeSchema.In, "Trade schema 'in' should be user")
	assert.Contains(t, tradeSchema.Description, "Trading operations",
		"Trade schema should have correct description")

	// Verify userData schema properties
	userDataSchema := spec.Components.SecuritySchemes["userData"]
	assert.Equal(t, "apiKey", userDataSchema.Type, "UserData schema type should be apiKey")
	assert.Equal(t, "user", userDataSchema.In, "UserData schema 'in' should be user")
	assert.Contains(t, userDataSchema.Description, "Private user data",
		"UserData schema should have correct description")
}

// TestAsyncAPISecurityValidation tests that generated specs pass AsyncAPI validation
func TestAsyncAPISecurityValidation(t *testing.T) {
	g := &Generator{}

	// Create a complete channel with security
	channel := wsparser.Channel{
		Name:        "order.place",
		Summary:     "Place new order",
		Description: "Place a new order on the exchange",
		Security: []map[string][]string{
			{"trade": {}},
		},
		SecuritySchemas: map[string]*wsparser.SecuritySchema{
			"trade": {
				Type: "apiKey",
				Name: "trade",
				In:   "user",
			},
		},
		Extensions: map[string]interface{}{
			"x-binance-security-type": "TRADE",
		},
		Messages: map[string]*wsparser.Message{
			"request": {
				Name:        "orderPlaceRequest",
				ContentType: "application/json",
				Payload: &wsparser.Schema{
					Type: "object",
					Properties: map[string]*wsparser.Schema{
						"symbol":   {Type: "string"},
						"side":     {Type: "string"},
						"type":     {Type: "string"},
						"price":    {Type: "string"},
						"quantity": {Type: "string"},
					},
				},
			},
			"response": {
				Name:        "orderPlaceResponse",
				ContentType: "application/json",
				Payload: &wsparser.Schema{
					Type: "object",
					Properties: map[string]*wsparser.Schema{
						"orderId": {Type: "integer"},
						"status":  {Type: "string"},
					},
				},
			},
		},
	}

	// Generate AsyncAPI spec
	spec := g.GenerateAsyncAPISpecFromChannels([]wsparser.Channel{channel}, "Test API", "1.0.0", nil)

	// Marshal to YAML to verify structure
	yamlData, err := yaml.Marshal(spec)
	require.NoError(t, err, "Should marshal spec to YAML")

	// Parse back to verify structure
	var parsedSpec map[string]interface{}
	err = yaml.Unmarshal(yamlData, &parsedSpec)
	require.NoError(t, err, "Should unmarshal YAML")

	// Verify AsyncAPI version
	assert.Equal(t, "3.0.0", parsedSpec["asyncapi"], "Should be AsyncAPI 3.0.0")

	// Verify security schemes exist in components
	components, ok := parsedSpec["components"].(map[string]interface{})
	require.True(t, ok, "Should have components")

	securitySchemes, ok := components["securitySchemes"].(map[string]interface{})
	require.True(t, ok, "Should have securitySchemes in components")

	tradeScheme, ok := securitySchemes["trade"].(map[string]interface{})
	require.True(t, ok, "Should have trade security scheme")

	assert.Equal(t, "apiKey", tradeScheme["type"], "Trade scheme should have type apiKey")
	assert.Equal(t, "user", tradeScheme["in"], "Trade scheme should have in: user")

	// Verify operations have security references
	operations, ok := parsedSpec["operations"].(map[string]interface{})
	require.True(t, ok, "Should have operations")

	sendOp, ok := operations["sendOrderPlace"].(map[string]interface{})
	require.True(t, ok, "Should have sendOrderPlace operation")

	security, ok := sendOp["security"].([]interface{})
	require.True(t, ok, "Should have security array")
	require.Len(t, security, 1, "Should have one security requirement")

	securityRef, ok := security[0].(map[string]interface{})
	require.True(t, ok, "Security should be a map")
	assert.Contains(t, securityRef, "$ref", "Security should have $ref")
	assert.Equal(t, "#/components/securitySchemes/trade", securityRef["$ref"],
		"Should reference trade security scheme")
}

// Helper function to capitalize first letter
func capitalize(s string) string {
	if len(s) == 0 {
		return s
	}
	// Handle dot notation (e.g., "order.place" -> "OrderPlace")
	parts := strings.Split(s, ".")
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return strings.Join(parts, "")
}
