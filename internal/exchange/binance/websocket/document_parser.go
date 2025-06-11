package binance

import (
	"fmt"
	"io"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/openxapi/openxapi/internal/config"
	"github.com/openxapi/openxapi/internal/parser/websocket"
	"github.com/sirupsen/logrus"
)

// DocumentParser implements the HTTPDocumentParser interface for Binance WebSocket API
type DocumentParser struct{}

// Parse parses the Binance WebSocket API documentation and extracts channel information
func (p *DocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedMethods []string) ([]parser.Channel, error) {
	doc, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML document: %w", err)
	}

	var channels []parser.Channel

	// Look for WebSocket channel documentation patterns
	// This is a basic implementation that would need to be customized for Binance's specific documentation format
	doc.Find("h2, h3, h4").Each(func(i int, s *goquery.Selection) {
		text := strings.TrimSpace(s.Text())

		// Look for patterns that indicate WebSocket streams/channels
		if p.isWebSocketChannel(text) {
			channel := p.parseChannelFromSection(s, urlEntity, protectedMethods)
			if channel != nil {
				channels = append(channels, *channel)
			}
		}
	})

	// Look for stream names in code blocks or tables
	doc.Find("code, pre").Each(func(i int, s *goquery.Selection) {
		text := strings.TrimSpace(s.Text())
		if p.containsStreamDefinition(text) {
			channel := p.parseChannelFromCode(text, urlEntity, protectedMethods)
			if channel != nil {
				channels = append(channels, *channel)
			}
		}
	})

	logrus.Infof("Extracted %d WebSocket channels from Binance documentation", len(channels))
	return channels, nil
}

// isWebSocketChannel checks if the text indicates a WebSocket channel/stream
func (p *DocumentParser) isWebSocketChannel(text string) bool {
	text = strings.ToLower(text)
	keywords := []string{
		"stream",
		"websocket",
		"ws",
		"subscription",
		"channel",
		"ticker",
		"depth",
		"kline",
		"trade",
		"bookTicker",
		"miniTicker",
		"userData",
	}

	for _, keyword := range keywords {
		if strings.Contains(text, keyword) {
			return true
		}
	}
	return false
}

// containsStreamDefinition checks if the code block contains stream definitions
func (p *DocumentParser) containsStreamDefinition(text string) bool {
	text = strings.ToLower(text)
	return strings.Contains(text, "@") && (strings.Contains(text, "stream") ||
		strings.Contains(text, "ticker") ||
		strings.Contains(text, "depth") ||
		strings.Contains(text, "kline") ||
		strings.Contains(text, "trade"))
}

// parseChannelFromSection parses channel information from a documentation section
func (p *DocumentParser) parseChannelFromSection(section *goquery.Selection, urlEntity *config.URLEntity, protectedMethods []string) *parser.Channel {
	name := strings.TrimSpace(section.Text())

	// Extract description from following paragraphs
	description := ""
	section.NextAllFiltered("p").First().Each(func(i int, s *goquery.Selection) {
		description = strings.TrimSpace(s.Text())
	})

	// Extract parameters from following tables or lists
	var parameters []*parser.Parameter
	section.NextAllFiltered("table").First().Find("tr").Each(func(i int, s *goquery.Selection) {
		if i == 0 { // Skip header row
			return
		}
		param := p.parseParameterFromTableRow(s)
		if param != nil {
			parameters = append(parameters, param)
		}
	})

	channel := &parser.Channel{
		Name:        p.extractChannelName(name),
		Description: description,
		Summary:     name,
		Parameters:  parameters,
		Messages:    make(map[string]*parser.Message),
		Tags:        []string{urlEntity.DocType},
		Protected:   p.isProtectedChannel(name, protectedMethods),
	}

	// Add basic send/receive messages
	channel.Messages["send"] = &parser.Message{
		Title:       "Subscribe",
		Description: fmt.Sprintf("Subscribe to %s", channel.Name),
		Payload: &parser.Schema{
			Type: "object",
			Properties: map[string]*parser.Schema{
				"method": {
					Type:        "string",
					Description: "The method for the request",
					Example:     "SUBSCRIBE",
				},
				"params": {
					Type:        "array",
					Description: "The stream names to subscribe to",
					Items: &parser.Schema{
						Type: "string",
					},
				},
				"id": {
					Type:        "integer",
					Description: "Request ID",
				},
			},
		},
	}

	channel.Messages["receive"] = &parser.Message{
		Title:       "Stream Data",
		Description: fmt.Sprintf("Receive data from %s", channel.Name),
		Payload: &parser.Schema{
			Type:        "object",
			Description: "Stream data payload",
		},
	}

	return channel
}

// parseChannelFromCode parses channel information from code blocks
func (p *DocumentParser) parseChannelFromCode(code string, urlEntity *config.URLEntity, protectedMethods []string) *parser.Channel {
	lines := strings.Split(code, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.Contains(line, "@") {
			streamName := p.extractStreamNameFromLine(line)
			if streamName != "" {
				return &parser.Channel{
					Name:        streamName,
					Description: fmt.Sprintf("WebSocket stream: %s", streamName),
					Summary:     streamName,
					Messages:    make(map[string]*parser.Message),
					Tags:        []string{urlEntity.DocType},
					Protected:   p.isProtectedChannel(streamName, protectedMethods),
				}
			}
		}
	}
	return nil
}

// extractChannelName extracts a clean channel name from the section title
func (p *DocumentParser) extractChannelName(title string) string {
	title = strings.ToLower(title)
	title = strings.ReplaceAll(title, " ", "_")
	title = strings.ReplaceAll(title, "-", "_")
	return title
}

// extractStreamNameFromLine extracts stream name from a line of code
func (p *DocumentParser) extractStreamNameFromLine(line string) string {
	// Look for patterns like "btcusdt@ticker" or "btcusdt@depth"
	if strings.Contains(line, "@") {
		parts := strings.Split(line, "@")
		if len(parts) >= 2 {
			return strings.TrimSpace(parts[1])
		}
	}
	return ""
}

// parseParameterFromTableRow parses parameter information from a table row
func (p *DocumentParser) parseParameterFromTableRow(row *goquery.Selection) *parser.Parameter {
	cells := row.Find("td")
	if cells.Length() < 2 {
		return nil
	}

	name := strings.TrimSpace(cells.Eq(0).Text())
	description := strings.TrimSpace(cells.Eq(1).Text())

	if name == "" {
		return nil
	}

	param := &parser.Parameter{
		Name:        name,
		Description: description,
		Location:    "query", // Default location for WebSocket parameters
		Schema: &parser.Schema{
			Type: "string", // Default type
		},
	}

	// Check if parameter is required
	if strings.Contains(strings.ToLower(description), "required") {
		param.Required = true
	}

	return param
}

// isProtectedChannel checks if a channel requires authentication
func (p *DocumentParser) isProtectedChannel(channelName string, protectedMethods []string) bool {
	channelName = strings.ToLower(channelName)
	for _, protected := range protectedMethods {
		if strings.Contains(channelName, strings.ToLower(protected)) {
			return true
		}
	}

	// Common patterns for protected channels
	protectedPatterns := []string{
		"user",
		"account",
		"order",
		"balance",
		"execution",
		"outbound",
	}

	for _, pattern := range protectedPatterns {
		if strings.Contains(channelName, pattern) {
			return true
		}
	}

	return false
}
