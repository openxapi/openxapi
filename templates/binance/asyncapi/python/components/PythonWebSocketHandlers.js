// import { detectModuleName } from '../../go/components/ModuleRegistry.js'; // Removed to fix import issue

/**
 * Detect module name from AsyncAPI specification or context
 */
function detectModuleName(asyncapi, context = {}) {
  try {
    // If provided in context, use it
    if (context.detectedModule) {
      return context.detectedModule;
    }
    
    // Method 1: Check asyncapi info title
    const info = asyncapi.info();
    if (info && typeof info.title === 'function') {
      const title = info.title().toLowerCase();
      if (title.includes('streams')) {
        if (title.includes('spot')) return 'spot-streams';
        if (title.includes('usd-m') || title.includes('umfutures')) return 'umfutures-streams';
        if (title.includes('coin-m') || title.includes('cmfutures')) return 'cmfutures-streams';
        if (title.includes('options')) return 'options-streams';
        return 'streams';
      } else {
        if (title.includes('spot')) return 'spot';
        if (title.includes('usd-m') || title.includes('umfutures')) return 'umfutures';
        if (title.includes('coin-m') || title.includes('cmfutures')) return 'cmfutures';
        if (title.includes('options')) return 'options';
        if (title.includes('pmargin') || title.includes('portfolio')) return 'pmargin';
        return 'api';
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
    return 'api';
  } catch (error) {
    console.warn('Error detecting module name:', error.message);
    return 'api';
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
  
  // Parse operations from AsyncAPI spec dynamically
  try {
    const operations = asyncapi.operations();
    if (operations && typeof operations.all === 'function') {
      const operationsList = operations.all();
      
      operationsList.forEach((operation) => {
        const operationId = operation.id();
        const action = operation.action();
        
        // Handle send operations (API methods like sendPing -> ping())
        if (action === 'send') {
          const apiMethod = generatePythonApiMethodFromOperation(operation, asyncapi, detectedModule);
          if (apiMethod) {
            methodsCode.push(apiMethod);
          }
        }
        
        // Handle subscription operations (subscribe/unsubscribe)
        if (operationId && (operationId.includes('subscribe') || operationId.includes('unsubscribe'))) {
          const subscriptionMethod = generateSubscriptionMethodFromOperation(operation, detectedModule);
          if (subscriptionMethod) {
            methodsCode.push(subscriptionMethod);
          }
        }
      });
    }
  } catch (e) {
    console.warn('Error parsing AsyncAPI operations:', e.message);
    // Fallback to basic subscription methods if parsing fails
    const subscriptionMethods = generateSubscriptionMethods(detectedModule);
    methodsCode.push(subscriptionMethods);
  }

  // If no operations found, add basic methods
  if (methodsCode.length === 0) {
    const subscriptionMethods = generateSubscriptionMethods(detectedModule);
    methodsCode.push(subscriptionMethods);
  }

  return methodsCode.join('\n\n');
}

/**
 * Generate a Python API request method from an AsyncAPI operation (dynamic parsing)
 */
function generatePythonApiMethodFromOperation(operation, asyncapi, module) {
  try {
    const operationId = operation.id();
    
    // Extract method name from operation ID (e.g., "sendPing" -> "ping")
    let methodName = null;
    if (operationId && operationId.startsWith('send')) {
      // Remove 'send' prefix first (e.g., "sendTickerPrice" -> "TickerPrice")
      let rawMethodName = operationId.replace(/^send/, '');
      // Handle camelCase conversion including numbers (e.g., "Ticker24hr" -> "ticker.24hr")
      methodName = rawMethodName
        .replace(/([A-Z])/g, '.$1')           // Add dots before capitals
        .replace(/([0-9]+)/g, '.$1')          // Add dots before numbers
        .toLowerCase()
        .replace(/^\./, '');                  // Remove leading dot
    }
    
    if (!methodName) {
      return null;
    }

    // Convert method name to Python function name (e.g., "account.commission" -> "account_commission")
    const pythonMethodName = methodName.replace(/\./g, '_');
    
    // Extract request message from operation
    const messages = operation.messages();
    if (!messages || typeof messages.all !== 'function') {
      return null;
    }
    
    const messagesList = messages.all();
    const requestMessage = messagesList.find(msg => {
      const msgId = msg.id && typeof msg.id === 'function' ? msg.id() : msg.id;
      return msgId && (msgId.includes('Request') || msgId.includes('request'));
    });
    
    if (!requestMessage) {
      return null;
    }
    
    const requestMessageId = requestMessage.id && typeof requestMessage.id === 'function' ? requestMessage.id() : requestMessage.id;
    
    // Use the Go SDK-compatible method name mapping
    const realApiMethodName = getMethodNameFromMessageId(requestMessageId);
    
    // Get request and response model names
    const requestModelName = getModelClassName(requestMessageId);
    const responseModelName = getResponseModelName(requestMessageId);
    
    // Determine authentication type for this method
    const authType = getAuthType(realApiMethodName);
    const requiresAuth = authType !== AuthType.NONE;
    
    return generateMethodImplementation(pythonMethodName, realApiMethodName, requestModelName, responseModelName, requiresAuth, authType);
  } catch (e) {
    console.warn('Error generating method from operation:', e.message);
    return null;
  }
}

/**
 * Generate subscription method from AsyncAPI operation (dynamic parsing)
 */
function generateSubscriptionMethodFromOperation(operation, module) {
  try {
    const operationId = operation.id();
    
    if (!operationId) {
      return null;
    }
    
    // Extract method type (subscribe/unsubscribe)
    let methodType = null;
    if (operationId.toLowerCase().includes('subscribe') && !operationId.toLowerCase().includes('unsubscribe')) {
      methodType = 'subscribe';
    } else if (operationId.toLowerCase().includes('unsubscribe')) {
      methodType = 'unsubscribe';
    }
    
    if (!methodType) {
      return null;
    }
    
    // Generate subscription method
    return generateDynamicSubscriptionMethod(methodType, operationId);
  } catch (e) {
    console.warn('Error generating subscription method from operation:', e.message);
    return null;
  }
}

/**
 * Generate dynamic subscription method based on operation
 */
function generateDynamicSubscriptionMethod(methodType, operationId) {
  const isSubscribe = methodType === 'subscribe';
  const methodName = isSubscribe ? 'subscribe' : 'unsubscribe';
  const methodVerb = isSubscribe ? 'SUBSCRIBE' : 'UNSUBSCRIBE';
  const description = isSubscribe ? 'Subscribe to' : 'Unsubscribe from';
  
  return `    async def ${methodName}(self, streams: List[str], *, id: Optional[Union[int, str]] = None) -> None:
        """
        ${description} market data streams (generated from ${operationId})
        
        Args:
            streams: List of stream names to ${methodName}
            id: Optional request ID (auto-generated if not provided)
            
        Example:
            await client.${methodName}(['btcusdt@trade', 'ethusdt@ticker'])
        """
        if not self._is_connected:
            raise WebSocketError("WebSocket not connected")
            
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "method": "${methodVerb}",
            "params": streams,
            "id": request_id
        }
        
        await self._send_message(message)`;
}

/**
 * Generate a Python API request method from a message (fallback approach)
 */
function generatePythonApiMethodFromMessage(message, asyncapi, module) {
  const messageId = message.id();
  if (!messageId || !messageId.includes('Request')) {
    return null;
  }
  
  // Use the reliable mapping approach as fallback
  const methodName = getMethodNameFromMessageId(messageId);
  if (!methodName) {
    return null;
  }

  // Convert method name to Python function name (e.g., "order.place" -> "order_place")
  const pythonMethodName = methodName.replace(/\./g, '_').toLowerCase();
  
  // Get request and response model names
  const requestModelName = getModelClassName(messageId);
  const responseModelName = getResponseModelName(messageId);
  
  // Determine authentication type for this method
  const authType = getAuthType(methodName);
  const requiresAuth = authType !== AuthType.NONE;
  
  return generateMethodImplementation(pythonMethodName, methodName, requestModelName, responseModelName, requiresAuth, authType);
}


/**
 * Get method name from message ID using Go SDK patterns (matches working implementation)
 * Only ticker methods use dot notation, everything else uses camelCase
 */
function getMethodNameFromMessageId(messageId) {
  if (!messageId) {
    return null;
  }
  
  // Remove 'Request' suffix to get the base method name
  let methodName = messageId.replace(/Request$/, '');
  
  // Direct mapping to match Go SDK exactly (which works correctly)
  const goSdkMethodNames = {
    // Basic methods (camelCase)
    'ping': 'ping',
    'time': 'time',
    'exchangeInfo': 'exchangeInfo',
    'uiKlines': 'uiKlines',
    'avgPrice': 'avgPrice',
    'depth': 'depth',
    'klines': 'klines',
    
    // Account methods (camelCase)
    'accountStatus': 'account.status',
    'accountCommission': 'account.commission', 
    'accountRateLimitsOrders': 'account.rateLimits.orders',
    
    // Order methods (dot notation)
    'orderPlace': 'order.place',
    'orderTest': 'order.test',
    'orderStatus': 'order.status',
    'orderCancel': 'order.cancel',
    'orderCancelReplace': 'order.cancelReplace',
    'orderAmendKeepPriority': 'order.amendKeepPriority',
    'orderAmendments': 'order.amendments',
    
    // Order list methods (dot notation)
    'orderListPlace': 'orderList.place',
    'orderListPlaceOco': 'orderList.place.oco',
    'orderListPlaceOto': 'orderList.place.oto',
    'orderListPlaceOtoco': 'orderList.place.otoco',
    'orderListCancel': 'orderList.cancel',
    'orderListStatus': 'orderList.status',
    'allOrderLists': 'allOrderLists',
    'openOrderListsStatus': 'openOrderLists.status',
    
    // Open orders methods (dot notation)
    'openOrdersStatus': 'openOrders.status',
    'openOrdersCancelAll': 'openOrders.cancelAll',
    'allOrders': 'allOrders',
    
    // Trading methods (camelCase)
    'myTrades': 'myTrades',
    'myAllocations': 'myAllocations',
    'myPreventedMatches': 'myPreventedMatches',
    
    // SOR methods (dot notation)
    'sorOrderPlace': 'sor.order.place',
    'sorOrderTest': 'sor.order.test',
    
    // Ticker methods (dot notation - matching Go SDK)
    'ticker': 'ticker',
    'ticker24hr': 'ticker.24hr',
    'tickerPrice': 'ticker.price',
    'tickerBook': 'ticker.book',
    'tickerTradingDay': 'ticker.tradingDay',
    
    // Trades methods (dot notation)
    'tradesAggregate': 'trades.aggregate',
    'tradesHistorical': 'trades.historical',
    'tradesRecent': 'trades.recent',
    
    // Session methods (dot notation)
    'sessionLogon': 'session.logon',
    'sessionStatus': 'session.status',
    'sessionLogout': 'session.logout',
    
    // User data stream methods (dot notation)
    'userDataStreamStart': 'userDataStream.start',
    'userDataStreamPing': 'userDataStream.ping',
    'userDataStreamStop': 'userDataStream.stop',
    'userDataStreamSubscribe': 'userDataStream.subscribe',
    'userDataStreamUnsubscribe': 'userDataStream.unsubscribe'
  };
  
  return goSdkMethodNames[methodName] || methodName;
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
 * Authentication type constants (matching Go SDK)
 */
const AuthType = {
  NONE: 'NONE',           // Public market data - no authentication required
  TRADE: 'TRADE',         // Trading on the exchange, placing and canceling orders  
  USER_DATA: 'USER_DATA', // Private account information, such as order status and trading history
  USER_STREAM: 'USER_STREAM', // Managing User Data Stream subscriptions
  SIGNED: 'SIGNED'        // Signed requests requiring API key and signature
};

/**
 * Determine authentication type for a method (following Go SDK patterns)
 */
function getAuthType(methodName) {
  // USER_STREAM methods - only need apiKey, no timestamp/signature
  const userStreamMethods = [
    'userDataStream.start', 'userDataStream.ping', 'userDataStream.stop',
    'userDataStream.subscribe', 'userDataStream.unsubscribe'
  ];
  
  // TRADE methods - need full authentication (apiKey + timestamp + signature)
  const tradeMethods = [
    'order.place', 'order.test', 'order.cancel',
    'orderList.place.oco', 'orderList.place.oto', 'orderList.place.otoco',
    'orderList.cancel', 'sor.order.test', 'sor.order.place'
  ];
  
  // USER_DATA methods - need full authentication (apiKey + timestamp + signature)
  const userDataMethods = [
    'order.status', 'openOrders.cancelAll', 'openOrders.status',
    'allOrders', 'myTrades', 'myAllocations', 'myPreventedMatches',
    'account.status', 'account.commission', 'account.rateLimits.orders',
    'orderList.status', 'allOrderLists', 'openOrderLists.status',
    'session.logon', 'session.status', 'session.logout'
  ];
  
  if (userStreamMethods.includes(methodName)) {
    return AuthType.USER_STREAM;
  } else if (tradeMethods.includes(methodName)) {
    return AuthType.TRADE;
  } else if (userDataMethods.includes(methodName)) {
    return AuthType.USER_DATA;
  } else {
    return AuthType.NONE;
  }
}

/**
 * Check if a method requires authentication
 */
function isAuthenticatedMethod(methodName) {
  return getAuthType(methodName) !== AuthType.NONE;
}

/**
 * Check if authentication type requires signature (following Go SDK logic)
 */
function requiresSignature(authType) {
  return authType === AuthType.TRADE || authType === AuthType.USER_DATA || authType === AuthType.SIGNED;
}

/**
 * Generate the actual Python method implementation with **params pattern
 */
function generateMethodImplementation(pythonMethodName, originalMethodName, requestModelName, responseModelName, requiresAuth, authType) {
  const responseModelImport = getModelClassName(responseModelName);
  const requestModelImport = getModelClassName(requestModelName);
  
  return `    async def ${pythonMethodName}(self, request: Optional['${requestModelImport}'] = None, *, id: Optional[Union[int, str]] = None, method: Optional[str] = None) -> '${responseModelImport}':
        """
        ${getMethodDescription(originalMethodName)}
        
        Args:
            request: ${requestModelImport} object (contains all request parameters)
            id: Optional request ID (auto-generated if not provided)
            method: Optional method name (defaults to "${originalMethodName}")
            
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
        
        # Handle parameters from flattened request model
        if request is not None:
            # Use flattened request model - all parameters are now direct properties
            if hasattr(request, 'model_dump'):
                # Pydantic v2 - use by_alias=True to send camelCase field names to API
                request_data = request.model_dump(exclude_none=True, by_alias=True)
            else:
                # Pydantic v1 fallback - use by_alias=True to send camelCase field names to API
                request_data = request.dict(exclude_none=True, by_alias=True)
            
            # All request_data fields become params (since request is now flattened)
            if request_data:
                message["params"] = request_data
        ${requiresAuth ? `
        # Add authentication based on auth type (following Go SDK patterns)
        if self.auth:
            message = self._add_authentication(message, auth_type="${authType}")
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
 * Generate subscription methods for stream data (matching Go SDK)
 */
function generateSubscriptionMethods(module) {
  return `    async def subscribe(self, streams: List[str], *, id: Optional[Union[int, str]] = None) -> None:
        """
        Subscribe to market data streams (matching Go SDK)
        
        Args:
            streams: List of stream names to subscribe to
            id: Optional request ID (auto-generated if not provided)
            
        Example:
            await client.subscribe(['btcusdt@trade', 'ethusdt@ticker'])
        """
        if not self._is_connected:
            raise WebSocketError("WebSocket not connected")
            
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "method": "SUBSCRIBE",
            "params": streams,
            "id": request_id
        }
        
        await self._send_message(message)

    async def unsubscribe(self, streams: List[str], *, id: Optional[Union[int, str]] = None) -> None:
        """
        Unsubscribe from market data streams (matching Go SDK)
        
        Args:
            streams: List of stream names to unsubscribe from
            id: Optional request ID (auto-generated if not provided)
            
        Example:
            await client.unsubscribe(['btcusdt@trade', 'ethusdt@ticker'])
        """
        if not self._is_connected:
            raise WebSocketError("WebSocket not connected")
            
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "method": "UNSUBSCRIBE",
            "params": streams,
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