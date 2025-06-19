package okx

import (
	"fmt"
	"io"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/openxapi/openxapi/internal/config"
	"github.com/openxapi/openxapi/internal/parser/websocket"
	"github.com/sirupsen/logrus"
)

// DocumentParser implements the HTTPDocumentParser interface for OKX WebSocket API
type DocumentParser struct{}

// Parse parses the OKX WebSocket API documentation and extracts channel information
func (p *DocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedMethods []string) ([]parser.Channel, error) {
	doc, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parsing HTML document: %w", err)
	}

	var channels []parser.Channel

	// Look for WebSocket channel documentation patterns
	// This is a basic implementation that would need to be customized for OKX's specific documentation format
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

	// Look for channel names in code blocks or tables
	doc.Find("code, pre").Each(func(i int, s *goquery.Selection) {
		text := strings.TrimSpace(s.Text())
		if p.containsChannelDefinition(text) {
			channel := p.parseChannelFromCode(text, urlEntity, protectedMethods)
			if channel != nil {
				channels = append(channels, *channel)
			}
		}
	})

	logrus.Infof("Extracted %d WebSocket channels from OKX documentation", len(channels))
	return channels, nil
}

// isWebSocketChannel checks if the text indicates a WebSocket channel
func (p *DocumentParser) isWebSocketChannel(text string) bool {
	text = strings.ToLower(text)
	keywords := []string{
		"channel",
		"websocket",
		"ws",
		"subscription",
		"stream",
		"ticker",
		"orderbook",
		"books",
		"trades",
		"candle",
		"account",
		"balance",
		"order",
		"position",
		"algo",
	}

	for _, keyword := range keywords {
		if strings.Contains(text, keyword) {
			return true
		}
	}
	return false
}

// containsChannelDefinition checks if the code block contains channel definitions
func (p *DocumentParser) containsChannelDefinition(text string) bool {
	text = strings.ToLower(text)
	return strings.Contains(text, "channel") && (strings.Contains(text, "{") ||
		strings.Contains(text, "op") ||
		strings.Contains(text, "args"))
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

	// Add basic send/receive messages for OKX format
	channel.Messages["send"] = &parser.Message{
		Title:       "Subscribe",
		Description: fmt.Sprintf("Subscribe to %s", channel.Name),
		Payload: &parser.Schema{
			Type: "object",
			Properties: map[string]*parser.Schema{
				"op": {
					Type:        "string",
					Description: "The operation type",
					Example:     "subscribe",
				},
				"args": {
					Type:        "array",
					Description: "The channel arguments",
					Items: &parser.Schema{
						Type: "object",
						Properties: map[string]*parser.Schema{
							"channel": {
								Type:        "string",
								Description: "Channel name",
							},
							"instId": {
								Type:        "string",
								Description: "Instrument ID",
							},
						},
					},
				},
			},
		},
	}

	channel.Messages["receive"] = &parser.Message{
		Title:       "Channel Data",
		Description: fmt.Sprintf("Receive data from %s", channel.Name),
		Payload: &parser.Schema{
			Type: "object",
			Properties: map[string]*parser.Schema{
				"arg": {
					Type:        "object",
					Description: "Channel argument",
				},
				"data": {
					Type:        "array",
					Description: "Channel data",
				},
			},
		},
	}

	return channel
}

// parseChannelFromCode parses channel information from code blocks
func (p *DocumentParser) parseChannelFromCode(code string, urlEntity *config.URLEntity, protectedMethods []string) *parser.Channel {
	lines := strings.Split(code, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.Contains(line, "channel") {
			channelName := p.extractChannelNameFromLine(line)
			if channelName != "" {
				return &parser.Channel{
					Name:        channelName,
					Description: fmt.Sprintf("WebSocket channel: %s", channelName),
					Summary:     channelName,
					Messages:    make(map[string]*parser.Message),
					Tags:        []string{urlEntity.DocType},
					Protected:   p.isProtectedChannel(channelName, protectedMethods),
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

// extractChannelNameFromLine extracts channel name from a line of code
func (p *DocumentParser) extractChannelNameFromLine(line string) string {
	// Look for patterns like "channel": "tickers" or channel: books
	if strings.Contains(line, "channel") {
		parts := strings.Split(line, ":")
		if len(parts) >= 2 {
			channelName := strings.TrimSpace(parts[1])
			channelName = strings.Trim(channelName, `"'`)
			channelName = strings.TrimSuffix(channelName, ",")
			return channelName
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
		Location:    "body", // OKX uses JSON body for parameters
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

	// Common patterns for protected channels in OKX
	protectedPatterns := []string{
		"account",
		"balance",
		"order",
		"position",
		"algo",
		"grid",
		"deposit",
		"withdrawal",
	}

	for _, pattern := range protectedPatterns {
		if strings.Contains(channelName, pattern) {
			return true
		}
	}

	return false
}
