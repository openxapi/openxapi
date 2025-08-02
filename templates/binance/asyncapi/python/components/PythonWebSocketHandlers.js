// import { detectModuleName } from '../../go/components/ModuleRegistry.js'; // Removed to fix import issue

/**
 * Detect module name from AsyncAPI specification
 */
function detectModuleName(asyncapi, context = {}) {
  try {
    // Method 1: Check asyncapi info title
    const info = asyncapi.info();
    if (info && typeof info.title === 'function') {
      const title = info.title();
      if (title) {
        const titleLower = title.toLowerCase();
        if (titleLower.includes('spot')) return 'spot';
        if (titleLower.includes('umfutures') || titleLower.includes('usd-m')) return 'umfutures';
        if (titleLower.includes('cmfutures') || titleLower.includes('coin-m')) return 'cmfutures';
        if (titleLower.includes('options')) return 'options';
        if (titleLower.includes('pmargin') || titleLower.includes('portfolio')) return 'pmargin';
      }
    }
    
    // Method 2: Check context for module information
    if (context.moduleName) {
      const moduleName = context.moduleName.toLowerCase();
      if (moduleName.includes('spot')) return 'spot';
      if (moduleName.includes('umfutures') || moduleName.includes('usd-m')) return 'umfutures';
      if (moduleName.includes('cmfutures') || moduleName.includes('coin-m')) return 'cmfutures';
      if (moduleName.includes('options')) return 'options';
      if (moduleName.includes('pmargin') || moduleName.includes('portfolio')) return 'pmargin';
    }
    
    // Method 3: Fallback to default
    return 'spot';
  } catch (error) {
    console.warn('Error detecting module name:', error.message);
    return 'spot';
  }
}

/**
 * Generate Python WebSocket API request methods based on AsyncAPI operations
 * This generates actual API methods (ping, time, order_place, etc.) not just handlers
 * @param {Object} params - Parameters object
 * @param {Object} params.asyncapi - AsyncAPI document
 * @param {Object} params.context - Generation context
 * @returns {string} Generated Python API request methods
 */
export function PythonWebSocketHandlers({ asyncapi, context }) {
  const { packageName, moduleName } = context;
  const detectedModule = detectModuleName(asyncapi, context);
  
  let methodsCode = [];
  
  // Try alternative approach using channels to generate API methods
  try {
    const channels = asyncapi.channels();
    if (channels && typeof channels.all === 'function') {
      const channelsList = channels.all();
      
      channelsList.forEach((channel) => {
        const messages = channel.messages();
        if (messages && typeof messages.all === 'function') {
          messages.all().forEach(message => {
            const messageId = message.id();
            if (messageId && messageId.includes('Request')) {
              const apiMethod = generatePythonApiMethodFromMessage(message, asyncapi, detectedModule);
              if (apiMethod) {
                methodsCode.push(apiMethod);
              }
            }
          });
        }
      });
    }
  } catch (e) {
    // Fallback to basic methods if parsing fails
  }

  // Generate subscription methods
  const subscriptionMethods = generateSubscriptionMethods(detectedModule);
  methodsCode.push(subscriptionMethods);

  return methodsCode.join('\n\n');
}

/**
 * Generate a Python API request method from a message (alternative approach)
 */
function generatePythonApiMethodFromMessage(message, asyncapi, module) {
  const messageId = message.id();
  if (!messageId || !messageId.includes('Request')) {
    return null;
  }
  
  // Use the reliable mapping approach
  const methodName = getMethodNameFromMessageId(messageId);
  if (!methodName) {
    return null;
  }

  // Convert method name to Python function name (e.g., "order.place" -> "order_place")
  const pythonMethodName = methodName.replace(/\./g, '_').toLowerCase();
  
  // Get request and response model names
  const requestModelName = getModelClassName(messageId);
  const responseModelName = getResponseModelName(messageId);
  
  // Check if this method requires authentication
  const requiresAuth = isAuthenticatedMethod(methodName);
  
  return generateMethodImplementation(pythonMethodName, methodName, requestModelName, responseModelName, requiresAuth);
}

/**
 * Generate a Python API request method for a send operation
 */
function generatePythonApiMethod(operation, asyncapi, module) {
  const operationId = operation.id();
  
  // Extract the actual method name from the operation
  const sendMessage = operation.messages().find(msg => {
    const msgId = msg.id();
    return msgId && msgId.includes('Request');
  });
  
  if (!sendMessage) {
    return null;
  }

  const methodName = extractMethodNameFromMessage(sendMessage);
  if (!methodName) {
    return null;
  }

  // Convert method name to Python function name (e.g., "order.place" -> "order_place")
  const pythonMethodName = methodName.replace(/\./g, '_').toLowerCase();
  
  // Get request and response model names
  const requestModelName = getModelClassName(sendMessage.id());
  const responseModelName = getResponseModelName(sendMessage.id());
  
  // Check if this method requires authentication
  const requiresAuth = isAuthenticatedMethod(methodName);
  
  return generateMethodImplementation(pythonMethodName, methodName, requestModelName, responseModelName, requiresAuth);
}

/**
 * Get method name from message ID using a simple mapping approach
 * This is more reliable than trying to parse the AsyncAPI schema directly
 */
function getMethodNameFromMessageId(messageId) {
  // Simple mapping from message ID to method name
  const methodMap = {
    'pingRequest': 'ping',
    'timeRequest': 'time',
    'exchangeInfoRequest': 'exchangeInfo',
    'orderPlaceRequest': 'order.place',
    'orderTestRequest': 'order.test',
    'orderStatusRequest': 'order.status',
    'orderCancelRequest': 'order.cancel',
    'openOrdersStatusRequest': 'openOrders.status',
    'openOrdersCancelAllRequest': 'openOrders.cancelAll',
    'allOrdersRequest': 'allOrders',
    'myTradesRequest': 'myTrades',
    'tickerRequest': 'ticker',
    'ticker24hrRequest': 'ticker.24hr',
    'tickerPriceRequest': 'ticker.price',
    'tickerBookRequest': 'ticker.book',
    'tickerTradingDayRequest': 'ticker.tradingDay',
    'depthRequest': 'depth',
    'klinesRequest': 'klines',
    'uiKlinesRequest': 'uiKlines',
    'avgPriceRequest': 'avgPrice',
    'tradesAggregateRequest': 'trades.aggregate',
    'tradesHistoricalRequest': 'trades.historical',
    'tradesRecentRequest': 'trades.recent',
    'sessionLogonRequest': 'session.logon',
    'sessionStatusRequest': 'session.status',
    'sessionLogoutRequest': 'session.logout',
    'userDataStreamStartRequest': 'userDataStream.start',
    'userDataStreamPingRequest': 'userDataStream.ping',
    'userDataStreamStopRequest': 'userDataStream.stop',
    'userDataStreamSubscribeRequest': 'userDataStream.subscribe',
    'userDataStreamUnsubscribeRequest': 'userDataStream.unsubscribe',
    'accountStatusRequest': 'account.status',
    'accountCommissionRequest': 'account.commission',
    'accountRateLimitsOrdersRequest': 'account.rateLimits.orders',
    'myAllocationsRequest': 'myAllocations',
    'myPreventedMatchesRequest': 'myPreventedMatches',
    'orderListPlaceOcoRequest': 'orderList.place.oco',
    'orderListPlaceOtoRequest': 'orderList.place.oto',
    'orderListPlaceOtocoRequest': 'orderList.place.otoco',
    'orderListPlaceRequest': 'orderList.place',
    'orderListCancelRequest': 'orderList.cancel',
    'orderListStatusRequest': 'orderList.status',
    'allOrderListsRequest': 'allOrderLists',
    'openOrderListsStatusRequest': 'openOrderLists.status',
    'sorOrderTestRequest': 'sor.order.test',
    'sorOrderPlaceRequest': 'sor.order.place',
    'orderAmendKeepPriorityRequest': 'order.amendKeepPriority',
    'orderAmendmentsRequest': 'order.amendments',
    'orderCancelReplaceRequest': 'order.cancelReplace'
  };
  
  return methodMap[messageId] || null;
}

/**
 * Extract the actual method name from a message (legacy approach - not currently used)
 */
function extractMethodNameFromMessage(message) {
  try {
    const payload = message.payload();
    if (!payload || !payload.properties) {
      return null;
    }
    
    let properties;
    if (typeof payload.properties === 'function') {
      properties = payload.properties();
    } else {
      properties = payload.properties;
    }
    
    // Get the method property
    let methodProp;
    if (properties && typeof properties.get === 'function') {
      methodProp = properties.get('method');
    } else if (properties && properties.method) {
      methodProp = properties.method;
    }
    
    if (!methodProp) {
      return null;
    }
    
    // Get the const value
    let constValue;
    if (typeof methodProp.const === 'function') {
      constValue = methodProp.const();
    } else if (methodProp.const !== undefined) {
      constValue = methodProp.const;
    } else if (methodProp.value !== undefined) {
      constValue = methodProp.value;
    } else if (methodProp.default !== undefined) {
      constValue = methodProp.default;
    }
    
    return constValue;
  } catch (e) {
    return null;
  }
}

/**
 * Convert message ID to Python model class name
 */
function getModelClassName(messageId) {
  // Convert from snake_case to PascalCase
  return messageId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))  // Don't force lowercase
    .join('');
}

/**
 * Get response model name from request message ID
 */
function getResponseModelName(requestMessageId) {
  const responseMessageId = requestMessageId.replace(/Request$/, 'Response');
  return getModelClassName(responseMessageId);
}

/**
 * Check if a method requires authentication
 */
function isAuthenticatedMethod(methodName) {
  const authMethods = [
    'order.place', 'order.test', 'order.status', 'order.cancel',
    'openOrders.cancelAll', 'openOrders.status',
    'allOrders', 'myTrades', 'myAllocations', 'myPreventedMatches',
    'account.status', 'account.commission', 'account.rateLimits.orders',
    'userDataStream.start', 'userDataStream.ping', 'userDataStream.stop',
    'userDataStream.subscribe', 'userDataStream.unsubscribe',
    'session.logon', 'session.status', 'session.logout',
    'orderList.place.oco', 'orderList.place.oto', 'orderList.place.otoco',
    'orderList.cancel', 'orderList.status',
    'allOrderLists', 'openOrderLists.status',
    'sor.order.test', 'sor.order.place'
  ];
  
  return authMethods.includes(methodName);
}

/**
 * Generate the actual Python method implementation with **params pattern
 */
function generateMethodImplementation(pythonMethodName, originalMethodName, requestModelName, responseModelName, requiresAuth) {
  const responseModelImport = getModelClassName(responseModelName);
  
  return `    async def ${pythonMethodName}(self, *, id: Optional[Union[int, str]] = None, method: Optional[str] = None, **params) -> '${responseModelImport}':
        """
        ${getMethodDescription(originalMethodName)}
        
        Args:
            id: Optional request ID (auto-generated if not provided)
            method: Optional method name (defaults to "${originalMethodName}")
            **params: Request parameters as keyword arguments
            
        Returns:
            ${responseModelImport}: API response
            
        Raises:
            WebSocketError: If not connected or request fails
            AuthenticationError: If authentication required but not provided
        """
        if not self._is_connected or not self._websocket:
            raise WebSocketError("Not connected to WebSocket")
        
        # Generate request ID if not provided
        request_id = id if id is not None else self._generate_request_id()
        
        # Create request message with proper structure
        message = {
            "id": request_id,
            "method": method or "${originalMethodName}"
        }
        
        # Add request parameters if provided
        if params:
            # Filter out None values from params
            filtered_params = {k: v for k, v in params.items() if v is not None}
            if filtered_params:
                message["params"] = filtered_params
        ${requiresAuth ? `
        # Add authentication if required
        if self.auth:
            message = await self._add_authentication(message)
        else:
            raise AuthenticationError("Authentication required for ` + originalMethodName + `")` : ''}
        
        # Send request and wait for response
        response_future = asyncio.Future()
        request_id_str = str(request_id)
        self._response_handlers[request_id_str] = lambda data: response_future.set_result(data)
        
        try:
            await self._send_message(message)
            
            # Wait for response with timeout
            response_data = await asyncio.wait_for(response_future, timeout=30.0)
            
            # Parse response into model
            if 'error' in response_data:
                raise WebSocketError(f"API error: {response_data['error']}")
            
            # Create response model from entire response data (preserves status, rateLimits, etc.)
            return ${responseModelImport}(**response_data)
            
        except asyncio.TimeoutError:
            self._response_handlers.pop(request_id_str, None)
            raise WebSocketError(f"Timeout waiting for ` + originalMethodName + ` response")
        except Exception as e:
            self._response_handlers.pop(request_id_str, None)
            raise WebSocketError(f"Request failed: {e}")`;
}

/**
 * Get method description for documentation
 */
function getMethodDescription(methodName) {
  const descriptions = {
    'ping': 'Test connectivity to the WebSocket API',
    'time': 'Get the current server time',
    'exchangeInfo': 'Get current exchange trading rules and symbol information',
    'order.place': 'Place a new order',
    'order.test': 'Test a new order (validates parameters without placing)',
    'order.status': 'Get order status',
    'order.cancel': 'Cancel an active order',
    'openOrders.status': 'Get all open orders on a symbol',
    'openOrders.cancelAll': 'Cancel all open orders on a symbol',
    'allOrders': 'Get all account orders (active, canceled, filled)',
    'myTrades': 'Get account trade list',
    'ticker': 'Get rolling window price change statistics',
    'ticker.24hr': 'Get 24hr rolling window price change statistics',
    'ticker.price': 'Get symbol price ticker',
    'ticker.book': 'Get symbol order book ticker',
    'depth': 'Get order book depth',
    'klines': 'Get Kline/candlestick data',
    'avgPrice': 'Get current average price for a symbol',
    'session.logon': 'Logon to the WebSocket API',
    'session.status': 'Get session status',
    'session.logout': 'Logout from the WebSocket API',
    'userDataStream.start': 'Start a user data stream',
    'userDataStream.ping': 'Ping user data stream to keep alive',
    'userDataStream.stop': 'Close a user data stream'
  };
  
  return descriptions[methodName] || `Execute ${methodName} request`;
}

/**
 * Generate subscription methods for stream data
 */
function generateSubscriptionMethods(module) {
  return `    async def subscribe(self, channel: str, *, id: Optional[Union[int, str]] = None, **params) -> None:
        """
        Subscribe to a WebSocket channel
        
        Args:
            channel: Channel name to subscribe to
            id: Optional request ID (auto-generated if not provided)
            **params: Optional parameters for subscription
        """
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "method": "SUBSCRIBE",
            "params": [channel],
            "id": request_id
        }
        
        if params:
            message["params"].extend([f"{k}={v}" for k, v in params.items()])
            
        await self._send_message(message)

    async def unsubscribe(self, channel: str, *, id: Optional[Union[int, str]] = None) -> None:
        """
        Unsubscribe from a WebSocket channel
        
        Args:
            channel: Channel name to unsubscribe from
            id: Optional request ID (auto-generated if not provided)
        """
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "method": "UNSUBSCRIBE", 
            "params": [channel],
            "id": request_id
        }
        
        await self._send_message(message)`;
}

/**
 * Generate basic methods if no operations found
 */
function generateBasicMethods() {
  return `    async def ping(self, *, id: Optional[Union[int, str]] = None, method: Optional[str] = None, **params) -> Dict[str, Any]:
        """Test connectivity to the WebSocket API"""
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "id": request_id,
            "method": method or "ping"
        }
        
        if params:
            filtered_params = {k: v for k, v in params.items() if v is not None}
            if filtered_params:
                message["params"] = filtered_params
        
        await self._send_message(message)
        return {"status": "pong"}

    async def subscribe(self, channel: str, *, id: Optional[Union[int, str]] = None, **params) -> None:
        """Subscribe to a WebSocket channel"""
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "method": "SUBSCRIBE",
            "params": [channel],
            "id": request_id
        }
        
        if params:
            message["params"].extend([f"{k}={v}" for k, v in params.items()])
        
        await self._send_message(message)

    async def unsubscribe(self, channel: str, *, id: Optional[Union[int, str]] = None) -> None:
        """Unsubscribe from a WebSocket channel"""
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "method": "UNSUBSCRIBE",
            "params": [channel], 
            "id": request_id
        }
        
        await self._send_message(message)`;
}

export default PythonWebSocketHandlers;