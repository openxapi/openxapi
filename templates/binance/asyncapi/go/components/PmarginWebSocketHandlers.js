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
	ConditionalOrderTradeUpdateHandler func(*models.ConditionalOrderTradeUpdate) error
	
	// Open Order Loss Update Handler
	OpenOrderLossHandler func(*models.OpenOrderLoss) error
	
	// Margin Account Update Handler
	MarginAccountUpdateHandler func(*models.MarginAccountUpdate) error
	
	// Liability Update Handler
	LiabilityUpdateHandler func(*models.LiabilityUpdate) error
	
	// Margin Order Update Handler
	MarginOrderUpdateHandler func(*models.MarginOrderUpdate) error
	
	// Futures Order Update Handler
	FuturesOrderUpdateHandler func(*models.FuturesOrderUpdate) error
	
	// Futures Balance Position Update Handler
	FuturesBalancePositionUpdateHandler func(*models.FuturesBalancePositionUpdate) error
	
	// Futures Account Config Update Handler
	FuturesAccountConfigUpdateHandler func(*models.FuturesAccountConfigUpdate) error
	
	// Risk Level Change Handler
	RiskLevelChangeHandler func(*models.RiskLevelChange) error
	
	// Margin Balance Update Handler
	MarginBalanceUpdateHandler func(*models.MarginBalanceUpdate) error
	
	// User Data Stream Expired Handler
	UserDataStreamExpiredHandler func(*models.UserDataStreamExpired) error
	
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
func (c *Client) OnConditionalOrderTradeUpdate(handler ConditionalOrderTradeUpdateHandler) {
	c.handlers.conditionalOrderTradeUpdate = handler
}

func (c *Client) OnOpenOrderLoss(handler OpenOrderLossHandler) {
	c.handlers.openOrderLoss = handler
}

func (c *Client) OnMarginAccountUpdate(handler MarginAccountUpdateHandler) {
	c.handlers.marginAccountUpdate = handler
}

func (c *Client) OnLiabilityUpdate(handler LiabilityUpdateHandler) {
	c.handlers.liabilityUpdate = handler
}

func (c *Client) OnMarginOrderUpdate(handler MarginOrderUpdateHandler) {
	c.handlers.marginOrderUpdate = handler
}

func (c *Client) OnFuturesOrderUpdate(handler FuturesOrderUpdateHandler) {
	c.handlers.futuresOrderUpdate = handler
}

func (c *Client) OnFuturesBalancePositionUpdate(handler FuturesBalancePositionUpdateHandler) {
	c.handlers.futuresBalancePositionUpdate = handler
}

func (c *Client) OnFuturesAccountConfigUpdate(handler FuturesAccountConfigUpdateHandler) {
	c.handlers.futuresAccountConfigUpdate = handler
}

func (c *Client) OnRiskLevelChange(handler RiskLevelChangeHandler) {
	c.handlers.riskLevelChange = handler
}

func (c *Client) OnMarginBalanceUpdate(handler MarginBalanceUpdateHandler) {
	c.handlers.marginBalanceUpdate = handler
}

func (c *Client) OnUserDataStreamExpired(handler UserDataStreamExpiredHandler) {
	c.handlers.userDataStreamExpired = handler
}

func (c *Client) OnPmarginError(handler PmarginErrorHandler) {
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
			var event models.ConditionalOrderTradeUpdate
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.conditionalOrderTradeUpdate(&event)
		}
		return nil

	case "openOrderLoss":
		if c.handlers.openOrderLoss != nil {
			var event models.OpenOrderLoss
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.openOrderLoss(&event)
		}
		return nil

	case "outboundAccountPosition":
		if c.handlers.marginAccountUpdate != nil {
			var event models.MarginAccountUpdate
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.marginAccountUpdate(&event)
		}
		return nil

	case "liabilityChange":
		if c.handlers.liabilityUpdate != nil {
			var event models.LiabilityUpdate
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.liabilityUpdate(&event)
		}
		return nil

	case "executionReport":
		if c.handlers.marginOrderUpdate != nil {
			var event models.MarginOrderUpdate
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.marginOrderUpdate(&event)
		}
		return nil

	case "ORDER_TRADE_UPDATE":
		if c.handlers.futuresOrderUpdate != nil {
			var event models.FuturesOrderUpdate
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.futuresOrderUpdate(&event)
		}
		return nil

	case "ACCOUNT_UPDATE":
		if c.handlers.futuresBalancePositionUpdate != nil {
			var event models.FuturesBalancePositionUpdate
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.futuresBalancePositionUpdate(&event)
		}
		return nil

	case "ACCOUNT_CONFIG_UPDATE":
		if c.handlers.futuresAccountConfigUpdate != nil {
			var event models.FuturesAccountConfigUpdate
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.futuresAccountConfigUpdate(&event)
		}
		return nil

	case "riskLevelChange":
		if c.handlers.riskLevelChange != nil {
			var event models.RiskLevelChange
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.riskLevelChange(&event)
		}
		return nil

	case "balanceUpdate":
		if c.handlers.marginBalanceUpdate != nil {
			var event models.MarginBalanceUpdate
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.marginBalanceUpdate(&event)
		}
		return nil

	case "listenKeyExpired":
		if c.handlers.userDataStreamExpired != nil {
			var event models.UserDataStreamExpired
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			return c.handlers.userDataStreamExpired(&event)
		}
		return nil
	}

	return nil
}

// Generate unique request ID
func (c *Client) generateRequestID() int64 {
	return time.Now().UnixNano() / int64(time.Millisecond)
}

`;
}