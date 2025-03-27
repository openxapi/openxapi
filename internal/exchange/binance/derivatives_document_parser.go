package binance

import (
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/adshao/openxapi/internal/parser"
)

type DerivativesDocumentParser struct {
	*SpotDocumentParser
	tableContent      string
	collectedElements map[string]*goquery.Selection
}

// Parse parses an HTML document and extracts API endpoints
func (p *DerivativesDocumentParser) Parse(r io.Reader, url string, docType string, protectedEndpoints []string) ([]parser.Endpoint, error) {
	p.docType = docType
	// Parse HTML document
	document, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML: %w", err)
	}

	// Extract the URL to determine the API category
	category := p.extractCategory(url)

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

// collectElementContent extracts content from an HTML element and adds it to the content slice
func (p *DerivativesDocumentParser) collectElementContent(s *goquery.Selection, content *[]string) {
	// logrus.Debugf("collectElementContent: %s", s.Text())
	// Extract endpoint URL from code blocks
	if s.Is(".theme-code-block") {
		codeText := s.Find(".prism-code").Text()
		codeText = strings.TrimSpace(codeText)

		// Check if it's an API endpoint definition (GET, POST, etc.)
		if strings.HasPrefix(codeText, "GET ") ||
			strings.HasPrefix(codeText, "POST ") ||
			strings.HasPrefix(codeText, "PUT ") ||
			strings.HasPrefix(codeText, "DELETE ") ||
			strings.HasPrefix(codeText, "PATCH ") {
			*content = append(*content, codeText)
		}
	}

	// Extract text from paragraphs
	if s.Is("p") {
		text := cleanText(s.Text())
		if text != "" {
			*content = append(*content, text)
		}
	}

	// Extract response examples from code blocks
	if s.HasClass("language-javascript") || s.HasClass("language-json") {
		responseText := s.Find("code").Text()
		if responseText != "" {
			*content = append(*content, "Response: "+responseText)
		}
	}

	// Look for parameter tables after "Parameters:" paragraph
	// Only look at tables that are direct siblings of the paragraph
	if s.Is("h2") && strings.Contains(s.Text(), "Parameters") {
		// Find the next table that is a direct sibling
		var foundTable bool
		s.NextUntil("h2").Each(func(i int, el *goquery.Selection) {
			if !foundTable && el.Is("table") {
				tableHtml, _ := el.Html()
				if tableHtml != "" {
					*content = append(*content, "TABLE:"+tableHtml)
					foundTable = true
				}
			}
		})
	}

	// Extract content from divs that might contain important information
	// But only process direct children to avoid processing content from other sections
	if s.Is("div.theme-doc-markdown") {
		s.Children().Each(func(i int, child *goquery.Selection) {
			p.collectElementContent(child, content)
		})
	}

	// Extract content from list items
	if s.Is("li") {
		text := cleanText(s.Text())
		if text != "" {
			*content = append(*content, "- "+text)
		}
	}

	// Extract content from unordered lists
	if s.Is("ul") {
		s.Children().Each(func(i int, li *goquery.Selection) {
			text := cleanText(li.Text())
			if text != "" {
				*content = append(*content, "- "+text)
			}
		})
	}
}

func (p *DerivativesDocumentParser) extractCategory(url string) string {
	// parse category from url
	// https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Order-Book
	// we want to extract "market-data" from the url
	parts := strings.Split(url, "/")
	if len(parts) >= 7 {
		return strings.Title(strings.ReplaceAll(parts[6], "-", " "))
	}
	return ""
}

func (p *DerivativesDocumentParser) extractContent(endpoint *parser.Endpoint, content []string) (bool, bool, string) {
	// Set the summary from the first content item if available
	if len(content) > 0 {
		endpoint.Summary = content[0]
	}

	// Initialize variables to track what we've found
	var description strings.Builder
	var foundEndpoint, foundWeight, foundParameters, foundDataSource, foundResponse bool
	var responseContent strings.Builder
	p.tableContent = ""

	// Regular expressions to identify different sections
	endpointRegex := regexp.MustCompile(`^(GET|POST|PUT|DELETE|PATCH) (.+)$`)
	weightRegex := regexp.MustCompile(`^Request Weight\s*(\d+|[a-zA-Z].*)?$`)
	parametersRegex := regexp.MustCompile(`^Request Parameters\s*(.*)$`)
	dataSourceRegex := regexp.MustCompile(`^Data Source:?\s*(.+)$`)
	responseRegex := regexp.MustCompile(`^Response Example\s*(.*)$`)
	apiVersionRegex := regexp.MustCompile(`/(v\d+)/`)

	// Process each line of content
	for i, line := range content {
		// Skip the first line as it's the summary
		if i == 0 {
			continue
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Check for endpoint definition (e.g., "GET /api/v3/ping")
		if !foundEndpoint {
			matches := endpointRegex.FindStringSubmatch(line)
			if len(matches) == 3 {
				endpoint.Method = matches[1]
				endpoint.Path = matches[2]
				foundEndpoint = true
				endpoint.OperationID = operationID(p.docType, endpoint.Method, endpoint.Path)

				// Extract the API version from the path
				apiVersionMatches := apiVersionRegex.FindStringSubmatch(endpoint.Path)
				if len(apiVersionMatches) == 2 {
					apiVersion := apiVersionMatches[1]
					endpoint.Tags = append(endpoint.Tags, strings.ToUpper(apiVersion))
				}
				continue
			}
		}

		// Check for weight information
		if !foundWeight {
			matches := weightRegex.FindStringSubmatch(line)
			if len(matches) == 2 {
				// if weight is a number, set it
				if _, err := strconv.Atoi(matches[1]); err == nil {
					endpoint.Extensions["x-weight"] = matches[1]
					foundWeight = true
				}
				continue
			}
		}

		// Check for parameters section
		if !foundParameters && parametersRegex.MatchString(line) {
			foundParameters = true
			continue
		}

		// Check for data source
		if !foundDataSource {
			matches := dataSourceRegex.FindStringSubmatch(line)
			if len(matches) == 2 {
				endpoint.Extensions["x-data-source"] = matches[1]
				foundDataSource = true
				continue
			}
		}

		// Check for response section with content on the same line
		if !foundResponse && line != "Response:" {
			matches := responseRegex.FindStringSubmatch(line)
			if len(matches) > 0 {
				foundResponse = true
				if len(matches) > 1 && matches[1] != "" {
					responseContent.WriteString(matches[1])
					responseContent.WriteString("\n")
				}
				continue
			}
		}

		// Collect table content for parameter extraction
		if strings.HasPrefix(line, "TABLE:") {
			p.tableContent = strings.TrimPrefix(line, "TABLE:")
			continue
		}

		// If we haven't found the endpoint yet, this is part of the description
		if !foundEndpoint {
			description.WriteString(line)
			description.WriteString("\n")
		} else if !foundParameters && !foundWeight && !foundDataSource && !foundResponse {
			// If we've found the endpoint but not other sections, this is still part of the description
			description.WriteString(line)
			description.WriteString("\n")
		}
	}
	if endpoint.OperationID == "" {
		return false, false, ""
	}
	// Set the description
	endpoint.Description = strings.TrimSpace(description.String())
	return foundEndpoint, foundResponse, responseContent.String()
}
