package okx

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
	"github.com/openxapi/openxapi/internal/parser"
	"github.com/stretchr/testify/assert"
)

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
			result := generateParamDesc(doc.Find("td").First().Nodes[0])
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
			method:   "GET",
			path:     "/api/v5/account/balance",
			expected: "GetAccountBalanceV5",
		},
		{
			method:   "POST",
			path:     "/api/v5/trade/order",
			expected: "CreateTradeOrderV5",
		},
		{
			docType:  "market",
			method:   "DELETE",
			path:     "/api/v5/market/books",
			expected: "DeleteMarketBooksV5",
		},
		{
			docType:  "market",
			method:   "PUT",
			path:     "/api/v5/market/ticker",
			expected: "UpdateMarketTickerV5",
		},
		{
			docType:  "market",
			method:   "GET",
			path:     "/api/v5/market/ticker-price",
			expected: "GetMarketTickerPriceV5",
		},
		{
			method:   "POST",
			path:     "/api/v5/tradingBot/signal/create-signal",
			expected: "CreateTradingBotSignalCreateSignalV5",
		},
		{
			method:   "POST",
			path:     "/api/v5/finance/flexible-loan/adjust-collateral",
			expected: "CreateFinanceFlexibleLoanAdjustCollateralV5",
		},
	}

	for _, tc := range tests {
		t.Run(tc.path, func(t *testing.T) {
			result := operationID(tc.method, tc.path)
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

type DocSectionResult struct {
	DescElementsSize         int
	RequestTableFound        bool
	RequestTableID           string
	ResponseTableFound       bool
	ResponseTableID          string
	ResponseExampleFound     bool
	ResponseExampleElementID string
	ExtraElementsSize        int
}

func TestExtractEndpointDocumentSection(t *testing.T) {
	tests := []struct {
		name     string
		htmlStr  string
		expected DocSectionResult
	}{
		{
			name: "normal section",
			htmlStr: `
			<h3 id="trading-account-rest-api-get-instruments">Get instruments</h3>
			<p>Retrieve available instruments info of current account.</p>
			<aside class="notice">Interest-free quota and discount rates are public data and not displayed on the account interface.</aside>
			<p>Retrieve available instruments info of current account.</p>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-20-requests-per-2-seconds">Rate Limit: 20 requests per 2 seconds</h4>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-rule-user-id-instrument-type">Rate limit rule: User ID + Instrument Type</h4>
			<h4 id="trading-account-rest-api-get-instruments-permission-read">Permission: Read</h4>
			<h4 id="trading-account-rest-api-get-instruments-http-request">HTTP Request</h4>
			<p><code>GET /api/v5/account/instruments</code></p>
			<div class="highlight">
				<pre class="highlight shell tab-shell" style="display: none;">
					<code id="request-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-request-parameters">Request Parameters</h4>
			<table id="request-parameters-table"></table>
			<div class="highlight">
				<pre class="highlight json tab-json" style="display: none;">
					<code id="response-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-response-parameters">Response Parameters</h4>
			<table id="response-parameters-table"></table>
			<aside class="notice">listTime and auctionEndTime</aside>
			<h3 id="block-trading-rest-api-cancel-all-rfqs">Cancel all RFQs</h3>`,
			expected: DocSectionResult{
				DescElementsSize:         6,
				RequestTableFound:        true,
				RequestTableID:           "request-parameters-table",
				ResponseTableFound:       true,
				ResponseTableID:          "response-parameters-table",
				ResponseExampleFound:     true,
				ResponseExampleElementID: "response-example",
				ExtraElementsSize:        1,
			},
		},
		{
			name: "with empty summary",
			htmlStr: `<h3 id="trading-account-rest-api-get-instruments">Get instruments</h3>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-20-requests-per-2-seconds">Rate Limit: 20 requests per 2 seconds</h4>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-rule-user-id-instrument-type">Rate limit rule: User ID + Instrument Type</h4>
			<h4 id="trading-account-rest-api-get-instruments-http-request">HTTP Request</h4>
			<p><code>GET /api/v5/account/instruments</code></p>
			<div class="highlight">
				<pre class="highlight shell tab-shell" style="display: none;">
					<code id="request-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-request-parameters">Request Parameters</h4>
			<table id="request-parameters-table"></table>
			<div class="highlight">
				<pre class="highlight json tab-json" style="display: none;">
					<code id="response-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-response-parameters">Response Parameters</h4>
			<table id="response-parameters-table"></table>
			<aside class="notice">listTime and auctionEndTime</aside>
			<h3 id="block-trading-rest-api-cancel-all-rfqs">Cancel all RFQs</h3>`,
			expected: DocSectionResult{
				DescElementsSize:         2,
				RequestTableFound:        true,
				RequestTableID:           "request-parameters-table",
				ResponseTableFound:       true,
				ResponseTableID:          "response-parameters-table",
				ResponseExampleFound:     true,
				ResponseExampleElementID: "response-example",
				ExtraElementsSize:        1,
			},
		},
		{
			name: "with empty request parameter table",
			htmlStr: `
			<h3 id="trading-account-rest-api-get-instruments">Get instruments</h3>
			<p>Retrieve available instruments info of current account.</p>
			<aside class="notice">Interest-free quota and discount rates are public data and not displayed on the account interface.</aside>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-20-requests-per-2-seconds">Rate Limit: 20 requests per 2 seconds</h4>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-rule-user-id-instrument-type">Rate limit rule: User ID + Instrument Type</h4>
			<h4 id="trading-account-rest-api-get-instruments-permission-read">Permission: Read</h4>
			<h4 id="trading-account-rest-api-get-instruments-http-request">HTTP Request</h4>
			<p><code>GET /api/v5/account/instruments</code></p>
			<div class="highlight">
				<pre class="highlight shell tab-shell" style="display: none;">
					<code id="request-example">code</code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-request-parameters">Request Parameters</h4>
			<p>None</p>
			<div class="highlight">
				<pre class="highlight json tab-json" style="display: none;">
					<code id="response-example">code</code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-response-parameters">Response Parameters</h4>
			<table id="response-parameters-table"></table>
			<aside class="notice">listTime and auctionEndTime</aside>
			<h3 id="block-trading-rest-api-cancel-all-rfqs">Cancel all RFQs</h3>`,
			expected: DocSectionResult{
				DescElementsSize:         5,
				RequestTableFound:        false,
				RequestTableID:           "",
				ResponseTableFound:       true,
				ResponseTableID:          "response-parameters-table",
				ResponseExampleFound:     true,
				ResponseExampleElementID: "response-example",
				ExtraElementsSize:        1,
			},
		},
		{
			name: "with empty response parameter table",
			htmlStr: `<h3 id="trading-account-rest-api-get-instruments">Get instruments</h3>
			<p>Retrieve available instruments info of current account.</p>
			<aside class="notice">Interest-free quota and discount rates are public data and not displayed on the account interface.</aside>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-20-requests-per-2-seconds">Rate Limit: 20 requests per 2 seconds</h4>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-rule-user-id-instrument-type">Rate limit rule: User ID + Instrument Type</h4>
			<h4 id="trading-account-rest-api-get-instruments-permission-read">Permission: Read</h4>
			<h4 id="trading-account-rest-api-get-instruments-http-request">HTTP Request</h4>
			<p><code>GET /api/v5/account/instruments</code></p>
			<div class="highlight">
				<pre class="highlight shell tab-shell" style="display: none;">
					<code id="request-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-request-parameters">Request Parameters</h4>
			<table id="request-parameters-table"></table>
			<div class="highlight">
				<pre class="highlight json tab-json" style="display: none;">
					<code id="response-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-response-parameters">Response Parameters</h4>
			<p>code = <code>0</code> means your request has been successfully handled.</p>
			<aside class="notice">listTime and auctionEndTime</aside>
			<h3 id="block-trading-rest-api-cancel-all-rfqs">Cancel all RFQs</h3>`,
			expected: DocSectionResult{
				DescElementsSize:         5,
				RequestTableFound:        true,
				RequestTableID:           "request-parameters-table",
				ResponseTableFound:       false,
				ResponseTableID:          "",
				ResponseExampleFound:     true,
				ResponseExampleElementID: "response-example",
				ExtraElementsSize:        2,
			},
		},
		{
			name: "with http request element tag typo",
			htmlStr: `<h3 id="trading-account-rest-api-get-instruments">Get instruments</h3>
			<p>Retrieve available instruments info of current account.</p>
			<aside class="notice">Interest-free quota and discount rates are public data and not displayed on the account interface.</aside>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-20-requests-per-2-seconds">Rate Limit: 20 requests per 2 seconds</h4>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-rule-user-id-instrument-type">Rate limit rule: User ID + Instrument Type</h4>
			<h4 id="trading-account-rest-api-get-instruments-permission-read">Permission: Read</h4>
			<p>## HTTP Request</p>
			<p><code>GET /api/v5/account/instruments</code></p>
			<div class="highlight">
				<pre class="highlight shell tab-shell" style="display: none;">
					<code id="request-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-request-parameters">Request Parameters</h4>
			<table id="request-parameters-table"></table>
			<div class="highlight">
				<pre class="highlight json tab-json" style="display: none;">
					<code id="response-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-response-parameters">Response Parameters</h4>
			<table id="response-parameters-table"></table>
			<aside class="notice">listTime and auctionEndTime</aside>
			<h3 id="block-trading-rest-api-cancel-all-rfqs">Cancel all RFQs</h3>`,
			expected: DocSectionResult{
				DescElementsSize:         5,
				RequestTableFound:        true,
				RequestTableID:           "request-parameters-table",
				ResponseTableFound:       true,
				ResponseTableID:          "response-parameters-table",
				ResponseExampleFound:     true,
				ResponseExampleElementID: "response-example",
				ExtraElementsSize:        1,
			},
		},
		{
			name: "with http request element id typo",
			htmlStr: `<h3 id="trading-account-rest-api-get-instruments">Get instruments</h3>
			<p>Retrieve available instruments info of current account.</p>
			<aside class="notice">Interest-free quota and discount rates are public data and not displayed on the account interface.</aside>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-20-requests-per-2-seconds">Rate Limit: 20 requests per 2 seconds</h4>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-rule-user-id-instrument-type">Rate limit rule: User ID + Instrument Type</h4>
			<h4 id="trading-account-rest-api-get-instruments-permission-read">Permission: Read</h4>
			<h4 id="trading-account-rest-api-get-instruments-http">HTTP Request</h4>
			<p><code>GET /api/v5/account/instruments</code></p>
			<div class="highlight">
				<pre class="highlight shell tab-shell" style="display: none;">
					<code id="request-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-request-parameters">Request Parameters</h4>
			<table id="request-parameters-table"></table>
			<div class="highlight">
				<pre class="highlight json tab-json" style="display: none;">
					<code id="response-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-response-parameters">Response Parameters</h4>
			<table id="response-parameters-table"></table>
			<aside class="notice">listTime and auctionEndTime</aside>
			<h3 id="block-trading-rest-api-cancel-all-rfqs">Cancel all RFQs</h3>`,
			expected: DocSectionResult{
				DescElementsSize:         5,
				RequestTableFound:        true,
				RequestTableID:           "request-parameters-table",
				ResponseTableFound:       true,
				ResponseTableID:          "response-parameters-table",
				ResponseExampleFound:     true,
				ResponseExampleElementID: "response-example",
				ExtraElementsSize:        1,
			},
		},
		{
			name: "with response parameter table id typo",
			htmlStr: `
			<h3 id="trading-account-rest-api-get-instruments">Get instruments</h3>
			<p>Retrieve available instruments info of current account.</p>
			<aside class="notice">Interest-free quota and discount rates are public data and not displayed on the account interface.</aside>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-20-requests-per-2-seconds">Rate Limit: 20 requests per 2 seconds</h4>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-rule-user-id-instrument-type">Rate limit rule: User ID + Instrument Type</h4>
			<h4 id="trading-account-rest-api-get-instruments-permission-read">Permission: Read</h4>
			<h4 id="trading-account-rest-api-get-instruments-http-request">HTTP Request</h4>
			<p><code>GET /api/v5/account/instruments</code></p>
			<div class="highlight">
				<pre class="highlight shell tab-shell" style="display: none;">
					<code id="request-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-request-parameters">Request Parameters</h4>
			<table id="request-parameters-table"></table>
			<div class="highlight">
				<pre class="highlight json tab-json" style="display: none;">
					<code id="response-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-response-example">Response Example</h4>
			<table id="response-parameters-table"></table>
			<aside class="notice">listTime and auctionEndTime</aside>
			<h3 id="block-trading-rest-api-cancel-all-rfqs">Cancel all RFQs</h3>`,
			expected: DocSectionResult{
				DescElementsSize:         5,
				RequestTableFound:        true,
				RequestTableID:           "request-parameters-table",
				ResponseTableFound:       true,
				ResponseTableID:          "response-parameters-table",
				ResponseExampleFound:     true,
				ResponseExampleElementID: "response-example",
				ExtraElementsSize:        1,
			},
		},
		{
			name: "with duplicate http response element",
			htmlStr: `
			<h3 id="trading-account-rest-api-get-instruments">Get instruments</h3>
			<p>Retrieve available instruments info of current account.</p>
			<aside class="notice">Interest-free quota and discount rates are public data and not displayed on the account interface.</aside>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-20-requests-per-2-seconds">Rate Limit: 20 requests per 2 seconds</h4>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-rule-user-id-instrument-type">Rate limit rule: User ID + Instrument Type</h4>
			<h4 id="trading-account-rest-api-get-instruments-permission-read">Permission: Read</h4>
			<h4 id="trading-account-rest-api-get-instruments-http-request">HTTP Request</h4>
			<p><code>GET /api/v5/account/instruments</code></p>
			<div class="highlight">
				<pre class="highlight shell tab-shell" style="display: none;">
					<code id="request-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-response-parameters">Response Parameters</h4>
			<table id="request-parameters-table"></table>
			<div class="highlight">
				<pre class="highlight json tab-json" style="display: none;">
					<code id="response-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-response-parameters">Response Parameters</h4>
			<table id="response-parameters-table"></table>
			<aside class="notice">listTime and auctionEndTime</aside>
			<h3 id="block-trading-rest-api-cancel-all-rfqs">Cancel all RFQs</h3>`,
			expected: DocSectionResult{
				DescElementsSize:         5,
				RequestTableFound:        true,
				RequestTableID:           "request-parameters-table",
				ResponseTableFound:       true,
				ResponseTableID:          "response-parameters-table",
				ResponseExampleFound:     true,
				ResponseExampleElementID: "response-example",
				ExtraElementsSize:        1,
			},
		},
		{
			name: "with three table elements",
			htmlStr: `
			<h3 id="trading-account-rest-api-get-instruments">Get instruments</h3>
			<p>Retrieve available instruments info of current account.</p>
			<aside class="notice">Interest-free quota and discount rates are public data and not displayed on the account interface.</aside>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-20-requests-per-2-seconds">Rate Limit: 20 requests per 2 seconds</h4>
			<h4 id="trading-account-rest-api-get-instruments-rate-limit-rule-user-id-instrument-type">Rate limit rule: User ID + Instrument Type</h4>
			<h4 id="trading-account-rest-api-get-instruments-permission-read">Permission: Read</h4>
			<h4 id="trading-account-rest-api-get-instruments-http-request">HTTP Request</h4>
			<p><code>GET /api/v5/account/instruments</code></p>
			<div class="highlight">
				<pre class="highlight shell tab-shell" style="display: none;">
					<code id="request-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-request-parameters">Request Parameters</h4>
			<table id="request-parameters-table"></table>
			<div class="highlight">
				<pre class="highlight json tab-json" style="display: none;">
					<code id="response-example"></code>
				</pre>
			</div>
			<h4 id="trading-account-rest-api-get-instruments-response-parameters">Response Parameters</h4>
			<table id="response-parameters-table"></table>
			<table id="extra-parameters-table"></table>
			<aside class="notice">listTime and auctionEndTime</aside>
			<h3 id="block-trading-rest-api-cancel-all-rfqs">Cancel all RFQs</h3>`,
			expected: DocSectionResult{
				DescElementsSize:         5,
				RequestTableFound:        true,
				RequestTableID:           "request-parameters-table",
				ResponseTableFound:       true,
				ResponseTableID:          "response-parameters-table",
				ResponseExampleFound:     true,
				ResponseExampleElementID: "response-example",
				ExtraElementsSize:        1,
			},
		},
	}

	docParser := &DocumentParser{}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			doc, err := goquery.NewDocumentFromReader(strings.NewReader(tc.htmlStr))
			assert.NoError(t, err)
			endpointSelector := "h3[id*='trading-account-rest-api-get-instruments']"
			endpointSection := doc.Find(endpointSelector)
			result := docParser.extractEndpointDocumentSection(endpointSection)
			actual := DocSectionResult{
				DescElementsSize:         len(result.Description),
				RequestTableFound:        result.RequestParametersTable != nil,
				RequestTableID:           "",
				ResponseTableFound:       result.ResponseParametersTable != nil,
				ResponseTableID:          "",
				ResponseExampleFound:     result.ResponseExample != nil,
				ResponseExampleElementID: "",
				ExtraElementsSize:        len(result.ExtraElements),
			}
			if result.RequestParametersTable != nil {
				actual.RequestTableID = result.RequestParametersTable.AttrOr("id", "")
			}
			if result.ResponseParametersTable != nil {
				actual.ResponseTableID = result.ResponseParametersTable.AttrOr("id", "")
			}
			if result.ResponseExample != nil {
				actual.ResponseExampleElementID = result.ResponseExample.AttrOr("id", "")
			}
			assert.Equal(t, tc.expected.DescElementsSize, actual.DescElementsSize)
			assert.Equal(t, tc.expected.RequestTableFound, actual.RequestTableFound)
			assert.Equal(t, tc.expected.RequestTableID, actual.RequestTableID)
			assert.Equal(t, tc.expected.ResponseTableFound, actual.ResponseTableFound)
			assert.Equal(t, tc.expected.ResponseTableID, actual.ResponseTableID)
			assert.Equal(t, tc.expected.ResponseExampleFound, actual.ResponseExampleFound)
			assert.Equal(t, tc.expected.ResponseExampleElementID, actual.ResponseExampleElementID)
			assert.Equal(t, tc.expected.ExtraElementsSize, actual.ExtraElementsSize)
		})
	}
}

func TestFixInvalidJSON(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name: "JSON with single-line comments",
			input: `{
                "key": "value", // This is a comment
                "array": [1, 2, 3] // Another comment
            }`,
			expected: `{
                "key": "value", 
                "array": [1, 2, 3] 
            }`,
		},
		{
			name: "JSON with hash comments",
			input: `{
                "key": "value", # This is a comment
                "array": [1, 2, 3] # Another comment
            }`,
			expected: `{
                "key": "value", 
                "array": [1, 2, 3] 
            }`,
		},
		{
			name: "JSON with trailing commas in objects",
			input: `{
                "key1": "value1",
                "key2": "value2",
            }`,
			expected: `{
                "key1": "value1",
                "key2": "value2"
            }`,
		},
		{
			name: "JSON with trailing commas in arrays",
			input: `[
                "item1",
                "item2",
            ]`,
			expected: `[
                "item1",
                "item2"
            ]`,
		},
		{
			name: "JSON with both comments and trailing commas",
			input: `{
                "key1": "value1", // Comment 1
                "key2": {
                    "nested1": "value2", // Nested comment
                    "nested2": "value3", // Another comment
                }, // Object comment
                "array": [
                    "item1", // Array item comment
                    "item2", // Last item comment
                ], // Array comment
            }`,
			expected: `{
                "key1": "value1", 
                "key2": {
                    "nested1": "value2", 
                    "nested2": "value3" 
                }, 
                "array": [
                    "item1", 
                    "item2" 
                ] 
            }`,
		},
		{
			name: "JSON with multiple issues",
			input: `{
                "code": "0",
                "msg": "", // Success message
                "data": [
                    {
                        "instId": "BTC-USDT", // Bitcoin
                        "last": "50000.5",
                        "askPx": "50100.1", // Ask price
                        "bidPx": "49900.9", // Bid price
                    },
                    {
                        "instId": "ETH-USDT", // Ethereum
                        "last": "3200.75",
                        "askPx": "3210.3", // Ask price
                        "bidPx": "3190.8", // Bid price
                    },
                ],
            }`,
			expected: `{
                "code": "0",
                "msg": "", 
                "data": [
                    {
                        "instId": "BTC-USDT", 
                        "last": "50000.5",
                        "askPx": "50100.1", 
                        "bidPx": "49900.9" 
                    },
                    {
                        "instId": "ETH-USDT", 
                        "last": "3200.75",
                        "askPx": "3210.3", 
                        "bidPx": "3190.8" 
                    }
                ]
            }`,
		},
		{
			name: "Comment with no space after comma",
			input: `{"key": "value",// inline comment
                "key2": "value2"}`,
			expected: `{"key": "value",
                "key2": "value2"}`,
		},
		{
			name: "Comment at start of line",
			input: `{
                // Comment at start of line
                "key": "value",
                "key2": "value2"
            }`,
			expected: `{
                
                "key": "value",
                "key2": "value2"
            }`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := fixInvalidJSON(tt.input)
			assert.Equal(t, tt.expected, result)
			assert.True(t, json.Valid([]byte(result)), "Resulting JSON should be valid")
		})
	}
}
