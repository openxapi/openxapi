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
