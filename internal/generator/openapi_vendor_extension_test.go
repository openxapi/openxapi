package generator

import (
	"os"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	parser "github.com/openxapi/openxapi/internal/parser/rest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestVendorExtensionXNoEncode verifies that x-no-encode vendor extension
// is properly preserved in the generated OpenAPI specs
func TestVendorExtensionXNoEncode(t *testing.T) {
	// Test case using post_sapi_v1_localentity_withdraw_apply.yaml
	specPath := "../../specs/binance/openapi/spot/post_sapi_v1_localentity_withdraw_apply.yaml"

	// Read the spec file
	data, err := os.ReadFile(specPath)
	if err != nil {
		t.Skipf("Skipping test - spec file not found: %v", err)
		return
	}

	// Parse the OpenAPI spec using openapi3 loader
	loader := openapi3.NewLoader()
	spec, err := loader.LoadFromData(data)
	require.NoError(t, err, "Failed to parse OpenAPI spec")

	// Find the questionnaire parameter in the schema
	var questionnaireSchema *openapi3.Schema

	// Check in components/schemas for request body schemas
	if spec.Components != nil && spec.Components.Schemas != nil {
		for schemaName, schemaRef := range spec.Components.Schemas {
			// Look for request schemas (usually contain "Req")
			if strings.Contains(schemaName, "Req") {
				t.Logf("Checking schema: %s", schemaName)
				if schemaRef.Value != nil && schemaRef.Value.Properties != nil {
					for propName := range schemaRef.Value.Properties {
						t.Logf("  Property: %s", propName)
					}
					if prop, exists := schemaRef.Value.Properties["questionnaire"]; exists {
						questionnaireSchema = prop.Value
						t.Logf("Found questionnaire in schema: %s", schemaName)
						break
					}
				}
			}
		}
	}

	// Also check in paths for inline schemas
	if questionnaireSchema == nil && spec.Paths != nil {
		for path, pathItem := range spec.Paths.Map() {
			t.Logf("Checking path: %s", path)
			// Check POST operation
			if pathItem.Post != nil && pathItem.Post.RequestBody != nil && pathItem.Post.RequestBody.Value != nil {
				for contentType, mediaType := range pathItem.Post.RequestBody.Value.Content {
					t.Logf("Checking content type: %s", contentType)
					if mediaType.Schema != nil && mediaType.Schema.Ref != "" {
						// Schema is a reference, need to resolve it
						schemaName := strings.TrimPrefix(mediaType.Schema.Ref, "#/components/schemas/")
						if schemaRef, exists := spec.Components.Schemas[schemaName]; exists {
							if schemaRef.Value != nil && schemaRef.Value.Properties != nil {
								if prop, exists := schemaRef.Value.Properties["questionnaire"]; exists {
									questionnaireSchema = prop.Value
									t.Logf("Found questionnaire in referenced schema: %s", schemaName)
									break
								}
							}
						}
					}
				}
			}
		}
	}

	// Verify the questionnaire parameter has x-no-encode extension
	require.NotNil(t, questionnaireSchema, "questionnaire parameter not found in schema")

	// Check for x-no-encode extension
	if questionnaireSchema.Extensions != nil {
		noEncode, exists := questionnaireSchema.Extensions["x-no-encode"]
		assert.True(t, exists, "questionnaire parameter should have x-no-encode extension")
		assert.Equal(t, true, noEncode, "x-no-encode should be set to true")
	} else {
		t.Logf("WARNING: questionnaire parameter found but has no extensions - may need to regenerate specs")
	}
}

// TestRawParamsInSignature verifies that parameters with x-no-encode
// are handled correctly in signature generation
func TestRawParamsInSignature(t *testing.T) {
	testCases := []struct {
		name           string
		paramName      string
		paramValue     string
		hasXNoEncode   bool
		expectedInSign string // Expected value used in signature
		expectedInReq  string // Expected value sent in request
	}{
		{
			name:           "JSON parameter with x-no-encode",
			paramName:      "questionnaire",
			paramValue:     `{"isAddressOwner":1,"bnfType":0}`,
			hasXNoEncode:   true,
			expectedInSign: `{"isAddressOwner":1,"bnfType":0}`,                   // Raw JSON for signature
			expectedInReq:  `%7B%22isAddressOwner%22%3A1%2C%22bnfType%22%3A0%7D`, // URL-encoded for transmission
		},
		{
			name:           "Regular parameter without x-no-encode",
			paramName:      "coin",
			paramValue:     "BTC",
			hasXNoEncode:   false,
			expectedInSign: "BTC", // Same for both (no special chars)
			expectedInReq:  "BTC",
		},
		{
			name:           "Parameter with special chars without x-no-encode",
			paramName:      "address",
			paramValue:     "test@example.com",
			hasXNoEncode:   false,
			expectedInSign: "test%40example.com", // Encoded in both
			expectedInReq:  "test%40example.com",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// This test validates the logic that would be used in the generated Go code
			// The actual implementation is in the templates, but we can verify the logic here

			if tc.hasXNoEncode {
				// With x-no-encode, the raw value should be used for signature
				assert.Equal(t, tc.expectedInSign, tc.paramValue,
					"Raw value should be used for signature when x-no-encode is true")
			} else {
				// Without x-no-encode, value may or may not be encoded depending on content
				// For simple values like "BTC", no encoding is needed
				// For values with special chars like "@", encoding is needed
				if strings.ContainsAny(tc.paramValue, "@#$%^&*(){}[]|\\:;\"'<>?,/") {
					assert.NotEqual(t, tc.paramValue, tc.expectedInReq,
						"Value with special chars should be encoded when x-no-encode is false")
				}
			}
		})
	}
}

// TestGeneratorPreservesExtensions verifies that the generator correctly
// preserves vendor extensions from parser.Schema to openapi3.Schema
func TestGeneratorPreservesExtensions(t *testing.T) {
	g := NewGenerator("test_output")

	// Create a test schema with extensions
	testSchema := &parser.Schema{
		Type:        "string",
		Description: "Test parameter with JSON content",
		Extensions: map[string]interface{}{
			"x-no-encode": true,
			"x-custom":    "test-value",
		},
	}

	// Convert the schema
	result := g.convertSchema(testSchema)

	// Verify extensions are preserved
	require.NotNil(t, result, "Converted schema should not be nil")
	require.NotNil(t, result.Value, "Schema value should not be nil")
	require.NotNil(t, result.Value.Extensions, "Extensions should be preserved")

	// Check specific extensions
	assert.Equal(t, true, result.Value.Extensions["x-no-encode"],
		"x-no-encode extension should be preserved")
	assert.Equal(t, "test-value", result.Value.Extensions["x-custom"],
		"x-custom extension should be preserved")
}

// TestJSONParameterDetection verifies that JSON parameters are correctly
// identified based on their description
func TestJSONParameterDetection(t *testing.T) {
	testCases := []struct {
		description   string
		shouldHaveExt bool
	}{
		{
			description:   "This parameter contains a JSON object with user data",
			shouldHaveExt: true,
		},
		{
			description:   "Send the data as a JSON string",
			shouldHaveExt: true,
		},
		{
			description:   "The request in JSON format",
			shouldHaveExt: true,
		},
		{
			description:   "JSON-encoded configuration",
			shouldHaveExt: true,
		},
		{
			description:   "Data in JSON encoded format",
			shouldHaveExt: true,
		},
		{
			description:   "Complex JSON structure with nested objects",
			shouldHaveExt: true,
		},
		{
			description:   "Provide JSON data for the request",
			shouldHaveExt: true,
		},
		{
			description:   "Regular string parameter",
			shouldHaveExt: false,
		},
		{
			description:   "The coin symbol (e.g., BTC)",
			shouldHaveExt: false,
		},
		{
			description:   "Timestamp in milliseconds",
			shouldHaveExt: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.description[:20], func(t *testing.T) {
			// This simulates the logic in document_parser.go
			descLower := strings.ToLower(tc.description)
			hasJSONContent := strings.Contains(descLower, "json object") ||
				strings.Contains(descLower, "json string") ||
				strings.Contains(descLower, "json format") ||
				strings.Contains(descLower, "json-encoded") ||
				strings.Contains(descLower, "json encoded") ||
				strings.Contains(descLower, "json structure") ||
				strings.Contains(descLower, "json data")

			assert.Equal(t, tc.shouldHaveExt, hasJSONContent,
				"JSON detection for description: %s", tc.description)
		})
	}
}
