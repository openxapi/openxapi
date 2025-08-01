/*
 * Dedicated WebSocket handlers for spot-streams
 * Focuses on streaming patterns rather than request/response patterns
 */

export function SpotStreamsWebSocketHandlers({ asyncapi }) {
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

  let clientCode = generateSpotStreamsClientCode(operations, channels, asyncapi);
  
  return clientCode;
}

function generateSpotStreamsClientCode(operations, channels, asyncapi) {
  let code = '';

  // Generate streaming-focused methods that use models
  code += generateSubscriptionMethods();
  
  // Generate stream event handlers  
  code += generateStreamEventHandlers(operations, channels);
  
  // Generate combined stream handlers
  code += generateCombinedStreamHandlers();
  
  return code;
}

function generateSubscriptionMethods() {
  return `
// Subscribe to market data streams
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

// Unsubscribe from market data streams  
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
	
	// Set server variable to single stream path
	if err := c.setStreamPath("ws"); err != nil {
		return fmt.Errorf("failed to set stream path: %w", err)
	}
	
	// Build endpoint URL with timeUnit parameter
	endpoint := "/ws"
	if timeUnit != "" {
		endpoint += timeUnit // timeUnit should be formatted like "?timeUnit=MICROSECOND"
	}
	
	return c.connect(ctx, endpoint, false) // false = not combined stream
}

// ConnectToCombinedStreams connects to combined stream endpoint with optional timeUnit parameter
func (c *Client) ConnectToCombinedStreams(ctx context.Context, timeUnit string) error {
	if c.isConnected {
		return fmt.Errorf("already connected to websocket")
	}
	
	// Set server variable to combined stream path
	if err := c.setStreamPath("stream"); err != nil {
		return fmt.Errorf("failed to set stream path: %w", err)
	}
	
	// Build endpoint URL with timeUnit parameter
	endpoint := "/stream"
	if timeUnit != "" {
		endpoint += timeUnit // timeUnit should be formatted like "?timeUnit=MICROSECOND"
	}
	
	return c.connect(ctx, endpoint, true) // true = combined stream
}

// ConnectToSingleStreamsMicrosecond connects to single stream endpoint with microsecond precision
func (c *Client) ConnectToSingleStreamsMicrosecond(ctx context.Context) error {
	return c.ConnectToSingleStreams(ctx, "?timeUnit=MICROSECOND")
}

// ConnectToCombinedStreamsMicrosecond connects to combined stream endpoint with microsecond precision
func (c *Client) ConnectToCombinedStreamsMicrosecond(ctx context.Context) error {
	return c.ConnectToCombinedStreams(ctx, "?timeUnit=MICROSECOND")
}

// setStreamPath sets the server variable for stream path selection
func (c *Client) setStreamPath(streamPath string) error {
	activeServer := c.serverManager.GetActiveServer()
	if activeServer == nil {
		return fmt.Errorf("no active server configured")
	}
	
	// Update the server's pathname to use the specified stream path
	updatedPathname := "/" + streamPath
	return c.serverManager.UpdateServerPathname(activeServer.Name, updatedPathname)
}

// connect establishes a WebSocket connection to a specific endpoint (for spot-streams)
func (c *Client) connect(ctx context.Context, endpoint string, isCombined bool) error {
	// Check connection state with proper locking
	c.connMu.RLock()
	isConnected := c.isConnected
	c.connMu.RUnlock()
	
	if isConnected {
		return fmt.Errorf("websocket already connected")
	}
	
	activeServer := c.serverManager.GetActiveServer()
	if activeServer == nil {
		return fmt.Errorf("no active server configured")
	}
	
	// Build the WebSocket URL with the specific endpoint
	// For streams, we connect directly to the endpoint (like /ws or /stream)
	// The Host field should be clean hostname without template variables
	host := activeServer.Host
	if strings.Contains(host, "{streamPath}") {
		// Extract just the hostname part, removing template variables
		host = strings.Split(host, "/")[0]
		host = strings.ReplaceAll(host, "{streamPath}", "")
	}
	serverURL := fmt.Sprintf("%s://%s%s", activeServer.Protocol, host, endpoint)
	
	u, err := url.Parse(serverURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", serverURL, err)
	}

	// Safely assign connection with proper locking
	c.connMu.Lock()
	c.conn = conn
	c.isConnected = true
	c.connMu.Unlock()
	
	// Start message processing based on connection type
	if isCombined {
		go c.readCombinedStreamMessages()
	} else {
		go c.readSingleStreamMessages()
	}
	
	return nil
}

// readSingleStreamMessages processes messages from single stream connections
func (c *Client) readSingleStreamMessages() {
	defer func() {
		c.isConnected = false
	}()

	for {
		select {
		case <-c.done:
			return
		default:
			// Safely access connection with read lock
			c.connMu.RLock()
			conn := c.conn
			c.connMu.RUnlock()
			
			// Check if connection is nil (race condition protection)
			if conn == nil {
				return
			}
			
			_, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					return
				}
				if strings.Contains(err.Error(), "use of closed network connection") {
					return
				}
				log.Printf("Error reading message: %v", err)
				return
			}

			if err := c.processStreamMessage(message); err != nil {
				log.Printf("Error processing stream message: %v", err)
			}
		}
	}
}

// readCombinedStreamMessages processes messages from combined stream connections
func (c *Client) readCombinedStreamMessages() {
	defer func() {
		c.isConnected = false
	}()

	for {
		select {
		case <-c.done:
			return
		default:
			// Safely access connection with read lock
			c.connMu.RLock()
			conn := c.conn
			c.connMu.RUnlock()
			
			// Check if connection is nil (race condition protection)
			if conn == nil {
				return
			}
			
			_, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					return
				}
				if strings.Contains(err.Error(), "use of closed network connection") {
					return
				}
				log.Printf("Error reading message: %v", err)
				return
			}

			if err := c.processStreamMessage(message); err != nil {
				log.Printf("Error processing stream message: %v", err)
			}
		}
	}
}

`;
}

function generateStreamEventHandlers(operations, channels) {
  let code = `
// Stream event handler functions
type (
	// Aggregate Trade Handler
	AggregateTradeHandler func(*models.AggregateTradeEvent) error
	
	// Trade Handler
	TradeHandler func(*models.TradeEvent) error
	
	// Kline Handler  
	KlineHandler func(*models.KlineEvent) error
	
	// Mini Ticker Handler
	MiniTickerHandler func(*models.MiniTickerEvent) error
	
	// Ticker Handler
	TickerHandler func(*models.TickerEvent) error
	
	// Book Ticker Handler
	BookTickerHandler func(*models.BookTickerEvent) error
	
	// Depth Handler
	DepthHandler func(*models.DiffDepthEvent) error
	
	// Partial Depth Handler
	PartialDepthHandler func(*models.PartialDepthEvent) error
	
	// Rolling Window Ticker Handler
	RollingWindowTickerHandler func(*models.RollingWindowTickerEvent) error
	
	// Average Price Handler
	AvgPriceHandler func(*models.AvgPriceEvent) error
	
	// Combined Stream Handler
	CombinedStreamHandler func(*models.CombinedStreamEvent) error
	
	// Subscription Response Handler
	SubscriptionResponseHandler func(*models.SubscriptionResponse) error
	
	// Error Handler
	StreamErrorHandler func(*models.ErrorResponse) error
)

// Event handler registry
type eventHandlers struct {
	aggregateTrade      AggregateTradeHandler
	trade              TradeHandler  
	kline              KlineHandler
	miniTicker         MiniTickerHandler
	ticker             TickerHandler
	bookTicker         BookTickerHandler
	depth              DepthHandler
	partialDepth       PartialDepthHandler
	rollingWindowTicker RollingWindowTickerHandler
	avgPrice           AvgPriceHandler
	combinedStream     CombinedStreamHandler
	subscriptionResponse SubscriptionResponseHandler
	error              StreamErrorHandler
}

// Register event handlers
func (c *Client) HandleAggregateTradeEvent(handler AggregateTradeHandler) {
	c.handlers.aggregateTrade = handler
}

func (c *Client) HandleTradeEvent(handler TradeHandler) {
	c.handlers.trade = handler
}

func (c *Client) HandleKlineEvent(handler KlineHandler) {
	c.handlers.kline = handler
}

func (c *Client) HandleMiniTickerEvent(handler MiniTickerHandler) {
	c.handlers.miniTicker = handler
}

func (c *Client) HandleTickerEvent(handler TickerHandler) {
	c.handlers.ticker = handler
}

func (c *Client) HandleBookTickerEvent(handler BookTickerHandler) {
	c.handlers.bookTicker = handler
}

func (c *Client) HandleDepthEvent(handler DepthHandler) {
	c.handlers.depth = handler
}

func (c *Client) HandlePartialDepthEvent(handler PartialDepthHandler) {
	c.handlers.partialDepth = handler
}

func (c *Client) HandleRollingWindowTickerEvent(handler RollingWindowTickerHandler) {
	c.handlers.rollingWindowTicker = handler
}

func (c *Client) HandleAvgPriceEvent(handler AvgPriceHandler) {
	c.handlers.avgPrice = handler
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

function generateCombinedStreamHandlers() {
  return `
// Message processing for incoming stream data
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

// processSingleStreamEvent processes individual stream events
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
			eventType = v
		case float64:
			// Handle numeric event types by converting to string
			eventType = fmt.Sprintf("%.0f", v)
		case int:
			// Handle integer event types by converting to string
			eventType = fmt.Sprintf("%d", v)
		default:
			return fmt.Errorf("unknown event type format: %T", v)
		}
		return c.processStreamDataByEventType(eventType, data)
	}
	
	// Special case: Check for bookTicker stream (has fields: u, s, b, B, a, A but no "e" field)
	if _, hasU := genericMsg["u"]; hasU {
		if _, hasS := genericMsg["s"]; hasS {
			if _, hasB := genericMsg["b"]; hasB {
				if _, hasBigB := genericMsg["B"]; hasBigB {
					if _, hasA := genericMsg["a"]; hasA {
						if _, hasBigA := genericMsg["A"]; hasBigA {
							return c.processStreamDataByEventType("bookTicker", data)
						}
					}
				}
			}
		}
	}
	
	// Special case: Check for partial depth stream (has fields: lastUpdateId, bids, asks but no "e" field)
	if _, hasLastUpdateId := genericMsg["lastUpdateId"]; hasLastUpdateId {
		if _, hasBids := genericMsg["bids"]; hasBids {
			if _, hasAsks := genericMsg["asks"]; hasAsks {
				return c.processStreamDataByEventType("partialDepth", data)
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
		
		// Parse the element to determine its event type
		var genericMsg map[string]interface{}
		if err := json.Unmarshal(elementBytes, &genericMsg); err != nil {
			log.Printf("Failed to parse array element %d: %v", i, err)
			continue
		}
		
		// Extract event type from the element
		var eventType string
		if eValue, hasEventType := genericMsg["e"]; hasEventType {
			switch v := eValue.(type) {
			case string:
				eventType = v
			case float64:
				eventType = fmt.Sprintf("%.0f", v)
			case int:
				eventType = fmt.Sprintf("%d", v)
			default:
				log.Printf("Unknown event type format in array element %d: %T", i, v)
				continue
			}
		} else {
			// Special case: Check for bookTicker stream (has fields: u, s, b, B, a, A but no "e" field)
			if _, hasU := genericMsg["u"]; hasU {
				if _, hasS := genericMsg["s"]; hasS {
					if _, hasB := genericMsg["b"]; hasB {
						if _, hasBigB := genericMsg["B"]; hasBigB {
							if _, hasA := genericMsg["a"]; hasA {
								if _, hasBigA := genericMsg["A"]; hasBigA {
									eventType = "bookTicker"
								}
							}
						}
					}
				}
			}
			
			// Special case: Check for partial depth stream (has fields: lastUpdateId, bids, asks but no "e" field)
			if eventType == "" {
				if _, hasLastUpdateId := genericMsg["lastUpdateId"]; hasLastUpdateId {
					if _, hasBids := genericMsg["bids"]; hasBids {
						if _, hasAsks := genericMsg["asks"]; hasAsks {
							eventType = "partialDepth"
						}
					}
				}
			}
			
			if eventType == "" {
				log.Printf("No event type field found in array element %d", i)
				continue
			}
		}
		
		if err := c.processStreamDataByEventType(eventType, elementBytes); err != nil {
			log.Printf("Failed to process array element %d: %v", i, err)
			// Continue processing other elements even if one fails
		}
	}
	
	return nil
}

// Process stream data based on stream name
func (c *Client) processStreamData(streamName string, data interface{}) error {
	dataBytes, err := json.Marshal(data)
	if err != nil {
		return err
	}

	// Determine event type from stream name
	if strings.Contains(streamName, "@aggTrade") {
		return c.processStreamDataByEventType("aggTrade", dataBytes)
	} else if strings.Contains(streamName, "@trade") {
		return c.processStreamDataByEventType("trade", dataBytes)
	} else if strings.Contains(streamName, "@kline") {
		return c.processStreamDataByEventType("kline", dataBytes)
	} else if strings.Contains(streamName, "@miniTicker") {
		return c.processStreamDataByEventType("24hrMiniTicker", dataBytes)
	} else if strings.Contains(streamName, "@ticker") {
		return c.processStreamDataByEventType("24hrTicker", dataBytes)
	} else if strings.Contains(streamName, "@bookTicker") {
		return c.processStreamDataByEventType("bookTicker", dataBytes)
	} else if strings.Contains(streamName, "@depth") {
		return c.processStreamDataByEventType("depthUpdate", dataBytes)
	} else if strings.Contains(streamName, "@avgPrice") {
		return c.processStreamDataByEventType("avgPrice", dataBytes)
	}

	return nil
}

// Process stream data based on event type
func (c *Client) processStreamDataByEventType(eventType string, data []byte) error {
	switch eventType {
	case "aggTrade":
		if c.handlers.aggregateTrade != nil {
			var event models.AggregateTradeEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.aggregateTrade(&event)
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

	case "kline":
		if c.handlers.kline != nil {
			var event models.KlineEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.kline(&event)
		}
		return nil

	case "24hrMiniTicker":
		if c.handlers.miniTicker != nil {
			var event models.MiniTickerEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.miniTicker(&event)
		}
		return nil

	case "24hrTicker":
		if c.handlers.ticker != nil {
			var event models.TickerEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.ticker(&event)
		}
		return nil

	case "bookTicker":
		if c.handlers.bookTicker != nil {
			var event models.BookTickerEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.bookTicker(&event)
		}
		return nil

	case "depthUpdate":
		if c.handlers.depth != nil {
			var event models.DiffDepthEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.depth(&event)
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

	case "avgPrice":
		if c.handlers.avgPrice != nil {
			var event models.AvgPriceEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.avgPrice(&event)
		}
		return nil
	}

	return nil
}

`;
}