/*
 * Dedicated WebSocket handlers for cmfutures-streams
 * Focuses on streaming patterns for Coin-M Futures market data
 */

export function CmfuturesStreamsWebSocketHandlers({ asyncapi }) {
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

  let clientCode = generateCmfuturesStreamsClientCode(operations, channels, asyncapi);
  
  return clientCode;
}

function generateCmfuturesStreamsClientCode(operations, channels, asyncapi) {
  let code = '';

  // Generate streaming-focused methods that use models
  code += generateSubscriptionMethods();
  
  // Generate stream event handlers for cmfutures-streams specific events  
  code += generateCmfuturesStreamEventHandlers(operations, channels);
  
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

// connect establishes a WebSocket connection to a specific endpoint (for cmfutures-streams)
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

function generateCmfuturesStreamEventHandlers(operations, channels) {
  let code = `
// Stream event handler functions for Coin-M Futures
type (
	// Aggregate Trade Handler
	AggregateTradeHandler func(*models.AggregateTradeEvent) error
	
	// Index Price Handler
	IndexPriceHandler func(*models.IndexPriceEvent) error
	
	// Mark Price Handler
	MarkPriceHandler func(*models.MarkPriceEvent) error
	
	// Kline Handler  
	KlineHandler func(*models.KlineEvent) error
	
	// Continuous Kline Handler
	ContinuousKlineHandler func(*models.ContinuousKlineEvent) error
	
	// Index Kline Handler
	IndexKlineHandler func(*models.IndexKlineEvent) error
	
	// Mark Price Kline Handler
	MarkPriceKlineHandler func(*models.MarkPriceKlineEvent) error
	
	// Mini Ticker Handler
	MiniTickerHandler func(*models.MiniTickerEvent) error
	
	// Ticker Handler
	TickerHandler func(*models.TickerEvent) error
	
	// Book Ticker Handler
	BookTickerHandler func(*models.BookTickerEvent) error
	
	// Liquidation Handler
	LiquidationHandler func(*models.LiquidationEvent) error
	
	// Contract Info Handler
	ContractInfoHandler func(*models.ContractInfoEvent) error
	
	// Partial Depth Handler
	PartialDepthHandler func(*models.PartialDepthEvent) error
	
	// Depth Handler
	DepthHandler func(*models.DiffDepthEvent) error
	
	// Combined Stream Handler
	CombinedStreamHandler func(*models.CombinedStreamEvent) error
	
	// Subscription Response Handler
	SubscriptionResponseHandler func(*models.SubscriptionResponse) error
	
	// Error Handler
	StreamErrorHandler func(*models.ErrorResponse) error
)

// Event handler registry
type eventHandlers struct {
	aggregateTrade        AggregateTradeHandler
	indexPrice           IndexPriceHandler
	markPrice            MarkPriceHandler
	kline                KlineHandler
	continuousKline      ContinuousKlineHandler
	indexKline           IndexKlineHandler
	markPriceKline       MarkPriceKlineHandler
	miniTicker           MiniTickerHandler
	ticker               TickerHandler
	bookTicker           BookTickerHandler
	liquidation          LiquidationHandler
	contractInfo         ContractInfoHandler
	partialDepth         PartialDepthHandler
	depth                DepthHandler
	combinedStream       CombinedStreamHandler
	subscriptionResponse SubscriptionResponseHandler
	error                StreamErrorHandler
}

// Register event handlers for Coin-M Futures streams
func (c *Client) HandleAggregateTradeEvent(handler AggregateTradeHandler) {
	c.handlers.aggregateTrade = handler
}

func (c *Client) HandleIndexPriceEvent(handler IndexPriceHandler) {
	c.handlers.indexPrice = handler
}

func (c *Client) HandleMarkPriceEvent(handler MarkPriceHandler) {
	c.handlers.markPrice = handler
}

func (c *Client) HandleKlineEvent(handler KlineHandler) {
	c.handlers.kline = handler
}

func (c *Client) HandleContinuousKlineEvent(handler ContinuousKlineHandler) {
	c.handlers.continuousKline = handler
}

func (c *Client) HandleIndexKlineEvent(handler IndexKlineHandler) {
	c.handlers.indexKline = handler
}

func (c *Client) HandleMarkPriceKlineEvent(handler MarkPriceKlineHandler) {
	c.handlers.markPriceKline = handler
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

func (c *Client) HandleLiquidationEvent(handler LiquidationHandler) {
	c.handlers.liquidation = handler
}

func (c *Client) HandleContractInfoEvent(handler ContractInfoHandler) {
	c.handlers.contractInfo = handler
}

func (c *Client) HandlePartialDepthEvent(handler PartialDepthHandler) {
	c.handlers.partialDepth = handler
}

func (c *Client) HandleDepthEvent(handler DepthHandler) {
	c.handlers.depth = handler
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

  // Generate stream message processing code for cmfutures-streams
  code += generateCmfuturesStreamProcessing();
  
  return code;
}

function generateCmfuturesStreamProcessing() {
  return `
// Message processing for incoming stream data
func (c *Client) processStreamMessage(data []byte) error {
	// First check if this is an array stream (like !assetIndex@arr)
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
		
		if err := c.processSingleStreamEvent(elementBytes); err != nil {
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

	// Determine event type from stream name for Coin-M Futures
	if strings.Contains(streamName, "@aggTrade") {
		return c.processStreamDataByEventType("aggTrade", dataBytes)
	} else if strings.Contains(streamName, "@indexPrice") {
		return c.processStreamDataByEventType("indexPriceUpdate", dataBytes)
	} else if strings.Contains(streamName, "@markPrice") {
		return c.processStreamDataByEventType("markPriceUpdate", dataBytes)
	} else if strings.Contains(streamName, "@continuousKline") {
		return c.processStreamDataByEventType("continuous_kline", dataBytes)
	} else if strings.Contains(streamName, "@indexPriceKline") {
		return c.processStreamDataByEventType("indexPrice_kline", dataBytes)
	} else if strings.Contains(streamName, "@markPriceKline") {
		return c.processStreamDataByEventType("markPrice_kline", dataBytes)
	} else if strings.Contains(streamName, "@kline") {
		return c.processStreamDataByEventType("kline", dataBytes)
	} else if strings.Contains(streamName, "@miniTicker") {
		return c.processStreamDataByEventType("24hrMiniTicker", dataBytes)
	} else if strings.Contains(streamName, "@ticker") {
		return c.processStreamDataByEventType("24hrTicker", dataBytes)
	} else if strings.Contains(streamName, "@bookTicker") {
		return c.processStreamDataByEventType("bookTicker", dataBytes)
	} else if strings.Contains(streamName, "@forceOrder") {
		return c.processStreamDataByEventType("forceOrder", dataBytes)
	} else if strings.Contains(streamName, "@contractInfo") {
		return c.processStreamDataByEventType("contractInfo", dataBytes)
	} else if strings.Contains(streamName, "@depth") {
		return c.processStreamDataByEventType("depthUpdate", dataBytes)
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

	case "indexPriceUpdate":
		if c.handlers.indexPrice != nil {
			var event models.IndexPriceEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.indexPrice(&event)
		}
		return nil

	case "markPriceUpdate":
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

	case "continuous_kline":
		if c.handlers.continuousKline != nil {
			var event models.ContinuousKlineEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.continuousKline(&event)
		}
		return nil

	case "indexPrice_kline":
		if c.handlers.indexKline != nil {
			var event models.IndexKlineEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.indexKline(&event)
		}
		return nil

	case "markPrice_kline":
		if c.handlers.markPriceKline != nil {
			var event models.MarkPriceKlineEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.markPriceKline(&event)
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

	case "forceOrder":
		if c.handlers.liquidation != nil {
			var event models.LiquidationEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.liquidation(&event)
		}
		return nil

	case "contractInfo":
		if c.handlers.contractInfo != nil {
			var event models.ContractInfoEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.contractInfo(&event)
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
	}

	return nil
}

`;
}

function generateCombinedStreamHandlers() {
  return `
// Combined stream processing
// Combined streams wrap each event with stream name and data fields
// Format: {"stream": "btcusd_perp@aggTrade", "data": {...}}
// This section is already handled in processStreamMessage()

`;
}