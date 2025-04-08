package okx

import (
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
	"github.com/adshao/openxapi/internal/parser"
	"github.com/stretchr/testify/assert"
)

func TestCheckResponseIsArranged(t *testing.T) {
	tests := []struct {
		name     string
		htmlStr  string
		expected bool
	}{
		{
			name: "response is arranged in array",
			htmlStr: `
				<table><tbody>
					<tr><td>Test</td></tr>
				<tbody></table>
				<p>Response is arranged in an array of objects</p>
				<h3>GET / Candlesticks history</h3>
			`,
			expected: true,
		},
		{
			name: "response is not arranged in array",
			htmlStr: `
				<table><tbody>
					<tr><td>Test</td></tr>
				<tbody></table>
				<p>Response contains object properties</p>
				<h3>GET / Candlesticks history</h3>
			`,
			expected: false,
		},
		{
			name: "response is arranged in array with aside",
			htmlStr: `
			<table><tbody>
			<tr><td style="text-align: left">ts</td><td style="text-align: left">String</td><td style="text-align: left">Opening time of the candlestick, Unix timestamp format in milliseconds, e.g. <code>1597026383085</code></td>
			</tr>
			</tbody></table>
			<aside class="notice">
				<p>The first candlestick data may be incomplete, and should not be polled repeatedly.</p>
				<p>The data returned will be arranged in an array like this: [ts,o,h,l,c,vol,volCcy,volCcyQuote,confirm]. </p>
				For the current cycle of k-line data, when there is no transaction, the opening high and closing low default take the closing price of the previous cycle.
			</aside>
			<h3>GET / Candlesticks history</h3>
			`,
			expected: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			doc, err := goquery.NewDocumentFromReader(strings.NewReader(tc.htmlStr))
			assert.NoError(t, err)

			table := doc.Find("table")
			result := checkResponseIsArranged(table)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestIsParameterDeprecated(t *testing.T) {
	tests := []struct {
		desc     string
		expected bool
	}{
		{
			desc:     "This parameter is deprecated (deprecated)",
			expected: true,
		},
		{
			desc:     "This parameter is important",
			expected: false,
		},
		{
			desc:     "This parameter is DEPRECATED",
			expected: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.desc, func(t *testing.T) {
			result := isParameterDeprecated(tc.desc)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestFormatParameterDescription(t *testing.T) {
	tests := []struct {
		name     string
		htmlStr  string
		expected string
	}{
		{
			name:     "plain text",
			htmlStr:  "<table><tbody><tr><td>Single position ID or multiple position IDs (no more than 20) separated with comma. <br>There is attribute expiration, the posId and position information will be cleared if it is more than 30 days after the last full close position.</td></tr></tbody></table>",
			expected: "Single position ID or multiple position IDs (no more than 20) separated with comma. \n\nThere is attribute expiration, the posId and position information will be cleared if it is more than 30 days after the last full close position.",
		},
		{
			name:     "with code element",
			htmlStr:  "<table><tbody><tr><td>Instrument type<br><code>MARGIN</code><br><code>SWAP</code><br><code>FUTURES</code><br><code>OPTION</code><br><code>instId</code> will be checked against <code>instType</code> when both parameters are passed.</td></tr></tbody></table>",
			expected: "Instrument type\n\n`MARGIN`\n\n`SWAP`\n\n`FUTURES`\n\n`OPTION`\n\n`instId` will be checked against `instType` when both parameters are passed.",
		},
		{
			name:     "with del element",
			htmlStr:  "<table><tbody><tr><td><del>Quote currency balance, only applicable to <code>MARGIN</code>（Quick Margin Mode）</del>(Deprecated)</td></tr></tbody></table>",
			expected: "Quote currency balance, only applicable to `MARGIN`（Quick Margin Mode）(Deprecated)",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			doc, err := goquery.NewDocumentFromReader(strings.NewReader(tc.htmlStr))
			assert.NoError(t, err)
			result := formatParameterDescription(doc.Find("td").First().Nodes[0])
			assert.Contains(t, result, tc.expected)
		})
	}
}

func TestCheckEndpointIsProtected(t *testing.T) {
	tests := []struct {
		name     string
		rule     string
		expected bool
	}{
		{
			name:     "empty rule",
			rule:     "",
			expected: false,
		},
		{
			name:     "contains user id",
			rule:     "Rate limit rule: User ID + Instrument Type",
			expected: true,
		},
		{
			name:     "no user id",
			rule:     "Rate limit rule: IP + Instrument Type",
			expected: false,
		},
		{
			name:     "contains user id but with or condition",
			rule:     "Rate limit rule: User ID(Private) or IP(Public)",
			expected: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := checkEndpointIsProtected(tc.rule)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestOperationID(t *testing.T) {
	tests := []struct {
		docType  string
		method   string
		path     string
		expected string
	}{
		{
			docType:  "rest",
			method:   "GET",
			path:     "/api/v5/account/balance",
			expected: "RestGetAccountBalanceV5",
		},
		{
			docType:  "rest",
			method:   "POST",
			path:     "/api/v5/trade/order",
			expected: "RestCreateTradeOrderV5",
		},
		{
			docType:  "market",
			method:   "DELETE",
			path:     "/api/v5/market/books",
			expected: "MarketDeleteMarketBooksV5",
		},
		{
			docType:  "market",
			method:   "PUT",
			path:     "/api/v5/market/ticker",
			expected: "MarketUpdateMarketTickerV5",
		},
		{
			docType:  "market",
			method:   "GET",
			path:     "/api/v5/market/ticker-price",
			expected: "MarketGetMarketTickerPriceV5",
		},
		{
			docType:  "rest",
			method:   "POST",
			path:     "/api/v5/tradingBot/signal/create-signal",
			expected: "RestCreateTradingBotSignalCreateSignalV5",
		},
	}

	for _, tc := range tests {
		t.Run(tc.path, func(t *testing.T) {
			result := operationID(tc.docType, tc.method, tc.path)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestMethodToAction(t *testing.T) {
	tests := []struct {
		method   string
		expected string
	}{
		{method: "GET", expected: "Get"},
		{method: "POST", expected: "Create"},
		{method: "PUT", expected: "Update"},
		{method: "PATCH", expected: "Update"},
		{method: "DELETE", expected: "Delete"},
		{method: "UNKNOWN", expected: ""},
	}

	for _, tc := range tests {
		t.Run(tc.method, func(t *testing.T) {
			result := methodToAction(tc.method)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestNormalizeType(t *testing.T) {
	tests := []struct {
		paramType string
		expected  string
	}{
		{paramType: "INT", expected: parser.IntegerType},
		{paramType: "LONG", expected: parser.IntegerType},
		{paramType: "INTEGER", expected: parser.IntegerType},
		{paramType: "FLOAT", expected: parser.NumberType},
		{paramType: "DOUBLE", expected: parser.NumberType},
		{paramType: "STRING", expected: parser.StringType},
		{paramType: "ENUM", expected: parser.StringType},
		{paramType: "DECIMAL", expected: parser.StringType},
		{paramType: "BOOLEAN", expected: parser.BooleanType},
		{paramType: "BOOL", expected: parser.BooleanType},
		{paramType: "ARRAY", expected: parser.ArrayOfStringType},
		{paramType: "ARRAY OF STRING", expected: parser.ArrayOfStringType},
		{paramType: "ARRAY OF STRINGS", expected: parser.ArrayOfStringType},
		{paramType: "ARRAY OF OBJECTS", expected: parser.ArrayOfObjectType},
		{paramType: "ARRAY OF OBJECT", expected: parser.ArrayOfObjectType},
		{paramType: "ARRAY OF ARRAY", expected: parser.ArrayOfArrayType},
		{paramType: "OBJECT", expected: parser.ObjectType},
		{paramType: "UNKNOWN", expected: parser.StringType},
	}

	for _, tc := range tests {
		t.Run(tc.paramType, func(t *testing.T) {
			result := normalizeType(tc.paramType)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestGenerateSubAPIGroupName(t *testing.T) {
	tests := []struct {
		apiHeader string
		expected  string
	}{
		{
			apiHeader: "Get the invitee's detail",
			expected:  "get-the-invitee-39-s-detail",
		},
		{
			apiHeader: "GET / Announcement types",
			expected:  "get-announcement-types",
		},
		{
			apiHeader: "GET / Purchase&Redeem history",
			expected:  "get-purchase-amp-redeem-history",
		},
		{
			apiHeader: "Get history of sub-account transfer",
			expected:  "get-history-of-sub-account-transfer",
		},
		{
			apiHeader: "POST / Cancel purchases/redemptions",
			expected:  "post-cancel-purchases-redemptions",
		},
		{
			apiHeader: "GET / APY history (Public)",
			expected:  "get-apy-history-public",
		},
		{
			apiHeader: "Set greeks (PA/BS)",
			expected:  "set-greeks-pa-bs",
		},
	}

	for _, tc := range tests {
		t.Run(tc.apiHeader, func(t *testing.T) {
			result := generateSubAPIGroupName(tc.apiHeader)
			assert.Equal(t, tc.expected, result)
		})
	}
}
