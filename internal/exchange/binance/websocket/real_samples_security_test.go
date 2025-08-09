package binance

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/openxapi/openxapi/internal/config"
	wsParser "github.com/openxapi/openxapi/internal/parser/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestRealSamplesSecurity tests security extraction from real Binance WebSocket API documentation samples
func TestRealSamplesSecurity(t *testing.T) {
	parser := &DocumentParser{}
	samplesDir := filepath.Join("..", "..", "..", "..", "samples", "binance", "websocket", "spot")

	testCases := []struct {
		filename        string
		url             string
		expectedMethods map[string]string // method name -> expected security type
	}{
		{
			filename: "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_general-requests.html",
			url:      "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/general-requests",
			expectedMethods: map[string]string{
				"ping":         "", // No security (public)
				"time":         "", // No security (public)
				"exchangeInfo": "", // No security (public)
			},
		},
		{
			filename: "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_market-data-requests.html",
			url:      "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/market-data-requests",
			expectedMethods: map[string]string{
				"depth":             "", // No security (market data)
				"trades.recent":     "", // No security (market data)
				"trades.historical": "", // No security (market data)
				"trades.aggregate":  "", // No security (market data)
				"klines":            "", // No security (market data)
				"uiKlines":          "", // No security (market data)
				"avgPrice":          "", // No security (market data)
				"ticker.24hr":       "", // No security (market data)
				"ticker.tradingDay": "", // No security (market data)
				"ticker":            "", // No security (market data)
				"ticker.price":      "", // No security (market data)
				"ticker.book":       "", // No security (market data)
			},
		},
		{
			filename: "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_authentication-requests.html",
			url:      "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/authentication-requests",
			expectedMethods: map[string]string{
				"session.logon":  "userData", // SIGNED -> userData
				"session.status": "",         // No security (status check)
				"session.logout": "",         // No security (logout)
			},
		},
		{
			filename: "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_account-requests.html",
			url:      "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/account-requests",
			expectedMethods: map[string]string{
				"account.status":            "userData", // USER_DATA
				"account.commission":        "userData", // USER_DATA
				"account.rateLimits.orders": "userData", // USER_DATA
				"order.status":              "userData", // USER_DATA (query order status)
				"openOrders.status":         "userData", // USER_DATA (query open orders)
				"orderList.status":          "userData", // USER_DATA (query order list)
				"openOrderLists.status":     "userData", // USER_DATA (query open order lists)
				"allOrders":                 "userData", // USER_DATA
				"allOrderLists":             "userData", // USER_DATA
				"myTrades":                  "userData", // USER_DATA
				"myPreventedMatches":        "userData", // USER_DATA
				"myAllocations":             "userData", // USER_DATA
				"order.amendments":          "userData", // USER_DATA (query order amendments)
			},
		},
		{
			filename: "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_trading-requests.html",
			url:      "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/trading-requests",
			expectedMethods: map[string]string{
				"order.test":               "trade", // TRADE
				"order.place":              "trade", // TRADE
				"order.cancel":             "trade", // TRADE
				"order.cancelReplace":      "trade", // TRADE
				"order.amend.keepPriority": "trade", // TRADE
				"openOrders.cancelAll":     "trade", // TRADE
				"orderList.place":          "trade", // TRADE
				"orderList.place.oco":      "trade", // TRADE
				"orderList.place.oto":      "trade", // TRADE
				"orderList.place.otoco":    "trade", // TRADE
				"orderList.cancel":         "trade", // TRADE
				// Note: sor.order.test and sor.order.place might not have explicit (TRADE) in title
			},
		},
		{
			filename: "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_user-data-stream-requests.html",
			url:      "https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/user-data-stream-requests",
			expectedMethods: map[string]string{
				"userDataStream.start": "userStream", // USER_STREAM
				"userDataStream.ping":  "userStream", // USER_STREAM
				"userDataStream.stop":  "userStream", // USER_STREAM
				// Note: subscribe/unsubscribe might not have explicit security in titles
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.filename, func(t *testing.T) {
			// Open and parse the sample file
			samplePath := filepath.Join(samplesDir, tc.filename)
			file, err := os.Open(samplePath)
			require.NoError(t, err, "Failed to open sample file: %s", tc.filename)
			defer file.Close()

			urlEntity := &config.URLEntity{
				URL:     tc.url,
				DocType: "spot",
			}

			channels, err := parser.Parse(file, urlEntity, []string{})
			require.NoError(t, err, "Failed to parse document: %s", tc.filename)

			// Create a map of actual methods found with their security
			actualMethods := make(map[string]string)
			for _, channel := range channels {
				securityType := ""
				if channel.Security != nil && len(channel.Security) > 0 {
					// Get the first security scheme name
					for schemeName := range channel.Security[0] {
						securityType = schemeName
						break
					}
				}
				actualMethods[channel.Name] = securityType

				// Log what we found for debugging
				t.Logf("Found method: %s, Security: %s, Extension: %v",
					channel.Name, securityType, channel.Extensions["x-binance-security-type"])
			}

			// Check expected methods
			for methodName, expectedSecurity := range tc.expectedMethods {
				actualSecurity, found := actualMethods[methodName]
				assert.True(t, found, "Expected to find method %s in %s", methodName, tc.filename)

				if found {
					assert.Equal(t, expectedSecurity, actualSecurity,
						"Method %s in %s should have security '%s' but has '%s'",
						methodName, tc.filename, expectedSecurity, actualSecurity)
				}
			}
		})
	}
}

// TestSpecificSecurityTypes tests that specific security type patterns are correctly extracted
func TestSpecificSecurityTypes(t *testing.T) {
	parser := &DocumentParser{}
	samplesDir := filepath.Join("..", "..", "..", "..", "samples", "binance", "websocket", "spot")

	// Test specific files known to have certain security types
	testCases := []struct {
		name              string
		filename          string
		methodName        string
		expectedSecurity  string
		expectedExtension string
	}{
		{
			name:              "TRADE security in order.place",
			filename:          "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_trading-requests.html",
			methodName:        "order.place",
			expectedSecurity:  "trade",
			expectedExtension: "TRADE",
		},
		{
			name:              "USER_DATA security in account.status",
			filename:          "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_account-requests.html",
			methodName:        "account.status",
			expectedSecurity:  "userData",
			expectedExtension: "USER_DATA",
		},
		{
			name:              "USER_STREAM security in userDataStream.start",
			filename:          "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_user-data-stream-requests.html",
			methodName:        "userDataStream.start",
			expectedSecurity:  "userStream",
			expectedExtension: "USER_STREAM",
		},
		{
			name:              "SIGNED security in session.logon",
			filename:          "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_authentication-requests.html",
			methodName:        "session.logon",
			expectedSecurity:  "userData",
			expectedExtension: "SIGNED",
		},
		{
			name:              "No security in ping",
			filename:          "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_general-requests.html",
			methodName:        "ping",
			expectedSecurity:  "",
			expectedExtension: "",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Open and parse the sample file
			samplePath := filepath.Join(samplesDir, tc.filename)
			file, err := os.Open(samplePath)
			require.NoError(t, err, "Failed to open sample file: %s", tc.filename)
			defer file.Close()

			urlEntity := &config.URLEntity{
				URL:     "https://test.example.com",
				DocType: "spot",
			}

			channels, err := parser.Parse(file, urlEntity, []string{})
			require.NoError(t, err, "Failed to parse document: %s", tc.filename)

			// Find the specific method
			var targetChannel *wsParser.Channel
			for i := range channels {
				if channels[i].Name == tc.methodName {
					targetChannel = &channels[i]
					break
				}
			}

			require.NotNil(t, targetChannel, "Method %s not found in %s", tc.methodName, tc.filename)

			// Check security
			if tc.expectedSecurity == "" {
				assert.Nil(t, targetChannel.Security,
					"Method %s should have no security", tc.methodName)
				assert.Nil(t, targetChannel.Extensions,
					"Method %s should have no extensions", tc.methodName)
			} else {
				require.NotNil(t, targetChannel.Security,
					"Method %s should have security", tc.methodName)
				require.Len(t, targetChannel.Security, 1,
					"Method %s should have exactly one security requirement", tc.methodName)

				// Check the security scheme name
				assert.Contains(t, targetChannel.Security[0], tc.expectedSecurity,
					"Method %s should have security scheme '%s'", tc.methodName, tc.expectedSecurity)

				// Check the extension
				if tc.expectedExtension != "" {
					require.NotNil(t, targetChannel.Extensions,
						"Method %s should have extensions", tc.methodName)
					assert.Equal(t, tc.expectedExtension, targetChannel.Extensions["x-binance-security-type"],
						"Method %s should have x-binance-security-type '%s'", tc.methodName, tc.expectedExtension)
				}
			}
		})
	}
}

// TestSecurityConsistency tests that all methods requiring authentication have proper security defined
func TestSecurityConsistency(t *testing.T) {
	parser := &DocumentParser{}
	samplesDir := filepath.Join("..", "..", "..", "..", "samples", "binance", "websocket", "spot")

	// Files that should have security on most/all methods
	securedFiles := []struct {
		filename              string
		shouldHaveSecurity    []string // Methods that must have security
		shouldNotHaveSecurity []string // Methods that should not have security
	}{
		{
			filename: "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_trading-requests.html",
			shouldHaveSecurity: []string{
				"order.test", "order.place", "order.cancel", "order.cancelReplace",
				"openOrders.cancelAll", "orderList.place", "orderList.cancel",
				"sor.order.test", "sor.order.place",
			},
			shouldNotHaveSecurity: []string{}, // All trading operations require security
		},
		{
			filename: "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_account-requests.html",
			shouldHaveSecurity: []string{
				"account.status", "account.commission", "account.rateLimits.orders",
				"allOrders", "allOrderLists", "myTrades",
			},
			shouldNotHaveSecurity: []string{}, // All account operations require security
		},
		{
			filename:           "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_general-requests.html",
			shouldHaveSecurity: []string{},
			shouldNotHaveSecurity: []string{
				"ping", "time", "exchangeInfo", // All general requests are public
			},
		},
		{
			filename:           "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_market-data-requests.html",
			shouldHaveSecurity: []string{},
			shouldNotHaveSecurity: []string{
				"depth", "trades.recent", "klines", "ticker.24hr", // All market data is public
			},
		},
	}

	for _, tc := range securedFiles {
		t.Run(tc.filename, func(t *testing.T) {
			// Open and parse the sample file
			samplePath := filepath.Join(samplesDir, tc.filename)
			file, err := os.Open(samplePath)
			require.NoError(t, err, "Failed to open sample file: %s", tc.filename)
			defer file.Close()

			urlEntity := &config.URLEntity{
				URL:     "https://test.example.com",
				DocType: "spot",
			}

			channels, err := parser.Parse(file, urlEntity, []string{})
			require.NoError(t, err, "Failed to parse document: %s", tc.filename)

			// Create a map of methods and their security status
			methodSecurity := make(map[string]bool)
			for _, channel := range channels {
				hasSecurity := channel.Security != nil && len(channel.Security) > 0
				methodSecurity[channel.Name] = hasSecurity
			}

			// Check methods that should have security
			for _, methodName := range tc.shouldHaveSecurity {
				hasSecurity, found := methodSecurity[methodName]
				if found {
					assert.True(t, hasSecurity,
						"Method %s in %s should have security defined", methodName, tc.filename)
				}
			}

			// Check methods that should NOT have security
			for _, methodName := range tc.shouldNotHaveSecurity {
				hasSecurity, found := methodSecurity[methodName]
				if found {
					assert.False(t, hasSecurity,
						"Method %s in %s should NOT have security defined", methodName, tc.filename)
				}
			}
		})
	}
}

// TestSecuritySchemaReferences tests that security schemas are properly referenced
func TestSecuritySchemaReferences(t *testing.T) {
	parser := &DocumentParser{}
	samplesDir := filepath.Join("..", "..", "..", "..", "samples", "binance", "websocket", "spot")

	// Parse a file with different security types
	samplePath := filepath.Join(samplesDir, "https_developers.binance.com_docs_binance-spot-api-docs_websocket-api_trading-requests.html")
	file, err := os.Open(samplePath)
	require.NoError(t, err, "Failed to open trading requests sample")
	defer file.Close()

	urlEntity := &config.URLEntity{
		URL:     "https://test.example.com",
		DocType: "spot",
	}

	channels, err := parser.Parse(file, urlEntity, []string{})
	require.NoError(t, err, "Failed to parse trading requests")

	// Collect all unique security schemes used
	securitySchemes := make(map[string]bool)
	for _, channel := range channels {
		if channel.Security != nil && len(channel.Security) > 0 {
			for schemeName := range channel.Security[0] {
				securitySchemes[schemeName] = true
			}
		}

		// Also check that SecuritySchemas are set
		if channel.SecuritySchemas != nil {
			for schemeName, schema := range channel.SecuritySchemas {
				assert.NotNil(t, schema, "Security schema %s should not be nil", schemeName)
				assert.Equal(t, "apiKey", schema.Type, "Security schema %s should have type 'apiKey'", schemeName)
				assert.Equal(t, "user", schema.In, "Security schema %s should have 'in: user'", schemeName)
			}
		}
	}

	// We expect to find at least 'trade' and 'userData' schemes in trading requests
	assert.True(t, securitySchemes["trade"] || securitySchemes["userData"],
		"Should find 'trade' or 'userData' security schemes in trading requests")
}
