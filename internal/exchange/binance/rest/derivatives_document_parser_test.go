package binance

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestExtractCategory(t *testing.T) {
	parser := &DerivativesDocumentParser{}
	category := parser.extractCategory("https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Order-Book")
	assert.Equal(t, "Market Data", category)
}
