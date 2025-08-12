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
  // Generate type-safe handlers dynamically based on available schemas
  let typedHandlers = '';
  
  try {
    // Get component schemas from the AsyncAPI spec
    const components = asyncapi.components();
    if (components && components.schemas) {
      const schemas = typeof components.schemas === 'function' ? components.schemas() : components.schemas;
      const eventHandlers = [];
      
      // Handle different schema formats
      let schemaEntries = [];
      if (schemas && typeof schemas.all === 'function') {
        // AsyncAPI parser object with .all() method
        const allSchemas = schemas.all();
        schemaEntries = allSchemas.map(s => [s.id ? s.id() : s.name(), s]);
      } else if (schemas && typeof schemas.forEach === 'function') {
        // Map-like object
        schemas.forEach((schema, name) => {
          schemaEntries.push([name, schema]);
        });
      } else if (schemas && typeof schemas === 'object') {
        // Plain object
        schemaEntries = Object.entries(schemas);
      }
      
      // Look for event schemas (those with 'Event' in the name or with 'e' field)
      for (const [schemaName, schema] of schemaEntries) {
        const schemaObj = schema && schema.json ? schema.json() : schema;
        
        // Check if this looks like an event schema
        if (schemaName.endsWith('Event') || 
            (schemaObj.properties && schemaObj.properties.e) ||
            (schemaObj.properties && schemaObj.properties.event && 
             schemaObj.properties.event.properties && schemaObj.properties.event.properties.e)) {
          
          // Extract event type from schema
          let eventType = null;
          if (schemaObj.properties && schemaObj.properties.e && schemaObj.properties.e.const) {
            eventType = schemaObj.properties.e.const;
          } else if (schemaObj.properties && schemaObj.properties.event && 
                     schemaObj.properties.event.properties && 
                     schemaObj.properties.event.properties.e &&
                     schemaObj.properties.event.properties.e.const) {
            eventType = schemaObj.properties.event.properties.e.const;
          }
          
          if (eventType) {
            // Generate handler method name
            const handlerMethodName = `on_${eventType.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')}`;
            const className = schemaName;
            
            eventHandlers.push(`
    def ${handlerMethodName}(self, handler: Callable[['${className}'], Awaitable[None]]) -> None:
        """Register handler for ${eventType} events with type safety"""
        self._typed_handlers['${eventType}'] = handler`);
          }
        }
      }
      
      if (eventHandlers.length > 0) {
        typedHandlers = '\n    # Type-safe event handlers (dynamically generated from AsyncAPI spec)\n' + 
                       eventHandlers.join('\n');
      }
    }
  } catch (e) {
    console.warn('Could not generate typed handlers:', e.message);
  }
  
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
    
    if (methods.length === 0) {
      return generateStaticApiHandlers();
    }
    
    return `    # WebSocket API Methods (generated from AsyncAPI operations)${methods.join('')}`;
    
  } catch (e) {
    console.warn('Error generating API handlers:', e.message);
    return generateStaticApiHandlers();
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