/*
 * Dedicated WebSocket handlers for umfutures-streams
 * Generates handlers dynamically based on the AsyncAPI specification
 */

export function UmfuturesStreamsWebSocketHandlers({ asyncapi }) {
  const operations = new Map();
  const channels = new Map();
  const eventTypes = new Set();
  
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
      const messages = channel.messages();
      
      // Extract event types from messages
      messages.forEach((message) => {
        try {
          const payload = message.payload();
          if (payload && payload.properties) {
            let props;
            if (typeof payload.properties === 'function') {
              props = payload.properties();
            } else {
              props = payload.properties;
            }
            
            // Check for event type property
            let eventTypeProp;
            if (props && typeof props.get === 'function') {
              eventTypeProp = props.get('e');
            } else if (props && props.e) {
              eventTypeProp = props.e;
            }
            
            // Extract const value if available
            if (eventTypeProp) {
              let constValue;
              if (typeof eventTypeProp.const === 'function') {
                constValue = eventTypeProp.const();
              } else if (eventTypeProp.const) {
                constValue = eventTypeProp.const;
              }
              
              if (constValue) {
                eventTypes.add(constValue);
              }
            }
          }
        } catch (e) {
          // Ignore errors and continue
        }
      });
      
      channels.set(channelId, {
        channel,
        messages: messages
      });
    });
  } catch (e) {
    console.warn('Error extracting channels:', e.message);
  }

  let clientCode = generateUmfuturesStreamsClientCode(operations, channels, eventTypes, asyncapi);
  
  return clientCode;
}

function generateUmfuturesStreamsClientCode(operations, channels, eventTypes, asyncapi) {
  let code = '';

  // Generate streaming-focused methods that use models
  code += generateSubscriptionMethods();
  
  // Generate stream event handlers based on actual spec
  code += generateDynamicStreamEventHandlers(eventTypes);
  
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

// connect establishes a WebSocket connection to a specific endpoint (for umfutures-streams)
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
	
	// Start appropriate message reading routine
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

function generateDynamicStreamEventHandlers(eventTypes) {
  // Create a mapping of event types to model names
  // Include comprehensive mapping for all common futures stream event types
  // Only include event types that have corresponding models in umfutures-streams
  const eventToModelMap = {
    // Market data stream events (ONLY include market data events for streams module)
    'aggTrade': 'AggregateTradeEvent',
    'markPriceUpdate': 'MarkPriceEvent', 
    'kline': 'KlineEvent',
    'continuous_kline': 'ContinuousKlineEvent',
    '24hrMiniTicker': 'MiniTickerEvent',
    '24hrTicker': 'TickerEvent',
    'bookTicker': 'BookTickerEvent',
    'forceOrder': 'LiquidationEvent',
    'depthUpdate': 'DiffDepthEvent',
    'compositeIndex': 'CompositeIndexEvent',
    'contractInfo': 'ContractInfoEvent',
    'assetIndex': 'AssetIndexEvent',
    'assetIndexUpdate': 'AssetIndexEvent' // Real event type from Binance API
    // Note: User data stream events are NOT included here as they belong to the WebSocket API module,
    // not the market data streams module. The streams module only handles market data.
  };

  // Add all mapped event types to ensure they're included in generation
  // This includes both spec-defined and real API event types
  const allEventTypes = new Set([...eventTypes]);
  Object.keys(eventToModelMap).forEach(eventType => {
    allEventTypes.add(eventType);
  });

  let code = `
// Stream event handler functions
type (
`;

  // Generate handler types for actual event types (deduplicate by model name)
  const generatedHandlerTypes = new Set();
  allEventTypes.forEach(eventType => {
    const modelName = eventToModelMap[eventType];
    if (modelName && !generatedHandlerTypes.has(modelName)) {
      generatedHandlerTypes.add(modelName);
      const handlerName = modelName.replace('Event', 'Handler');
      code += `\t// ${modelName} Handler\n`;
      code += `\t${handlerName} func(*models.${modelName}) error\n\t\n`;
    }
  });

  code += `\t// Combined Stream Handler
\tCombinedStreamHandler func(*models.CombinedStreamEvent) error
\t
\t// Subscription Response Handler
\tSubscriptionResponseHandler func(*models.SubscriptionResponse) error
\t
\t// Error Handler
\tStreamErrorHandler func(*models.ErrorResponse) error
)

// Event handler registry
type eventHandlers struct {
`;

  // Helper function to convert event type to camelCase field name
  const toCamelCaseFieldName = (eventType) => {
    // Handle special cases with consistent naming
    const specialCases = {
      'aggTrade': 'aggregateTrade',
      '24hrMiniTicker': 'miniTicker', 
      '24hrTicker': 'ticker',
      'bookTicker': 'bookTicker',
      'depthUpdate': 'depth',
      'kline': 'kline',
      'markPriceUpdate': 'markPriceUpdate',
      'continuousKline': 'continuousKline',
      'forceOrder': 'forceOrder'
    };
    
    if (specialCases[eventType]) {
      return specialCases[eventType];
    }
    
    // Convert to camelCase: remove non-alphanumeric, split by boundaries, capitalize appropriately
    let fieldName = eventType
      .replace(/[^a-zA-Z0-9]/g, '') // remove special chars
      .replace(/^24hr/i, '') // remove 24hr prefix
      .replace(/([A-Z])/g, (match, letter, offset) => offset === 0 ? letter.toLowerCase() : letter)
      .replace(/([a-z])([A-Z])/g, '$1$2'); // preserve existing camelCase boundaries
    
    // Fix field names that start with numbers (invalid in Go)
    if (/^\d/.test(fieldName)) {
      fieldName = 'h' + fieldName.charAt(0).toUpperCase() + fieldName.slice(1); // h24hrTicker -> h24HrTicker
    }
    
    return fieldName;
  };

  // Generate handler registry fields (one field per event type, not per model)
  allEventTypes.forEach(eventType => {
    const modelName = eventToModelMap[eventType];
    if (modelName) {
      const fieldName = toCamelCaseFieldName(eventType);
      const handlerName = modelName.replace('Event', 'Handler');
      code += `\t${fieldName} ${handlerName}\n`;
    }
  });

  code += `\tcombinedStream     CombinedStreamHandler
\tsubscriptionResponse SubscriptionResponseHandler
\terror              StreamErrorHandler
}

// Register event handlers
`;

  // Generate registration methods for each unique model
  // For models that handle multiple event types, generate methods that set all relevant handlers
  const generatedMethods = new Set();
  allEventTypes.forEach(eventType => {
    const modelName = eventToModelMap[eventType];
    if (modelName && !generatedMethods.has(modelName)) {
      generatedMethods.add(modelName);
      const methodName = `Handle${modelName}`;
      const handlerName = modelName.replace('Event', 'Handler');
      
      // Find all event types that map to this model
      const relatedEventTypes = Array.from(allEventTypes).filter(et => eventToModelMap[et] === modelName);
      
      code += `func (c *Client) ${methodName}(handler ${handlerName}) {
`;
      
      // Set the handler for all related event types
      relatedEventTypes.forEach(relatedEventType => {
        const fieldName = toCamelCaseFieldName(relatedEventType);
        code += `\tc.handlers.${fieldName} = handler
`;
      });
      
      code += `}

`;
    }
  });

  code += `func (c *Client) HandleCombinedStreamEvent(handler CombinedStreamHandler) {
\tc.handlers.combinedStream = handler
}

func (c *Client) HandleSubscriptionResponse(handler SubscriptionResponseHandler) {
\tc.handlers.subscriptionResponse = handler
}

func (c *Client) HandleStreamError(handler StreamErrorHandler) {
\tc.handlers.error = handler
}

// processStreamMessage processes incoming stream messages
func (c *Client) processStreamMessage(data []byte) error {
\t// First check if this is an array stream (like !assetIndex@arr)
\t// by trying to parse as an array first
\tvar arrayData []interface{}
\tif err := json.Unmarshal(data, &arrayData); err == nil {
\t\t// This is an array stream - process as array of events
\t\treturn c.processArrayStreamEvent(data, arrayData)
\t}
\t
\t// Parse message as object to determine type
\tvar baseMsg map[string]interface{}
\tif err := json.Unmarshal(data, &baseMsg); err != nil {
\t\treturn fmt.Errorf("failed to parse message: %w", err)
\t}

\t// Check for subscription response
\tif _, hasID := baseMsg["id"]; hasID {
\t\tvar response models.SubscriptionResponse
\t\tif err := json.Unmarshal(data, &response); err != nil {
\t\t\treturn fmt.Errorf("failed to parse subscription response: %w", err)
\t\t}
\t\tif c.handlers.subscriptionResponse != nil {
\t\t\treturn c.handlers.subscriptionResponse(&response)
\t\t}
\t\treturn nil
\t}

\t// Check for error response
\tif errorData, hasError := baseMsg["error"]; hasError && errorData != nil {
\t\tvar errorResp models.ErrorResponse
\t\tif err := json.Unmarshal(data, &errorResp); err != nil {
\t\t\treturn fmt.Errorf("failed to parse error response: %w", err)
\t\t}
\t\tif c.handlers.error != nil {
\t\t\treturn c.handlers.error(&errorResp)
\t\t}
\t\treturn nil
\t}

\t// Check for combined stream format
\tif _, hasStream := baseMsg["stream"]; hasStream {
\t\tvar combined models.CombinedStreamEvent
\t\tif err := json.Unmarshal(data, &combined); err != nil {
\t\t\treturn fmt.Errorf("failed to parse combined stream: %w", err)
\t\t}
\t\tif c.handlers.combinedStream != nil {
\t\t\treturn c.handlers.combinedStream(&combined)
\t\t}
\t\t// Also try to process the nested data
\t\tif dataBytes, err := json.Marshal(combined.StreamData); err == nil {
\t\t\treturn c.processSingleStreamEvent(dataBytes)
\t\t}
\t\treturn nil
\t}

\t// Process as single stream event
\treturn c.processSingleStreamEvent(data)
}

// processArrayStreamEvent processes array stream events (like !assetIndex@arr)
func (c *Client) processArrayStreamEvent(data []byte, arrayData []interface{}) error {
\t// Array streams contain multiple events of the same type
\t// Process each element in the array individually
\tif len(arrayData) == 0 {
\t\treturn nil // Empty array, nothing to process
\t}
\t
\t// Process each element in the array
\tfor i, element := range arrayData {
\t\telementBytes, err := json.Marshal(element)
\t\tif err != nil {
\t\t\tlog.Printf("Failed to marshal array element %d: %v", i, err)
\t\t\tcontinue
\t\t}
\t\t
\t\tif err := c.processSingleStreamEvent(elementBytes); err != nil {
\t\t\tlog.Printf("Failed to process array element %d: %v", i, err)
\t\t\t// Continue processing other elements even if one fails
\t\t}
\t}
\t
\treturn nil
}

// processSingleStreamEvent processes individual stream events
func (c *Client) processSingleStreamEvent(data []byte) error {
\t// First try to parse the message as a generic map to handle flexible event type field
\tvar genericMsg map[string]interface{}
\tif err := json.Unmarshal(data, &genericMsg); err != nil {
\t\treturn fmt.Errorf("failed to parse message: %w", err)
\t}
\t
\t// Extract event type, handling both string and number formats
\tvar eventType string
\tif eValue, hasEventType := genericMsg["e"]; hasEventType {
\t\tswitch v := eValue.(type) {
\t\tcase string:
\t\t\teventType = v
\t\tcase float64:
\t\t\t// Handle numeric event types by converting to string
\t\t\teventType = fmt.Sprintf("%.0f", v)
\t\tcase int:
\t\t\t// Handle integer event types by converting to string
\t\t\teventType = fmt.Sprintf("%d", v)
\t\tdefault:
\t\t\treturn fmt.Errorf("unknown event type format: %T", v)
\t\t}
\t} else {
\t\treturn fmt.Errorf("no event type field found")
\t}

\tswitch eventType {
`;

  // Generate switch cases for each event type
  allEventTypes.forEach(eventType => {
    const modelName = eventToModelMap[eventType];
    if (modelName) {
      const fieldName = toCamelCaseFieldName(eventType);
      code += `\tcase "${eventType}":
\t\tif c.handlers.${fieldName} != nil {
\t\t\tvar event models.${modelName}
\t\t\tif err := json.Unmarshal(data, &event); err != nil {
\t\t\t\treturn fmt.Errorf("failed to parse ${eventType} event: %w", err)
\t\t\t}
\t\t\treturn c.handlers.${fieldName}(&event)
\t\t}
`;
    }
  });

  code += `\tdefault:
\t\t// Log unknown event types with full message for debugging
\t\tlog.Printf("Unknown event type '%s' in umfutures-streams. Message: %s", eventType, string(data))
\t\t// Don't return error for unknown event types, just ignore them
\t}
\treturn nil
}

`;

  return code;
}

function generateCombinedStreamHandlers() {
  return `
// Additional stream utility functions

`;
}