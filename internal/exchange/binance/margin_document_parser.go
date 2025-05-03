package binance

import (
	"fmt"
	"io"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/openxapi/openxapi/internal/config"
	"github.com/openxapi/openxapi/internal/parser"
)

type MarginDocumentParser struct {
	*DerivativesDocumentParser
}

// Parse parses an HTML document and extracts API endpoints
func (p *MarginDocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedEndpoints []string) ([]parser.Endpoint, error) {
	p.docType = urlEntity.DocType
	// Parse HTML document
	document, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML: %w", err)
	}

	// Extract the URL to determine the API category
	category := p.extractCategory(urlEntity.URL)

	var endpoints []parser.Endpoint

	parseEndpoint := func(headerElement string) func(i int, header *goquery.Selection) {
		return func(i int, header *goquery.Selection) {
			// Get the header text and clean it
			headerText := cleanText(header.Text())
			// Skip headers that are not endpoints (like "Terminology")
			if isNonEndpointHeader(headerText) {
				return
			}

			// Collect all content elements after the header until we find the next h3
			var content []string
			// Add the header text as the first item in content
			content = append(content, headerText)

			// Find all elements between this h3 and the next h3
			var nextElements []*goquery.Selection
			// Get the next h3 element
			nextH3 := header.NextAll().Filter(headerElement).First()
			if nextH3.Length() > 0 {
				// If there's a next h3, get all elements between current h3 and next h3
				header.NextUntil(headerElement).Each(func(j int, el *goquery.Selection) {
					nextElements = append(nextElements, el)
				})
			} else {
				// If there's no next h3, get all elements after current h3
				header.NextAll().Each(func(j int, el *goquery.Selection) {
					nextElements = append(nextElements, el)
				})
			}
			// Process each element to extract content
			for _, el := range nextElements {
				p.collectElementContent(el, &content)
			}

			// Process the collected content to extract endpoint information
			endpointData, valid := p.extractEndpoint(content, category)

			// Only add valid endpoints
			if valid && endpointData.Path != "" && endpointData.Method != "" {
				p.processEndpoint(endpointData, protectedEndpoints)
				endpoints = append(endpoints, *endpointData)
			}
		}
	}

	// Find all API endpoint sections
	// In the Binance docs, each endpoint is under an h3 with class "anchor"
	document.Find("h1").Each(parseEndpoint("h1"))

	return endpoints, nil
}

func (p *MarginDocumentParser) extractCategory(url string) string {
	// parse category from url
	// https://developers.binance.com/docs/margin_trading/trade/Create-Special-Key-of-Low-Latency-Trading
	// we want to extract "trade" from the url
	parts := strings.Split(url, "/")
	if len(parts) >= 6 {
		return strings.Title(strings.ReplaceAll(parts[5], "-", " "))
	}
	return ""
}
