/**
 * Python General WebSocket Handlers
 * Detects AsyncAPI spec type and generates appropriate handlers for all modules
 * Replaces module-specific handlers with a unified, spec-driven approach
 */

import { detectModuleName } from './PythonModuleRegistry.js';

/**
 * Generate Python WebSocket handlers based on AsyncAPI spec structure
 * @param {Object} params - Parameters object
 * @param {Object} params.asyncapi - AsyncAPI document  
 * @param {Object} params.context - Generation context
 * @returns {string} Generated Python handlers
 */
export function PythonGeneralWebSocketHandlers({ asyncapi, context }) {
  const { packageName, moduleName } = context;
  const detectedModule = detectModuleName(asyncapi, context);
  
  // Analyze the AsyncAPI spec to determine type
  const specType = analyzeSpecType(asyncapi);
  
  switch (specType) {
    case 'streams':
      return generateStreamHandlers(detectedModule, asyncapi);
    case 'api':
      return generateApiHandlers(detectedModule, asyncapi);
    default:
      return '';
  }
}

/**
 * Analyze AsyncAPI spec to determine if it's a streams spec or API spec
 * @param {Object} asyncapi - AsyncAPI document
 * @returns {string} 'streams', 'api', or 'unknown'
 */
function analyzeSpecType(asyncapi) {
  try {
    // Check title for obvious indicators first (most reliable method)
    const info = asyncapi.info && asyncapi.info();
    if (info) {
      const title = typeof info.title === 'function' ? info.title() : info.title;
      if (title && title.toLowerCase().includes('streams')) {
        return 'streams';
      }
      if (title && (title.toLowerCase().includes('websocket api') || title.toLowerCase().includes('ws api'))) {
        return 'api';
      }
    }
    
    // Check operations structure - AsyncAPI 3.0 format
    const operations = asyncapi.operations();
    if (operations) {
      let operationIds = [];
      
      try {
        // Try different ways to get operations based on AsyncAPI object structure
        if (typeof operations.all === 'function') {
          const opsArray = operations.all();
          operationIds = opsArray.map(op => op.id());
        } else if (Array.isArray(operations)) {
          operationIds = operations.map(op => op.id ? op.id() : op);
        } else if (typeof operations === 'object') {
          // Filter out internal properties and get actual operation IDs
          operationIds = Object.keys(operations).filter(key => 
            !['0', 'collections', '_meta'].includes(key)
          );
        }
      } catch (e) {
        operationIds = [];
      }
      
      // Look for stream operations (subscribe/unsubscribe patterns)
      const hasStreamOperations = operationIds.some(opId => 
        opId.toLowerCase().includes('subscribe') || 
        opId.toLowerCase().includes('stream') ||
        opId.toLowerCase().includes('single') ||
        opId.toLowerCase().includes('combined')
      );
      
      if (hasStreamOperations) {
        return 'streams';
      }
      
      // Look for API operations (send operations for request/response APIs)
      const hasSendOperations = operationIds.some(opId => 
        opId.toLowerCase().startsWith('send')
      );
      
      if (hasSendOperations) {
        return 'api';
      }
      
      // Look for event-only operations (receive patterns without send operations)
      const hasReceiveOperations = operationIds.some(opId => 
        opId.toLowerCase().includes('receive')
      );
      
      if (hasReceiveOperations && !hasSendOperations) {
        // This is an event-only module (like options) - treat as streams for subscription behavior
        return 'streams';
      }
    }
    
    // Check channels for additional clues
    const channels = asyncapi.channels();
    if (channels) {
      const channelNames = Object.keys(channels);
      
      // Stream channels often have "stream" in the name or path variables
      const hasStreamChannels = channelNames.some(name => {
        const channel = channels[name];
        let channelAddress = '';
        try {
          // Try to get address using AsyncAPI object method
          if (channel && typeof channel.address === 'function') {
            channelAddress = channel.address();
          } else if (channel && channel.address) {
            channelAddress = channel.address;
          }
        } catch (e) {
          // Ignore address access errors
        }
        
        return name.toLowerCase().includes('stream') || 
               (channelAddress && channelAddress.includes('{streamPath}'));
      });
      
      if (hasStreamChannels) {
        return 'streams';
      }
      
      // API channels are often simple like "spot", "futures"
      const hasApiChannels = channelNames.some(name => 
        ['spot', 'futures', 'margin', 'api'].includes(name.toLowerCase())
      );
      
      if (hasApiChannels) {
        return 'api';
      }
    }
    
    // Fallback: if we can't determine, return 'unknown'
    return 'unknown';
  } catch (e) {
    console.warn('Error analyzing spec type:', e.message);
    return 'unknown';
  }
}

/**
 * Generate stream subscription handlers (for *-streams modules)
 * @param {string} moduleName - Detected module name
 * @returns {string} Generated stream handlers
 */
function generateStreamHandlers(moduleName, asyncapi) {
  // Generate typed event handlers using x-event-type
  const typedHandlers = generateTypedEventHandlers(asyncapi);
  
  return `    # Market Data Stream Subscription Methods (matching Go SDK)
    
    async def subscribe(self, streams: List[str], *, id: Optional[Union[int, str]] = None) -> None:
        """
        Subscribe to market data streams
        
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
        Unsubscribe from market data streams
        
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
        
        await self._send_message(message)
    
    async def list_subscriptions(self, *, id: Optional[Union[int, str]] = None) -> None:
        """
        List active subscriptions
        
        Args:
            id: Optional request ID (auto-generated if not provided)
            
        Example:
            await client.list_subscriptions()
        """
        if not self._is_connected:
            raise WebSocketError("WebSocket not connected")
            
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "method": "LIST_SUBSCRIPTIONS",
            "id": request_id
        }
        
        await self._send_message(message)${typedHandlers}`;
}

/**
 * Generate API method handlers (for API modules like spot, umfutures, etc.)
 * @param {string} moduleName - Detected module name
 * @param {Object} asyncapi - AsyncAPI document for dynamic method generation
 * @returns {string} Generated API handlers
 */
function generateApiHandlers(moduleName, asyncapi) {
  try {
    const operations = asyncapi.operations();
    if (!operations) {
      return generateStaticApiHandlers();
    }
    
    const methods = [];
    
    // Convert operations array to object if needed
    let operationsObj = {};
    if (Array.isArray(operations)) {
      operations.forEach(op => {
        const opId = op.id();
        operationsObj[opId] = op;
      });
    } else {
      operationsObj = operations;
    }
    
    
    // Extract send operations and generate corresponding Python methods
    Object.keys(operationsObj).forEach(operationId => {
      if (operationId.startsWith('send')) {
        const operation = operationsObj[operationId];
        
        // Get the actual WebSocket method name from the operation title
        const title = (operation.title && operation.title()) || '';
        let wsMethodName = '';
        let pythonMethodName = '';
        
        if (title && title.includes('Send to ')) {
          wsMethodName = title.replace('Send to ', '').trim();
          
          // Convert WebSocket method name to Python method name
          if (wsMethodName === 'exchangeInfo') {
            pythonMethodName = 'exchange_info';
          } else if (wsMethodName.includes('/') || wsMethodName.includes('.')) {
            // Handle slash and dot notation like v2/account.balance, account.commission
            // Replace slashes with underscores and split by dots
            const cleanedName = wsMethodName.replace(/\//g, '_');
            const parts = cleanedName.split('.');
            pythonMethodName = parts.map(part => {
              // Convert each part from camelCase to snake_case
              return part.replace(/([A-Z])/g, '_$1').toLowerCase();
            }).join('_');
            
            // Remove leading underscore if any
            if (pythonMethodName.startsWith('_')) {
              pythonMethodName = pythonMethodName.substring(1);
            }
          } else {
            // Convert camelCase to snake_case for Python convention
            pythonMethodName = wsMethodName.replace(/([A-Z])/g, '_$1').toLowerCase();
            if (pythonMethodName.startsWith('_')) {
              pythonMethodName = pythonMethodName.substring(1);
            }
          }
        } else {
          // Fallback: extract from operation ID
          wsMethodName = operationId.replace('send', '');
          pythonMethodName = wsMethodName.toLowerCase();
          
          // Convert camelCase to snake_case
          pythonMethodName = pythonMethodName.replace(/([A-Z])/g, '_$1').toLowerCase();
          if (pythonMethodName.startsWith('_')) {
            pythonMethodName = pythonMethodName.substring(1);
          }
        }
        
        // Generate method documentation
        const description = (operation.description && operation.description()) || `Send ${wsMethodName} request`;
        
        // Generate the response model class name
        const responseModelName = getResponseModelName(wsMethodName);
        
        // Generate the Python method
        const method = `
    async def ${pythonMethodName}(self, request: Optional[Any] = None, id: Optional[Union[int, str]] = None) -> ${responseModelName}:
        """
        ${description}
        
        Args:
            request: Request object (optional, depends on the method)
            id: Optional request ID (auto-generated if not provided)
            
        Returns:
            ${responseModelName}: Parsed response object
        """
        # Prepare the request object for self.request()
        request_obj = {
            'id': id if id is not None else self._generate_request_id(),
            'method': '${wsMethodName}'
        }
        
        # Add params if request is provided
        if request is not None:
            # Handle both Pydantic models and dict objects
            if hasattr(request, 'model_dump'):
                # Pydantic model - use by_alias=True to get API field names (not Python field names)
                request_data = request.model_dump(by_alias=True, exclude_none=True)
                params = {k: v for k, v in request_data.items() if k not in ['id', 'method']}
                if params:
                    request_obj['params'] = params
            elif isinstance(request, dict):
                # Dictionary - extract params excluding id and method
                params = {k: v for k, v in request.items() if k not in ['id', 'method']}
                if params:
                    request_obj['params'] = params
            else:
                # Fallback - try to convert to dict
                try:
                    params = dict(request)
                    params = {k: v for k, v in params.items() if k not in ['id', 'method']}
                    if params:
                        request_obj['params'] = params
                except:
                    pass
        
        # Send request and get raw response
        raw_response = await self.request(request_obj)
        
        # Parse raw dictionary response into typed model object
        try:
            return ${responseModelName}(**raw_response)
        except Exception as e:
            # If parsing fails, log error and re-raise with context
            logger.error(f"Failed to parse ${wsMethodName} response into ${responseModelName}: {e}")
            logger.debug(f"Raw response data: {raw_response}")
            raise WebSocketError(f"Failed to parse ${wsMethodName} response: {e}")`;
        
        methods.push(method);
      }
    });
    
    // Generate typed event handlers for API modules with events
    const eventHandlers = generateTypedEventHandlers(asyncapi);
    
    if (methods.length === 0 && !eventHandlers) {
      return generateStaticApiHandlers();
    }
    
    return `    # WebSocket API Methods (generated from AsyncAPI operations)${methods.join('')}${eventHandlers}`;
    
  } catch (e) {
    console.warn('Error generating API handlers:', e.message);
    return generateStaticApiHandlers();
  }
}


/**
 * Generate typed event handlers for API modules with events
 * Uses x-event-type extension field from AsyncAPI spec
 * @param {Object} asyncapi - AsyncAPI document
 * @returns {string} Generated event handler methods
 */
function generateTypedEventHandlers(asyncapi) {
  try {
    const eventHandlers = [];
    const eventTypes = new Map(); // Map event type to schema name
    
    // Try to access channels and their raw JSON
    try {
      const channels = asyncapi.channels();
      
      if (channels) {
        const channelKeys = Object.keys(channels);
        
        channelKeys.forEach(channelName => {
          const channel = channels[channelName];
          
          // Access the raw JSON from the channel object
          if (channel && channel._json && channel._json.messages) {
            const rawMessages = channel._json.messages;
            
            Object.keys(rawMessages).forEach(msgKey => {
              const message = rawMessages[msgKey];
              
              // Check for x-event-type in the raw message
              if (message && message['x-event-type']) {
                // Get schema name from payload
                let schemaName = null;
                
                // First check if payload has a $ref
                if (message.payload && message.payload.$ref) {
                  const refParts = message.payload.$ref.split('/');
                  schemaName = refParts[refParts.length - 1];
                } 
                // If payload has x-parser-schema-id, use that (this is how AsyncAPI parser marks resolved schemas)
                else if (message.payload && message.payload['x-parser-schema-id']) {
                  schemaName = message.payload['x-parser-schema-id'];
                  // Remove any angle brackets if present (e.g., <anonymous-schema-1> -> anonymous-schema-1)
                  schemaName = schemaName.replace(/^<|>$/g, '');
                }
                
                // Fallback: try to extract schema name from msgKey if it matches pattern
                if (!schemaName && msgKey.endsWith('Event')) {
                  // Convert msgKey to schema name (e.g., accountUpdateEvent -> AccountUpdateEvent)
                  schemaName = msgKey.charAt(0).toUpperCase() + msgKey.slice(1);
                }
                
                if (schemaName) {
                  eventTypes.set(message['x-event-type'], schemaName);
                }
              }
            });
          }
        });
      }
    } catch (e) {
      console.warn('Could not access channels _json:', e.message);
    }
    
    // Also check if the root asyncapi object has _json (for messages defined at root level)
    try {
      let rawSpec = null;
      if (asyncapi && typeof asyncapi.json === 'function') {
        rawSpec = asyncapi.json();
      } else if (asyncapi && asyncapi._json) {
        rawSpec = asyncapi._json;
      }
      
      // Check for events defined in components/messages
      if (rawSpec && rawSpec.components && rawSpec.components.messages) {
        Object.keys(rawSpec.components.messages).forEach(msgKey => {
          const message = rawSpec.components.messages[msgKey];
          if (message && message['x-event-type']) {
            // Get schema name from payload $ref
            let schemaName = null;
            if (message.payload && message.payload.$ref) {
              const refParts = message.payload.$ref.split('/');
              schemaName = refParts[refParts.length - 1];
            }
            if (schemaName) {
              eventTypes.set(message['x-event-type'], schemaName);
            }
          }
        });
      }
    } catch (e) {
      // Continue without root spec
    }
    
    // If we got event types from raw spec, generate handlers
    if (eventTypes.size > 0) {
      for (const [eventType, schemaName] of eventTypes) {
        // Convert event type to Python method name with _event suffix
        let methodName = '';
        if (eventType.includes('_')) {
          // SNAKE_CASE: ACCOUNT_UPDATE -> handle_account_update_event
          methodName = `handle_${eventType.toLowerCase()}_event`;
        } else if (eventType[0] === eventType[0].toLowerCase()) {
          // camelCase: listenKeyExpired -> handle_listen_key_expired_event
          methodName = `handle_${eventType.replace(/([A-Z])/g, '_$1').toLowerCase()}_event`;
        } else {
          // PascalCase: AccountUpdate -> handle_account_update_event
          methodName = `handle_${eventType.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')}_event`;
        }
        
        eventHandlers.push(`
    def ${methodName}(self, handler: Callable[['models.${schemaName}'], Awaitable[None]]) -> None:
        """
        Register typed handler for ${eventType} events
        
        Args:
            handler: Async function that receives a ${schemaName} object
            
        Example:
            async def on_${eventType.toLowerCase().replace(/-/g, '_')}(event: models.${schemaName}):
                print(f"Received ${eventType}: {event}")
            
            client.${methodName}(on_${eventType.toLowerCase().replace(/-/g, '_')})
        """
        self._typed_handlers['${eventType}'] = handler`);
      }
      
      return `
    
    # Typed Event Handlers (generated from AsyncAPI spec)` + eventHandlers.join('');
    }
    
    // Fall back to the original approach using the AsyncAPI object model
    // Get all channels
    const channels = asyncapi.channels();
    if (!channels) {
      return '';
    }
    
    // Iterate through channels to find messages with x-event-type
    let channelObj = {};
    if (typeof channels === 'function') {
      channelObj = channels();
    } else if (typeof channels.all === 'function') {
      const allChannels = channels.all();
      allChannels.forEach(ch => {
        const name = ch.id ? ch.id() : ch.name();
        channelObj[name] = ch;
      });
    } else {
      channelObj = channels;
    }
    
    // Also check components/messages for events with x-event-type
    // This handles cases where events are defined in components but not directly in channels
    try {
      const components = asyncapi.components();
      if (components && components.messages) {
        const messagesObj = typeof components.messages === 'function' ? components.messages() : components.messages;
        
        Object.keys(messagesObj).forEach(msgKey => {
          const message = messagesObj[msgKey];
          
          // Check for x-event-type extension
          let eventType = null;
          
          // Try multiple ways to access x-event-type
          // 1. Direct property access (most common)
          if (message && message['x-event-type']) {
            eventType = message['x-event-type'];
          }
          // 2. Through extensions() function
          else if (message && typeof message.extensions === 'function') {
            const extensions = message.extensions();
            eventType = extensions && extensions['x-event-type'];
          }
          // 3. Through extensions property
          else if (message && message.extensions) {
            eventType = message.extensions['x-event-type'];
          }
          // 4. Check the raw JSON if available
          else if (message && typeof message.json === 'function') {
            const jsonMsg = message.json();
            eventType = jsonMsg && jsonMsg['x-event-type'];
          }
          
          if (eventType) {
            // Get schema name from payload reference
            let schemaName = null;
            
            if (message.payload) {
              const payload = typeof message.payload === 'function' ? message.payload() : message.payload;
              
              if (payload && payload.$ref) {
                const refParts = payload.$ref.split('/');
                schemaName = refParts[refParts.length - 1];
              } else if (payload && payload.json && typeof payload.json === 'function') {
                const jsonPayload = payload.json();
                if (jsonPayload && jsonPayload.$ref) {
                  const refParts = jsonPayload.$ref.split('/');
                  schemaName = refParts[refParts.length - 1];
                }
              }
            }
            
            if (schemaName && !eventTypes.has(eventType)) {
              eventTypes.set(eventType, schemaName);
            }
          }
        });
      }
    } catch (e) {
      // Continue if components access fails
    }
    
    // Process each channel
    Object.keys(channelObj).forEach(channelName => {
      const channel = channelObj[channelName];
      
      // Get messages from channel
      let messages = {};
      if (channel && typeof channel.messages === 'function') {
        messages = channel.messages();
      } else if (channel && channel.messages) {
        messages = channel.messages;
      }
      
      // Process each message
      Object.keys(messages).forEach(msgKey => {
        const message = messages[msgKey];
        
        // Handle both direct message objects and references
        // In main spec files, messages might be references ($ref)
        let actualMessage = message;
        
        // If it's a reference, we need to handle it differently
        if (message && message.$ref) {
          // This is a reference to components/messages
          // The AsyncAPI parser should have already resolved it
          // But we might need to look it up in components
          try {
            const components = asyncapi.components();
            if (components && components.messages) {
              const messagesObj = typeof components.messages === 'function' ? components.messages() : components.messages;
              // Extract message name from $ref like '#/components/messages/balanceUpdateEvent'
              const msgName = message.$ref.split('/').pop();
              if (messagesObj[msgName]) {
                actualMessage = messagesObj[msgName];
              }
            }
          } catch (e) {
            // If we can't resolve the reference, continue with original
          }
        }
        
        // Check for x-event-type extension
        let eventType = null;
        
        // Try multiple ways to access x-event-type
        // 1. Direct property access (most common in AsyncAPI 3.0)
        if (actualMessage && actualMessage['x-event-type']) {
          eventType = actualMessage['x-event-type'];
        }
        // 2. Through extensions() function
        else if (actualMessage && typeof actualMessage.extensions === 'function') {
          const extensions = actualMessage.extensions();
          eventType = extensions && extensions['x-event-type'];
        }
        // 3. Through extensions property
        else if (actualMessage && actualMessage.extensions) {
          eventType = actualMessage.extensions['x-event-type'];
        }
        // 4. Check the raw JSON if available
        else if (actualMessage && typeof actualMessage.json === 'function') {
          const jsonMsg = actualMessage.json();
          eventType = jsonMsg && jsonMsg['x-event-type'];
        }
        
        if (eventType) {
          // Get schema name from payload reference
          let schemaName = null;
          
          if (actualMessage.payload) {
            const payload = typeof actualMessage.payload === 'function' ? actualMessage.payload() : actualMessage.payload;
            
            // Check for $ref
            if (payload && payload.$ref) {
              // Extract schema name from reference like '#/components/schemas/AccountUpdateEvent'
              const refParts = payload.$ref.split('/');
              schemaName = refParts[refParts.length - 1];
            } else if (payload && payload.json && typeof payload.json === 'function') {
              const jsonPayload = payload.json();
              if (jsonPayload && jsonPayload.$ref) {
                const refParts = jsonPayload.$ref.split('/');
                schemaName = refParts[refParts.length - 1];
              }
            }
          }
          
          if (schemaName && !eventTypes.has(eventType)) {
            eventTypes.set(eventType, schemaName);
          }
        }
      });
    });
    
    // Generate handler methods for each event type
    for (const [eventType, schemaName] of eventTypes) {
      // Convert event type to Python method name with _event suffix
      // ACCOUNT_UPDATE -> handle_account_update_event
      // listenKeyExpired -> handle_listen_key_expired_event
      // outboundAccountPosition -> handle_outbound_account_position_event
      let methodName = '';
      
      // Check if it's SNAKE_CASE or camelCase
      if (eventType.includes('_')) {
        // SNAKE_CASE: ACCOUNT_UPDATE -> handle_account_update_event
        methodName = `handle_${eventType.toLowerCase()}_event`;
      } else if (eventType[0] === eventType[0].toLowerCase()) {
        // camelCase: listenKeyExpired -> handle_listen_key_expired_event
        methodName = `handle_${eventType.replace(/([A-Z])/g, '_$1').toLowerCase()}_event`;
      } else {
        // PascalCase (shouldn't happen, but handle it)
        methodName = `handle_${eventType.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')}_event`;
      }
      
      eventHandlers.push(`
    def ${methodName}(self, handler: Callable[['models.${schemaName}'], Awaitable[None]]) -> None:
        """
        Register typed handler for ${eventType} events
        
        Args:
            handler: Async function that receives a ${schemaName} object
            
        Example:
            async def on_${eventType.toLowerCase().replace(/-/g, '_')}(event: models.${schemaName}):
                print(f"Received ${eventType}: {event}")
            
            client.${methodName}(on_${eventType.toLowerCase().replace(/-/g, '_')})
        """
        self._typed_handlers['${eventType}'] = handler`);
    }
    
    if (eventHandlers.length > 0) {
      return `
    
    # Typed Event Handlers (generated from AsyncAPI spec)` + eventHandlers.join('');
    }
    
    return '';
  } catch (e) {
    console.warn('Could not generate typed event handlers:', e.message);
    return '';
  }
}

/**
 * Generate response model class name from WebSocket method name
 * @param {string} wsMethodName - WebSocket method name (e.g., 'ping', 'exchangeInfo', 'account.commission', 'ticker.tradingDay')
 * @returns {string} Response model class name (e.g., 'PingResponse', 'ExchangeInfoResponse', 'AccountCommissionResponse', 'TickerTradingDayResponse')
 */
function getResponseModelName(wsMethodName) {
  // Handle special cases, slashes, and dot notation
  let modelName = wsMethodName;
  
  // Handle slashes specially: v2/account.balance -> V2AccountBalance
  if (modelName.includes('/')) {
    const parts = modelName.split('/');
    modelName = parts.map(part => {
      // If part contains dots, handle them separately
      if (part.includes('.')) {
        const dotParts = part.split('.');
        return dotParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      }
      // Otherwise just capitalize first letter
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('');
  }
  // Convert dot notation to PascalCase: account.commission -> AccountCommission, ticker.tradingDay -> TickerTradingDay
  else if (modelName.includes('.')) {
    const parts = modelName.split('.');
    modelName = parts.map(part => {
      // Convert each part to PascalCase (handle camelCase properly)
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('');
  }
  // Convert camelCase to PascalCase: exchangeInfo -> ExchangeInfo
  else {
    modelName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
  }
  
  // Add Response suffix
  return `${modelName}Response`;
}

/**
 * Generate API handlers as fallback when operations parsing fails
 */
function generateStaticApiHandlers() {
  return `    # WebSocket API Methods
    # Note: No operations found in AsyncAPI spec - using fallback`;
}

export default PythonGeneralWebSocketHandlers;