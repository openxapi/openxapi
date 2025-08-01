/*
 * Dedicated WebSocket handlers for options-streams
 * Focuses on options market data streaming patterns
 */

export function OptionsStreamsWebSocketHandlers({ asyncapi }) {
  const operations = new Map();
  const channels = new Map();
  
  // Extract operations and channels with proper error handling
  try {
    asyncapi.operations().forEach((operation) => {
      const operationId = operation.id();
      const action = operation.action();
      
      // Safely get channel reference
      let channel = null;
      try {
        if (typeof operation.channel === 'function') {
          channel = operation.channel();
        } else if (operation.channel) {
          channel = operation.channel;
        }
      } catch (e) {
        console.warn(`Could not get channel for operation ${operationId}:`, e.message);
      }
      
      operations.set(operationId, {
        operation,
        action,
        channel
      });
    });
  } catch (e) {
    console.warn('Error extracting operations:', e.message);
  }

  try {
    asyncapi.channels().forEach((channel) => {
      const channelId = channel.address();
      channels.set(channelId, {
        channel,
        messages: channel.messages()
      });
    });
  } catch (e) {
    console.warn('Error extracting channels:', e.message);
  }

  let clientCode = generateOptionsStreamsClientCode(operations, channels, asyncapi);
  
  return clientCode;
}

function generateOptionsStreamsClientCode(operations, channels, asyncapi) {
  let code = '';

  // Generate streaming-focused methods that use models
  code += generateSubscriptionMethods();
  
  // Generate stream event handlers for options-specific events
  code += generateOptionsStreamEventHandlers(operations, channels);
  
  // Generate combined stream handlers for options data
  code += generateOptionsCombinedStreamHandlers();
  
  return code;
}

function generateSubscriptionMethods() {
  return `
// Subscribe to options market data streams
func (c *Client) Subscribe(ctx context.Context, streams []string) error {
	if !c.isConnected {
		return fmt.Errorf("websocket not connected")
	}

	request := map[string]interface{}{
		"method": "SUBSCRIBE",
		"params": streams,
		"id":     GenerateRequestID(),
	}

	return c.sendRequest(request)
}

// Unsubscribe from options market data streams  
func (c *Client) Unsubscribe(ctx context.Context, streams []string) error {
	if !c.isConnected {
		return fmt.Errorf("websocket not connected")
	}

	request := map[string]interface{}{
		"method": "UNSUBSCRIBE", 
		"params": streams,
		"id":     GenerateRequestID(),
	}

	return c.sendRequest(request)
}

// List active subscriptions
func (c *Client) ListSubscriptions(ctx context.Context) error {
	if !c.isConnected {
		return fmt.Errorf("websocket not connected")
	}

	request := map[string]interface{}{
		"method": "LIST_SUBSCRIPTIONS",
		"id":     GenerateRequestID(),
	}

	return c.sendRequest(request)
}

// ConnectToSingleStreams connects to single stream endpoint with optional timeUnit parameter
func (c *Client) ConnectToSingleStreams(ctx context.Context, timeUnit string) error {
	if c.isConnected {
		return fmt.Errorf("already connected to websocket")
	}
	
	// Build stream path with timeUnit parameter (no leading slash - server URL already contains path)
	streamPath := "ws"
	if timeUnit != "" {
		streamPath += timeUnit // timeUnit should be formatted like "?timeUnit=MICROSECOND"
	}
	
	// Use ConnectWithVariables to resolve {streamPath} template variable correctly
	return c.ConnectWithVariables(ctx, streamPath)
}

// ConnectToCombinedStreams connects to combined stream endpoint with optional timeUnit parameter
func (c *Client) ConnectToCombinedStreams(ctx context.Context, timeUnit string) error {
	if c.isConnected {
		return fmt.Errorf("already connected to websocket")
	}
	
	// Build stream path with timeUnit parameter (no leading slash - server URL already contains path)
	streamPath := "stream"
	if timeUnit != "" {
		streamPath += timeUnit // timeUnit should be formatted like "?timeUnit=MICROSECOND"
	}
	
	// Use ConnectWithVariables to resolve {streamPath} template variable correctly
	return c.ConnectWithVariables(ctx, streamPath)
}

// ConnectToSingleStreamsMicrosecond connects to single stream endpoint with microsecond precision
func (c *Client) ConnectToSingleStreamsMicrosecond(ctx context.Context) error {
	return c.ConnectToSingleStreams(ctx, "?timeUnit=MICROSECOND")
}

// ConnectToCombinedStreamsMicrosecond connects to combined stream endpoint with microsecond precision
func (c *Client) ConnectToCombinedStreamsMicrosecond(ctx context.Context) error {
	return c.ConnectToCombinedStreams(ctx, "?timeUnit=MICROSECOND")
}

// ConnectToStream connects directly to a specific stream (single stream connection)
func (c *Client) ConnectToStream(ctx context.Context, streamName string) error {
	if c.isConnected {
		return fmt.Errorf("already connected to websocket")
	}
	
	// Build full stream path with stream name (no leading slash - server URL already contains path)
	streamPath := "ws/" + streamName
	
	// Use ConnectWithVariables to resolve {streamPath} template variable correctly
	return c.ConnectWithVariables(ctx, streamPath)
}

// ConnectToStreamWithTimeUnit connects directly to a specific stream with time unit parameter
func (c *Client) ConnectToStreamWithTimeUnit(ctx context.Context, streamName string, timeUnit string) error {
	if c.isConnected {
		return fmt.Errorf("already connected to websocket")
	}
	
	// Build full stream path with stream name and time unit (no leading slash - server URL already contains path)
	streamPath := "ws/" + streamName
	if timeUnit != "" {
		streamPath += timeUnit // timeUnit should be formatted like "?timeUnit=MICROSECOND"
	}
	
	// Use ConnectWithVariables to resolve {streamPath} template variable correctly
	return c.ConnectWithVariables(ctx, streamPath)
}

// ConnectWithAutoCorrection establishes a WebSocket connection with automatic stream path correction
// This method ensures proper URL construction for options streams
func (c *Client) ConnectWithAutoCorrection(ctx context.Context, streamPath string) error {
	if c.isConnected {
		return fmt.Errorf("already connected to websocket")
	}
	
	// Validate and correct streamPath format for options streams
	correctedStreamPath := c.validateAndCorrectStreamPath(streamPath)
	
	// Use ConnectWithVariables to resolve {streamPath} template variable correctly
	return c.ConnectWithVariables(ctx, correctedStreamPath)
}

// validateAndCorrectStreamPath ensures proper streamPath format for options streams
// Note: Server URL template is "wss://nbstream.binance.com/eoptions/{streamPath}"
// So streamPath should NOT have leading slash to avoid double slashes
func (c *Client) validateAndCorrectStreamPath(streamPath string) string {
	// Remove leading slash since server URL template already contains the base path
	if strings.HasPrefix(streamPath, "/") {
		streamPath = streamPath[1:]
	}
	
	// If streamPath is empty after removing slash, default to "ws"
	if streamPath == "" {
		return "ws"
	}
	
	// If it looks like a raw stream name (contains @ or is option_pair), prepend "ws/"
	if strings.Contains(streamPath, "@") || streamPath == "option_pair" {
		return "ws/" + streamPath
	}
	
	// If it starts with "ws/" or "stream", it's already correct
	if strings.HasPrefix(streamPath, "ws/") || strings.HasPrefix(streamPath, "stream") {
		return streamPath
	}
	
	// If it's just "ws" or "stream", it's correct for base endpoints
	if streamPath == "ws" || streamPath == "stream" {
		return streamPath
	}
	
	// Default: return as-is
	return streamPath
}


`;
}

function generateOptionsStreamEventHandlers(operations, channels) {
  let code = `
// Options stream event handler functions
type (
	// New Symbol Info Handler
	NewSymbolInfoHandler func(*models.NewSymbolInfoEvent) error
	
	// Open Interest Handler
	OpenInterestHandler func(*models.OpenInterestEvent) error
	
	// Mark Price Handler
	MarkPriceHandler func(*models.MarkPriceEvent) error
	
	// Kline Handler  
	KlineHandler func(*models.KlineEvent) error
	
	// Ticker Handler
	TickerHandler func(*models.TickerEvent) error
	
	// Ticker by Underlying Handler
	TickerByUnderlyingHandler func(*models.TickerByUnderlyingEvent) error
	
	// Index Price Handler
	IndexPriceHandler func(*models.IndexPriceEvent) error
	
	// Trade Handler
	TradeHandler func(*models.TradeEvent) error
	
	// Partial Depth Handler
	PartialDepthHandler func(*models.PartialDepthEvent) error
	
	// Combined Stream Handler
	CombinedStreamHandler func(*models.CombinedStreamEvent) error
	
	// Subscription Response Handler
	SubscriptionResponseHandler func(*models.SubscriptionResponse) error
	
	// Error Handler
	StreamErrorHandler func(*models.ErrorResponse) error
)

// Event handler registry for options streams
type eventHandlers struct {
	newSymbolInfo        NewSymbolInfoHandler
	openInterest         OpenInterestHandler
	markPrice           MarkPriceHandler
	kline               KlineHandler
	ticker              TickerHandler
	tickerByUnderlying  TickerByUnderlyingHandler
	indexPrice          IndexPriceHandler
	trade               TradeHandler
	partialDepth        PartialDepthHandler
	combinedStream      CombinedStreamHandler
	subscriptionResponse SubscriptionResponseHandler
	error               StreamErrorHandler
}

// Register event handlers for options streams
func (c *Client) HandleNewSymbolInfoEvent(handler NewSymbolInfoHandler) {
	c.handlers.newSymbolInfo = handler
}

func (c *Client) HandleOpenInterestEvent(handler OpenInterestHandler) {
	c.handlers.openInterest = handler
}

func (c *Client) HandleMarkPriceEvent(handler MarkPriceHandler) {
	c.handlers.markPrice = handler
}

func (c *Client) HandleKlineEvent(handler KlineHandler) {
	c.handlers.kline = handler
}

func (c *Client) HandleTickerEvent(handler TickerHandler) {
	c.handlers.ticker = handler
}

func (c *Client) HandleTickerByUnderlyingEvent(handler TickerByUnderlyingHandler) {
	c.handlers.tickerByUnderlying = handler
}

func (c *Client) HandleIndexPriceEvent(handler IndexPriceHandler) {
	c.handlers.indexPrice = handler
}

func (c *Client) HandleTradeEvent(handler TradeHandler) {
	c.handlers.trade = handler
}

func (c *Client) HandlePartialDepthEvent(handler PartialDepthHandler) {
	c.handlers.partialDepth = handler
}

func (c *Client) HandleCombinedStreamEvent(handler CombinedStreamHandler) {
	c.handlers.combinedStream = handler
}

func (c *Client) HandleSubscriptionResponse(handler SubscriptionResponseHandler) {
	c.handlers.subscriptionResponse = handler
}

func (c *Client) HandleStreamError(handler StreamErrorHandler) {
	c.handlers.error = handler
}

`;
  return code;
}

function generateOptionsCombinedStreamHandlers() {
  return `
// Message processing for incoming options stream data
func (c *Client) processStreamMessage(data []byte) error {
	// First check if this is an array stream (like !miniTicker@arr)
	// by trying to parse as an array first
	var arrayData []interface{}
	if err := json.Unmarshal(data, &arrayData); err == nil {
		// This is an array stream - process as array of events
		return c.processArrayStreamEvent(data, arrayData)
	}
	
	// Parse message as object to determine type
	var baseMsg map[string]interface{}
	if err := json.Unmarshal(data, &baseMsg); err != nil {
		return fmt.Errorf("failed to parse message: %w", err)
	}

	// Check for subscription response
	if _, hasID := baseMsg["id"]; hasID {
		var response models.SubscriptionResponse
		if err := json.Unmarshal(data, &response); err != nil {
			return fmt.Errorf("failed to parse subscription response: %w", err)
		}
		if c.handlers.subscriptionResponse != nil {
			return c.handlers.subscriptionResponse(&response)
		}
		return nil
	}

	// Check for error response
	if errorData, hasError := baseMsg["error"]; hasError && errorData != nil {
		var errorResp models.ErrorResponse
		if err := json.Unmarshal(data, &errorResp); err != nil {
			return fmt.Errorf("failed to parse error response: %w", err)
		}
		if c.handlers.error != nil {
			return c.handlers.error(&errorResp)
		}
		return nil
	}

	// Check for combined stream format
	if _, hasStream := baseMsg["stream"]; hasStream {
		var combined models.CombinedStreamEvent
		if err := json.Unmarshal(data, &combined); err != nil {
			return fmt.Errorf("failed to parse combined stream: %w", err)
		}
		if c.handlers.combinedStream != nil {
			return c.handlers.combinedStream(&combined)
		}
		// Also try to process the nested data
		if dataBytes, err := json.Marshal(combined.StreamData); err == nil {
			return c.processSingleStreamEvent(dataBytes)
		}
		return nil
	}

	// Process as single stream event
	return c.processSingleStreamEvent(data)
}

// processSingleStreamEvent processes individual stream events for options
func (c *Client) processSingleStreamEvent(data []byte) error {
	// First try to parse the message as a generic map to handle flexible event type field
	var genericMsg map[string]interface{}
	if err := json.Unmarshal(data, &genericMsg); err != nil {
		return fmt.Errorf("failed to parse message: %w", err)
	}
	
	// Extract event type, handling both string and number formats
	var eventType string
	if eValue, hasEventType := genericMsg["e"]; hasEventType {
		switch v := eValue.(type) {
		case string:
			// Map options-specific event types to handler event types
			switch v {
			case "24hrTicker":
				eventType = "ticker"
			case "index":
				eventType = "index"
			case "markPrice":
				eventType = "markPrice"
			case "kline":
				eventType = "kline"
			case "trade":
				eventType = "trade"
			case "openInterest":
				eventType = "openInterest"
			case "newSymbolInfo":
				eventType = "newSymbolInfo"
			case "tickerByUnderlying":
				eventType = "tickerByUnderlying"
			default:
				// For unknown event types, try to use as-is
				eventType = v
			}
		case float64:
			// Handle numeric event types by converting to string
			eventType = fmt.Sprintf("%.0f", v)
		case int:
			// Handle integer event types by converting to string
			eventType = fmt.Sprintf("%d", v)
		default:
			return fmt.Errorf("unknown event type format: %T", v)
		}
		return c.processOptionsStreamDataByEventType(eventType, data)
	}
	
	// Special case: Check for partial depth stream (has fields: lastUpdateId, bids, asks but no "e" field)
	if _, hasLastUpdateId := genericMsg["lastUpdateId"]; hasLastUpdateId {
		if _, hasBids := genericMsg["bids"]; hasBids {
			if _, hasAsks := genericMsg["asks"]; hasAsks {
				return c.processOptionsStreamDataByEventType("partialDepth", data)
			}
		}
	}
	
	return fmt.Errorf("no event type field found")
}


// processArrayStreamEvent processes array stream events (like !miniTicker@arr)
func (c *Client) processArrayStreamEvent(data []byte, arrayData []interface{}) error {
	// Array streams contain multiple events of the same type
	// Process each element in the array individually
	if len(arrayData) == 0 {
		return nil // Empty array, nothing to process
	}
	
	// Process each element in the array
	for i, element := range arrayData {
		elementBytes, err := json.Marshal(element)
		if err != nil {
			log.Printf("Failed to marshal array element %d: %v", i, err)
			continue
		}
		
		if err := c.processSingleStreamEvent(elementBytes); err != nil {
			log.Printf("Failed to process array element %d: %v", i, err)
			// Continue processing other elements even if one fails
		}
	}
	
	return nil
}

// Process options stream data based on stream name
func (c *Client) processOptionsStreamData(streamName string, data interface{}) error {
	dataBytes, err := json.Marshal(data)
	if err != nil {
		return err
	}

	// Determine event type from options stream name patterns
	if streamName == "option_pair" || strings.Contains(streamName, "@option_pair") {
		return c.processOptionsStreamDataByEventType("newSymbolInfo", dataBytes)
	} else if strings.Contains(streamName, "@openInterest") {
		return c.processOptionsStreamDataByEventType("openInterest", dataBytes)
	} else if strings.Contains(streamName, "@markPrice") {
		return c.processOptionsStreamDataByEventType("markPrice", dataBytes)
	} else if strings.Contains(streamName, "@kline") {
		return c.processOptionsStreamDataByEventType("kline", dataBytes)
	} else if strings.Contains(streamName, "@ticker@") && strings.Contains(streamName, "@") {
		// tickerByUnderlying has format like @ticker@BTC@230630
		return c.processOptionsStreamDataByEventType("tickerByUnderlying", dataBytes)
	} else if strings.Contains(streamName, "@ticker") {
		return c.processOptionsStreamDataByEventType("ticker", dataBytes)
	} else if strings.Contains(streamName, "@index") {
		return c.processOptionsStreamDataByEventType("index", dataBytes)
	} else if strings.Contains(streamName, "@trade") {
		return c.processOptionsStreamDataByEventType("trade", dataBytes)
	} else if strings.Contains(streamName, "@depth") {
		return c.processOptionsStreamDataByEventType("partialDepth", dataBytes)
	}

	return nil
}

// Process options stream data based on event type
func (c *Client) processOptionsStreamDataByEventType(eventType string, data []byte) error {
	switch eventType {
	case "newSymbolInfo":
		if c.handlers.newSymbolInfo != nil {
			var event models.NewSymbolInfoEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.newSymbolInfo(&event)
		}
		return nil

	case "openInterest":
		if c.handlers.openInterest != nil {
			var event models.OpenInterestEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.openInterest(&event)
		}
		return nil

	case "markPrice":
		if c.handlers.markPrice != nil {
			var event models.MarkPriceEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.markPrice(&event)
		}
		return nil

	case "kline":
		if c.handlers.kline != nil {
			var event models.KlineEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.kline(&event)
		}
		return nil

	case "ticker":
		if c.handlers.ticker != nil {
			var event models.TickerEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.ticker(&event)
		}
		return nil

	case "tickerByUnderlying":
		if c.handlers.tickerByUnderlying != nil {
			var event models.TickerByUnderlyingEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.tickerByUnderlying(&event)
		}
		return nil

	case "index":
		if c.handlers.indexPrice != nil {
			var event models.IndexPriceEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.indexPrice(&event)
		}
		return nil

	case "trade":
		if c.handlers.trade != nil {
			var event models.TradeEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.trade(&event)
		}
		return nil

	case "partialDepth":
		if c.handlers.partialDepth != nil {
			var event models.PartialDepthEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.partialDepth(&event)
		}
		return nil
	}

	return nil
}

`;
}