/*
 * Dedicated WebSocket handlers for pmargin (Portfolio Margin)
 * Focuses on portfolio margin user data streaming patterns (similar to options)
 */

export function PmarginWebSocketHandlers({ asyncapi }) {
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

  let clientCode = generatePmarginClientCode(operations, channels, asyncapi);
  
  return clientCode;
}

function generatePmarginClientCode(operations, channels, asyncapi) {
  let code = '';

  // Generate user data stream methods for portfolio margin
  code += generateUserDataStreamMethods();
  
  // Generate stream event handlers for portfolio margin events
  code += generatePmarginEventHandlers(operations, channels);
  
  // Generate combined stream handlers for portfolio margin data
  code += generatePmarginMessageHandlers();
  
  return code;
}

function generateUserDataStreamMethods() {
  return `
// Portfolio Margin User Data Stream Management

// Connect to portfolio margin user data stream
func (c *Client) ConnectToUserDataStream(ctx context.Context, listenKey string) error {
	if c.isConnected {
		return fmt.Errorf("already connected to websocket")
	}
	
	// Use ConnectWithVariables to resolve {listenKey} template variable correctly
	return c.ConnectWithVariables(ctx, listenKey)
}

// Subscribe to user data stream for portfolio margin (no specific subscription needed, auto-receives events)
func (c *Client) SubscribeToUserDataStream(ctx context.Context) error {
	if !c.isConnected {
		return fmt.Errorf("websocket not connected")
	}
	
	// Portfolio margin user data streams don't require explicit subscription
	// Events are automatically sent when connected with valid listen key
	log.Println("Connected to portfolio margin user data stream - listening for events")
	return nil
}

// Ping user data stream to keep connection alive (should be done every 30 minutes)
func (c *Client) PingUserDataStream(ctx context.Context) error {
	if !c.isConnected {
		return fmt.Errorf("websocket not connected")
	}
	
	// User data streams require periodic pings to keep alive
	// This is typically handled by the listen key management system
	log.Println("Portfolio margin user data stream ping (handled by listen key system)")
	return nil
}

`;
}

function generatePmarginEventHandlers(operations, channels) {
  let code = `
// Portfolio margin stream event handler functions
type (
	// Conditional Order Trade Update Handler
	ConditionalOrderTradeUpdateHandler func(*models.ConditionalOrderTradeUpdateEvent) error
	
	// Open Order Loss Update Handler
	OpenOrderLossHandler func(*models.OpenOrderLossEvent) error
	
	// Margin Account Update Handler
	MarginAccountUpdateHandler func(*models.MarginAccountUpdateEvent) error
	
	// Liability Update Handler
	LiabilityUpdateHandler func(*models.LiabilityUpdateEvent) error
	
	// Margin Order Update Handler
	MarginOrderUpdateHandler func(*models.MarginOrderUpdateEvent) error
	
	// Futures Order Update Handler
	FuturesOrderUpdateHandler func(*models.FuturesOrderUpdateEvent) error
	
	// Futures Balance Position Update Handler
	FuturesBalancePositionUpdateHandler func(*models.FuturesBalancePositionUpdateEvent) error
	
	// Futures Account Config Update Handler
	FuturesAccountConfigUpdateHandler func(*models.FuturesAccountConfigUpdateEvent) error
	
	// Risk Level Change Handler
	RiskLevelChangeHandler func(*models.RiskLevelChangeEvent) error
	
	// Margin Balance Update Handler
	MarginBalanceUpdateHandler func(*models.MarginBalanceUpdateEvent) error
	
	// User Data Stream Expired Handler
	UserDataStreamExpiredHandler func(*models.UserDataStreamExpiredEvent) error
	
	// Error Handler
	PmarginErrorHandler func(*models.ErrorResponse) error
)

// Event handler registry for portfolio margin streams
type eventHandlers struct {
	conditionalOrderTradeUpdate    ConditionalOrderTradeUpdateHandler
	openOrderLoss                  OpenOrderLossHandler
	marginAccountUpdate            MarginAccountUpdateHandler
	liabilityUpdate                LiabilityUpdateHandler
	marginOrderUpdate              MarginOrderUpdateHandler
	futuresOrderUpdate             FuturesOrderUpdateHandler
	futuresBalancePositionUpdate   FuturesBalancePositionUpdateHandler
	futuresAccountConfigUpdate     FuturesAccountConfigUpdateHandler
	riskLevelChange                RiskLevelChangeHandler
	marginBalanceUpdate            MarginBalanceUpdateHandler
	userDataStreamExpired          UserDataStreamExpiredHandler
	error                          PmarginErrorHandler
}

// Register event handlers for portfolio margin streams
func (c *Client) HandleConditionalOrderTradeUpdateEvent(handler ConditionalOrderTradeUpdateHandler) {
	c.handlers.conditionalOrderTradeUpdate = handler
}

func (c *Client) HandleOpenOrderLossEvent(handler OpenOrderLossHandler) {
	c.handlers.openOrderLoss = handler
}

func (c *Client) HandleMarginAccountUpdateEvent(handler MarginAccountUpdateHandler) {
	c.handlers.marginAccountUpdate = handler
}

func (c *Client) HandleLiabilityUpdateEvent(handler LiabilityUpdateHandler) {
	c.handlers.liabilityUpdate = handler
}

func (c *Client) HandleMarginOrderUpdateEvent(handler MarginOrderUpdateHandler) {
	c.handlers.marginOrderUpdate = handler
}

func (c *Client) HandleFuturesOrderUpdateEvent(handler FuturesOrderUpdateHandler) {
	c.handlers.futuresOrderUpdate = handler
}

func (c *Client) HandleFuturesBalancePositionUpdateEvent(handler FuturesBalancePositionUpdateHandler) {
	c.handlers.futuresBalancePositionUpdate = handler
}

func (c *Client) HandleFuturesAccountConfigUpdateEvent(handler FuturesAccountConfigUpdateHandler) {
	c.handlers.futuresAccountConfigUpdate = handler
}

func (c *Client) HandleRiskLevelChangeEvent(handler RiskLevelChangeHandler) {
	c.handlers.riskLevelChange = handler
}

func (c *Client) HandleMarginBalanceUpdateEvent(handler MarginBalanceUpdateHandler) {
	c.handlers.marginBalanceUpdate = handler
}

func (c *Client) HandleUserDataStreamExpiredEvent(handler UserDataStreamExpiredHandler) {
	c.handlers.userDataStreamExpired = handler
}

func (c *Client) HandlePmarginError(handler PmarginErrorHandler) {
	c.handlers.error = handler
}

`;
  return code;
}

function generatePmarginMessageHandlers() {
  return `
// Message processing for incoming portfolio margin stream data
func (c *Client) processStreamMessage(message []byte) error {
	// Try to parse as error response first
	var errorResp models.ErrorResponse
	if err := json.Unmarshal(message, &errorResp); err == nil && (errorResp.Error.Code != 0 || errorResp.Error.Msg != "") {
		if c.handlers.error != nil {
			return c.handlers.error(&errorResp)
		}
		return nil
	}

	// Try to parse as individual stream event by detecting event type
	var genericMsg map[string]interface{}
	if err := json.Unmarshal(message, &genericMsg); err == nil {
		if eventType, hasEventType := genericMsg["e"]; hasEventType {
			if eventTypeStr, ok := eventType.(string); ok {
				return c.processPmarginStreamDataByEventType(eventTypeStr, message)
			}
		}
	}

	log.Printf("Unknown portfolio margin stream message format: %s", string(message))
	return nil
}

// Process portfolio margin stream data based on event type
func (c *Client) processPmarginStreamDataByEventType(eventType string, data []byte) error {
	switch eventType {
	case "CONDITIONAL_ORDER_TRADE_UPDATE":
		if c.handlers.conditionalOrderTradeUpdate != nil {
			var event models.ConditionalOrderTradeUpdateEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.conditionalOrderTradeUpdate(&event)
		}
		return nil

	case "openOrderLoss":
		if c.handlers.openOrderLoss != nil {
			var event models.OpenOrderLossEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.openOrderLoss(&event)
		}
		return nil

	case "outboundAccountPosition":
		if c.handlers.marginAccountUpdate != nil {
			var event models.MarginAccountUpdateEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.marginAccountUpdate(&event)
		}
		return nil

	case "liabilityChange":
		if c.handlers.liabilityUpdate != nil {
			var event models.LiabilityUpdateEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.liabilityUpdate(&event)
		}
		return nil

	case "executionReport":
		if c.handlers.marginOrderUpdate != nil {
			var event models.MarginOrderUpdateEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.marginOrderUpdate(&event)
		}
		return nil

	case "ORDER_TRADE_UPDATE":
		if c.handlers.futuresOrderUpdate != nil {
			var event models.FuturesOrderUpdateEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.futuresOrderUpdate(&event)
		}
		return nil

	case "ACCOUNT_UPDATE":
		if c.handlers.futuresBalancePositionUpdate != nil {
			var event models.FuturesBalancePositionUpdateEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.futuresBalancePositionUpdate(&event)
		}
		return nil

	case "ACCOUNT_CONFIG_UPDATE":
		if c.handlers.futuresAccountConfigUpdate != nil {
			var event models.FuturesAccountConfigUpdateEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.futuresAccountConfigUpdate(&event)
		}
		return nil

	case "riskLevelChange":
		if c.handlers.riskLevelChange != nil {
			var event models.RiskLevelChangeEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.riskLevelChange(&event)
		}
		return nil

	case "balanceUpdate":
		if c.handlers.marginBalanceUpdate != nil {
			var event models.MarginBalanceUpdateEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.marginBalanceUpdate(&event)
		}
		return nil

	case "listenKeyExpired":
		if c.handlers.userDataStreamExpired != nil {
			var event models.UserDataStreamExpiredEvent
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.userDataStreamExpired(&event)
		}
		return nil
	}

	return nil
}

`;
}