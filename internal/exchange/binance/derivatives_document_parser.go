package binance

import (
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/openxapi/openxapi/internal/config"
	"github.com/openxapi/openxapi/internal/parser"
	"github.com/sirupsen/logrus"
)

type DerivativesDocumentParser struct {
	*SpotDocumentParser
}

// Parse parses an HTML document and extracts API endpoints
func (p *DerivativesDocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedEndpoints []string) ([]parser.Endpoint, error) {
	p.docType = urlEntity.DocType
	// Parse HTML document
	document, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML: %w", err)
	}
	category := toCategory(urlEntity)
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
		// ignore weight information with only a number
		if text != "" {
			if _, err := strconv.Atoi(text); err == nil {
				return
			}
			*content = append(*content, text)
		}
	}

	var foundResponse bool
	// Extract response examples from code blocks
	if s.HasClass("language-javascript") || s.HasClass("language-json") {
		var lines []string
		code := s.Find("code")
		// for each child of code, get the text
		code.Children().Each(func(i int, child *goquery.Selection) {
			text := cleanResponseLine(child.Text())
			if text != "" {
				lines = append(lines, text)
			}
		})
		responseText := strings.Join(lines, " ")
		if responseText != "" {
			*content = append(*content, "Response: "+responseText)
		}
		foundResponse = true
	}
	if s.Is("h2") && strings.Contains(s.Text(), "API Description") {
		// get the next p element
		nextP := s.Next()
		if nextP.Length() > 0 {
			*content = append(*content, "API Description: "+nextP.Text())
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
	if s.Is("h2") && strings.Contains(s.Text(), "Request Weight") {
		// Extract the weight from the next line
		weight := s.Next().Text()
		weight = strings.TrimSpace(weight)
		if weight != "" {
			*content = append(*content, "Weight: "+weight)
		}
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

	if !foundResponse {
		if s.Is("#response-example") {
			// find response from the next sibling
			respElement := s.Next()
			var lines []string
			code := respElement.Find("code")
			// for each child of code, get the text
			code.Children().Each(func(i int, child *goquery.Selection) {
				text := cleanResponseLine(child.Text())
				if text != "" {
					lines = append(lines, text)
				}
			})
			responseText := strings.Join(lines, " ")
			if responseText != "" {
				*content = append(*content, "Response: "+responseText)
			}
			foundResponse = true
		}
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

// extractEndpoint processes the content following an API header to extract endpoint information
func (p *DerivativesDocumentParser) extractEndpoint(content []string, category string) (*parser.Endpoint, bool) {
	for i, line := range content {
		logrus.Debugf("line %d: %s", i, line)
	}
	var endpoint = &parser.Endpoint{}
	endpoint.Tags = []string{category}
	endpoint.Extensions = make(map[string]interface{})
	endpoint.Responses = make(map[string]*parser.Response)

	foundEndpoint, foundResponse, responseContent := p.extractContent(endpoint, content)
	if !foundEndpoint {
		return nil, false
	}
	if err := p.extractParameters(endpoint); err != nil {
		logrus.Debugf("extractParameters error: %s", err)
	}
	if err := p.extractResponse(endpoint, foundResponse, responseContent); err != nil {
		logrus.Debugf("extractResponse error: %s", err)
	}

	return endpoint, foundEndpoint
}

func (p *DerivativesDocumentParser) extractContent(endpoint *parser.Endpoint, content []string) (bool, bool, string) {
	// Set the summary from the first content item if available
	if len(content) > 0 {
		endpoint.Summary = content[0]
	}

	// Initialize variables to track what we've found
	var description strings.Builder
	var foundEndpoint, foundWeight, foundParameters, foundDataSource, foundResponse, foundDescription bool
	var responseContent strings.Builder
	p.tableContent = ""

	// Regular expressions to identify different sections
	// endpoont example:
	// GET /sapi/v1/broker/subAccount
	// POST\u00a0/sapi/v1/broker/subAccount/futures
	endpointRegex := regexp.MustCompile(`^(GET|Get|POST|Post|PUT|Put|DELETE|Delete|PATCH|Patch)[\s\x{00A0}]*(/.+)$`)
	weightRegex := regexp.MustCompile(`^Weight:?\s*(\d+|[a-zA-Z].*)?$`)
	parametersRegex := regexp.MustCompile(`^Request Parameters\s*$`)
	dataSourceRegex := regexp.MustCompile(`^Data Source:?\s*(.+)$`)
	responseRegex := regexp.MustCompile(`^Response:\s*(.*)$`)
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
			logrus.Debugf("line: %s", line)
			matches := endpointRegex.FindStringSubmatch(line)
			logrus.Debugf("len matches: %d", len(matches))
			if len(matches) == 3 {
				endpoint.Method = matches[1]
				endpointPath := strings.TrimSpace(matches[2])
				endpointPath = strings.Split(endpointPath, " ")[0]
				if !strings.HasPrefix(endpointPath, "/") {
					endpointPath = "/" + endpointPath
				}
				endpoint.Path = endpointPath
				foundEndpoint = true
				endpoint.OperationID = operationID(endpoint.Method, endpoint.Path)

				// Extract the API version from the path
				apiVersionMatches := apiVersionRegex.FindStringSubmatch(endpoint.Path)
				if len(apiVersionMatches) == 2 {
					apiVersion := apiVersionMatches[1]
					logrus.Debugf("apiVersion: %s", apiVersion)
					// TODO: due to a bug in openapi-generator typescript-axios, we need to make sure there is only one tag for each endpoint
					// endpoint.Tags = append(endpoint.Tags, strings.ToUpper(apiVersion))
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

		if !foundDescription && strings.HasPrefix(line, "API Description: ") {
			endpoint.Description = strings.TrimSpace(strings.TrimPrefix(line, "API Description: "))
			foundDescription = true
			continue
		}

		if !foundDescription {
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
	}
	if endpoint.OperationID == "" {
		return false, false, ""
	}
	if endpoint.Description == "" {
		endpoint.Description = strings.TrimSpace(description.String())
	}
	return foundEndpoint, foundResponse, responseContent.String()
}
