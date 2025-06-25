/*
 * This component generates WebSocket handler methods for channels
 * As input it requires the AsyncAPI document
 * Now supports AsyncAPI 3.0 with event messages and improved authentication handling
 */
export function WebSocketHandlers({ asyncapi }) {
  const operations = asyncapi.operations();
  let handlers = '';

  // Generate handlers for send operations (request methods)
  operations.forEach((operation) => {
    if (operation.action() === 'send') {
      handlers += generateTypedRequestMethod(operation);
      handlers += '\n';
    }
  });

  // Generate event handlers for receive operations (event handling)
  handlers += generateEventHandlers(asyncapi);

  // Generate helper methods for oneOf response handling
  handlers += generateOneOfHelperMethods(asyncapi);
  
  // Generate UserDataStream convenience methods
  handlers += generateUserDataStreamConvenienceMethods();

  return handlers;
}

/*
 * Generate event handlers for AsyncAPI 3.0 event messages
 */
function generateEventHandlers(asyncapi) {
  let eventHandlers = '';
  
  // Get all channels and look for event messages
  asyncapi.channels().forEach((channel) => {
    channel.messages().forEach((message) => {
      const messageName = message.name() || message.id();
      const messageId = message.id();
      
      // Check if this is an event message
      const isEventMessage = messageName.includes('Event') || 
                           messageId && (messageId.includes('balanceUpdate') || 
                                       messageId.includes('executionReport') || 
                                       messageId.includes('listStatus') ||
                                       messageId.includes('listenKeyExpired') ||
                                       messageId.includes('outboundAccountPosition') ||
                                       messageId.includes('externalLockUpdate'));
      
      if (isEventMessage) {
        eventHandlers += generateEventHandler(message, channel);
        eventHandlers += '\n';
      }
    });
  });
  
  return eventHandlers;
}

/*
 * Generate event handler for a specific event message
 */
function generateEventHandler(message, channel) {
  const messageName = message.name() || message.id();
  const messageId = message.id();
  const eventName = capitalizeFirst(messageId || messageName);
  const structName = getModelStructName('', eventName);
  
  let handler = '';
  
  handler += `// Handle${eventName} registers a handler for ${messageName} events\n`;
  handler += `// This method allows you to handle real-time ${messageName} events from the WebSocket stream\n`;
  handler += `func (c *Client) Handle${eventName}(handler func(*models.${structName}) error) {\n`;
  handler += `\tc.eventHandler.RegisterHandler("${messageId || messageName}", func(data interface{}) error {\n`;
  handler += `\t\t// Parse the event data - handle both nested and direct event structures\n`;
  handler += `\t\tvar event models.${structName}\n`;
  handler += `\t\t\n`;
  handler += `\t\tif jsonData, ok := data.([]byte); ok {\n`;
  handler += `\t\t\t// Direct JSON data parsing\n`;
  handler += `\t\t\tif err := json.Unmarshal(jsonData, &event); err != nil {\n`;
  handler += `\t\t\t\treturn fmt.Errorf("failed to parse ${messageName} event: %w", err)\n`;
  handler += `\t\t\t}\n`;
  handler += `\t\t} else if mapData, ok := data.(map[string]interface{}); ok {\n`;
  handler += `\t\t\t// Map data - check if this is the nested event object or the full message\n`;
  handler += `\t\t\tvar eventDataToUnmarshal interface{}\n`;
  handler += `\t\t\t\n`;
  handler += `\t\t\t// Check if this map contains an "event" field (nested structure)\n`;
  handler += `\t\t\tif _, hasEvent := mapData["event"]; hasEvent {\n`;
  handler += `\t\t\t\t// This is a full message with nested event object\n`;
  handler += `\t\t\t\t// Use the entire message structure for parsing\n`;
  handler += `\t\t\t\teventDataToUnmarshal = mapData\n`;
  handler += `\t\t\t} else {\n`;
  handler += `\t\t\t\t// This might be the event data itself\n`;
  handler += `\t\t\t\teventDataToUnmarshal = mapData\n`;
  handler += `\t\t\t}\n`;
  handler += `\t\t\t\n`;
  handler += `\t\t\t// Convert to JSON and back to struct\n`;
  handler += `\t\t\tjsonBytes, err := json.Marshal(eventDataToUnmarshal)\n`;
  handler += `\t\t\tif err != nil {\n`;
  handler += `\t\t\t\treturn fmt.Errorf("failed to marshal ${messageName} event data: %w", err)\n`;
  handler += `\t\t\t}\n`;
  handler += `\t\t\tif err := json.Unmarshal(jsonBytes, &event); err != nil {\n`;
  handler += `\t\t\t\treturn fmt.Errorf("failed to parse ${messageName} event: %w", err)\n`;
  handler += `\t\t\t}\n`;
  handler += `\t\t} else {\n`;
  handler += `\t\t\treturn fmt.Errorf("unexpected data type for ${messageName} event: %T", data)\n`;
  handler += `\t\t}\n`;
  handler += `\t\t\n`;
  handler += `\t\t// Call the user-provided handler\n`;
  handler += `\t\treturn handler(&event)\n`;
  handler += `\t})\n`;
  handler += `}\n\n`;
  
  return handler;
}

/*
 * Generate a typed request method for an operation that sends messages
 */
function generateTypedRequestMethod(operation) {
  const operationId = operation.id();
  // Clean the method name - remove 'send' prefix if present
  const cleanedOperationId = operationId.replace(/^send/, '');
  const methodName = capitalizeFirst(toPascalCase(cleanedOperationId));
  const channel = operation.channels()[0];
  const channelAddress = channel.address();
  
  // Get the messages for this operation
  const messages = operation.messages();
  let sendMessage = null;
  let receiveMessage = null;
  
  // Find send and receive messages
  messages.forEach((message) => {
    const messageName = message.name() || message.id();
    const messageId = message.id();
    
    if (messageId.includes('Send') || messageName.includes('Request')) {
      sendMessage = message;
    } else if (messageId.includes('Receive') || messageName.includes('Response')) {
      receiveMessage = message;
    }
  });
  
  if (!sendMessage || !sendMessage.payload()) {
    return `// Error: No sendMessage found for ${operationId}\n`;
  }
  
  // Generate struct names based on the actual model naming convention
  const requestStructName = getModelStructName('', sendMessage.id() || sendMessage.name());
  const responseStructName = receiveMessage ? getModelStructName('', receiveMessage.id() || receiveMessage.name()) : null;
  
  let handler = '';
  
  // Generate basic method that takes request struct and returns response struct
  handler += generateBasicTypedMethod(methodName, channelAddress, requestStructName, responseStructName, sendMessage);
  
  // Generate convenience method with individual parameters
  handler += generateConvenienceMethod(operation, methodName, channelAddress, requestStructName, responseStructName, sendMessage);
  
  // Generate oneOf handler method if response has oneOf
  if (receiveMessage && hasOneOfInResponse(receiveMessage)) {
    handler += generateOneOfHandlerMethod(methodName, channelAddress, requestStructName, sendMessage);
  }

  return handler;
}

/*
 * Generate model struct name based on message name or ID
 */
function getModelStructName(channelAddress, messageName) {
  // Clean and format the message name but KEEP Send/Receive suffixes
  let cleanName = messageName
    // Remove authentication/description parts in parentheses
    .replace(/\([^)]*\)/g, '')
    // Remove any remaining special characters except dots (for nested names)
    .replace(/[^a-zA-Z0-9.]/g, '');
  
  // Ensure the name starts with a letter (Go requirement)
  if (cleanName && /^[0-9]/.test(cleanName)) {
    cleanName = 'T' + cleanName; // Prefix with 'T' for type
  }
  
  // Convert to PascalCase - this will match how IndividualModels generates the struct names
  return toPascalCase(cleanName);
}

/*
 * Generate basic typed method that takes request struct
 */
function generateBasicTypedMethod(methodName, channelAddress, requestStructName, responseStructName, sendMessage) {
  // Extract authentication type from the send message
  const authType = extractAuthTypeFromMessage(sendMessage);
  
  let method = `// Send${methodName} sends a ${channelAddress} request using typed request/response structs\n`;
  method += `// Authentication required: ${authType}\n`;
  method += `// If request.Id is empty, a new request ID will be generated automatically\n`;
  // Handle response type - use interface{} if no specific response type
  const responseType = responseStructName ? `*models.${responseStructName}` : `interface{}`;
  method += `func (c *Client) Send${methodName}(ctx context.Context, request *models.${requestStructName}, responseHandler func(${responseType}, error) error) error {\n`;
  method += `\t// Use existing request ID or generate a new one\n`;
  method += `\tvar reqID string\n`;
  method += `\tif request.Id != "" {\n`;
  method += `\t\treqID = request.Id\n`;
  method += `\t} else {\n`;
  method += `\t\treqID = GenerateRequestID()\n`;
  method += `\t\trequest.Id = reqID\n`;
  method += `\t}\n`;
  method += `\trequest.Method = "${channelAddress}"\n\n`;
  
  method += `\t// Convert struct to map for WebSocket sending\n`;
  method += `\trequestMap, err := structToMap(request)\n`;
  method += `\tif err != nil {\n`;
  method += `\t\treturn fmt.Errorf("failed to convert request to map: %w", err)\n`;
  method += `\t}\n\n`;
  
  // Add authentication logic using context
  if (authType !== 'NONE') {
    method += `\t// Get authentication from context or fall back to client auth\n`;
    method += `\tvar auth *Auth\n`;
    method += `\tif contextAuth, ok := ctx.Value(ContextBinanceAuth).(Auth); ok {\n`;
    method += `\t\tauth = &contextAuth\n`;
    method += `\t} else if c.auth != nil {\n`;
    method += `\t\tauth = c.auth\n`;
    method += `\t} else {\n`;
    method += `\t\treturn fmt.Errorf("authentication required for ${authType} request but no auth provided in context or client")\n`;
    method += `\t}\n\n`;
    
    method += `\t// Create signer and sign the request parameters\n`;
    method += `\tsigner := NewRequestSigner(auth)\n`;
    method += `\tif params, ok := requestMap["params"].(map[string]interface{}); ok {\n`;
    method += `\t\tif err := signer.SignRequest(params, ${transformAuthTypeToGoConstant(authType)}); err != nil {\n`;
    method += `\t\t\treturn fmt.Errorf("failed to sign request: %w", err)\n`;
    method += `\t\t}\n`;
    method += `\t\trequestMap["params"] = params\n`;
    method += `\t} else {\n`;
    method += `\t\t// Create params if it doesn't exist\n`;
    method += `\t\tparams := make(map[string]interface{})\n`;
    method += `\t\tif err := signer.SignRequest(params, ${transformAuthTypeToGoConstant(authType)}); err != nil {\n`;
    method += `\t\t\treturn fmt.Errorf("failed to sign request: %w", err)\n`;
    method += `\t\t}\n`;
    method += `\t\trequestMap["params"] = params\n`;
    method += `\t}\n\n`;
  }
  
  method += `\t// Register typed response handler with automatic JSON parsing\n`;
  if (responseStructName) {
    // Use typed handler for specific response types
    const genericType = `models.${responseStructName}`;
    method += `\tRegisterTypedResponseHandler[${genericType}](c, reqID, responseHandler)\n\n`;
  } else {
    // Use untyped handler for interface{} responses
    method += `\tc.responseHandlers.Store(reqID, ResponseHandler{\n`;
    method += `\t\tRequestID: reqID,\n`;
    method += `\t\tHandler: func(data []byte, err error) error {\n`;
    method += `\t\t\tif err != nil {\n`;
    method += `\t\t\t\treturn responseHandler(nil, err)\n`;
    method += `\t\t\t}\n`;
    method += `\t\t\t\n`;
    method += `\t\t\t// Parse as generic interface{} \n`;
    method += `\t\t\tvar response interface{}\n`;
    method += `\t\t\tif err := json.Unmarshal(data, &response); err != nil {\n`;
    method += `\t\t\t\treturn responseHandler(nil, fmt.Errorf("failed to parse response: %w", err))\n`;
    method += `\t\t\t}\n`;
    method += `\t\t\t\n`;
    method += `\t\t\treturn responseHandler(response, nil)\n`;
    method += `\t\t},\n`;
    method += `\t})\n\n`;
  }
  
  method += `\t// Send request\n`;
  method += `\treturn c.sendRequest(requestMap)\n`;
  method += `}\n\n`;
  
  return method;
}

/*
 * Extract authentication type from send message
 */
function extractAuthTypeFromMessage(sendMessage) {
  if (!sendMessage || !sendMessage.name()) {
    return 'NONE';
  }
  
  const messageName = sendMessage.name();
  const description = sendMessage.description ? sendMessage.description() : '';
  
  // Check message name and description for auth type indicators
  if (messageName.includes('(USER_DATA)') || description.includes('USER_DATA')) {
    return 'USER_DATA';
  }
  if (messageName.includes('(TRADE)') || description.includes('TRADE')) {
    return 'TRADE';
  }
  if (messageName.includes('(USER_STREAM)') || description.includes('USER_STREAM')) {
    return 'USER_STREAM';
  }
  if (messageName.includes('(MARKET_DATA)') || description.includes('MARKET_DATA')) {
    return 'MARKET_DATA';
  }
  
  // Check for specific method patterns that typically require authentication
  const messageId = sendMessage.id();
  if (messageId) {
    if (messageId.includes('account') || messageId.includes('order') || messageId.includes('trade')) {
      return 'USER_DATA';
    }
    if (messageId.includes('userDataStream')) {
      return 'USER_STREAM';
    }
  }
  
  return 'NONE';
}

/*
 * Transform auth type to Go constant name
 */
function transformAuthTypeToGoConstant(authType) {
  switch (authType) {
    case 'USER_DATA':
      return 'AuthTypeUserData';
    case 'TRADE':
      return 'AuthTypeTrade';
    case 'USER_STREAM':
      return 'AuthTypeUserStream';
    case 'MARKET_DATA':
      return 'AuthTypeMarketData';
    case 'NONE':
    default:
      return 'AuthTypeNone';
  }
}

/*
 * Generate convenience method with individual parameters
 */
function generateConvenienceMethod(operation, methodName, channelAddress, requestStructName, responseStructName, sendMessage) {
  // For now, skip convenience methods to keep the generated code simpler
  // They can be added later if needed
  return '';
}

/*
 * Generate oneOf handler method for responses with oneOf types
 */
function generateOneOfHandlerMethod(methodName, channelAddress, requestStructName, sendMessage) {
  const authType = extractAuthTypeFromMessage(sendMessage);
  
  let method = `// Send${methodName}WithOneOfHandler sends a ${channelAddress} request with oneOf response handling\n`;
  method += `// Authentication required: ${authType}\n`;
  method += `// The handler will receive the response as interface{} for custom type handling\n`;
  method += `func (c *Client) Send${methodName}WithOneOfHandler(ctx context.Context, request *models.${requestStructName}, responseHandler func(interface{}, error) error) error {\n`;
  method += `\t// Use existing request ID or generate a new one\n`;
  method += `\tvar reqID string\n`;
  method += `\tif request.Id != "" {\n`;
  method += `\t\treqID = request.Id\n`;
  method += `\t} else {\n`;
  method += `\t\treqID = GenerateRequestID()\n`;
  method += `\t\trequest.Id = reqID\n`;
  method += `\t}\n`;
  method += `\trequest.Method = "${channelAddress}"\n\n`;
  
  method += `\t// Convert struct to map for WebSocket sending\n`;
  method += `\trequestMap, err := structToMap(request)\n`;
  method += `\tif err != nil {\n`;
  method += `\t\treturn fmt.Errorf("failed to convert request to map: %w", err)\n`;
  method += `\t}\n\n`;
  
  // Add authentication logic if needed
  if (authType !== 'NONE') {
    method += `\t// Get authentication from context or fall back to client auth\n`;
    method += `\tvar auth *Auth\n`;
    method += `\tif contextAuth, ok := ctx.Value(ContextBinanceAuth).(Auth); ok {\n`;
    method += `\t\tauth = &contextAuth\n`;
    method += `\t} else if c.auth != nil {\n`;
    method += `\t\tauth = c.auth\n`;
    method += `\t} else {\n`;
    method += `\t\treturn fmt.Errorf("authentication required for ${authType} request but no auth provided in context or client")\n`;
    method += `\t}\n\n`;
    
    method += `\t// Create signer and sign the request parameters\n`;
    method += `\tsigner := NewRequestSigner(auth)\n`;
    method += `\tif params, ok := requestMap["params"].(map[string]interface{}); ok {\n`;
    method += `\t\tif err := signer.SignRequest(params, ${transformAuthTypeToGoConstant(authType)}); err != nil {\n`;
    method += `\t\t\treturn fmt.Errorf("failed to sign request: %w", err)\n`;
    method += `\t\t}\n`;
    method += `\t\trequestMap["params"] = params\n`;
    method += `\t} else {\n`;
    method += `\t\t// Create params if it doesn't exist\n`;
    method += `\t\tparams := make(map[string]interface{})\n`;
    method += `\t\tif err := signer.SignRequest(params, ${transformAuthTypeToGoConstant(authType)}); err != nil {\n`;
    method += `\t\t\treturn fmt.Errorf("failed to sign request: %w", err)\n`;
    method += `\t\t}\n`;
    method += `\t\trequestMap["params"] = params\n`;
    method += `\t}\n\n`;
  }
  
  method += `\t// Register generic response handler for oneOf handling\n`;
  method += `\tc.responseHandlers.Store(reqID, ResponseHandler{\n`;
  method += `\t\tRequestID: reqID,\n`;
  method += `\t\tHandler: func(data []byte, err error) error {\n`;
  method += `\t\t\tif err != nil {\n`;
  method += `\t\t\t\treturn responseHandler(nil, err)\n`;
  method += `\t\t\t}\n`;
  method += `\t\t\t\n`;
  method += `\t\t\t// Parse as generic interface{} for oneOf handling\n`;
  method += `\t\t\tvar response interface{}\n`;
  method += `\t\t\tif err := json.Unmarshal(data, &response); err != nil {\n`;
  method += `\t\t\t\treturn responseHandler(nil, fmt.Errorf("failed to parse response: %w", err))\n`;
  method += `\t\t\t}\n`;
  method += `\t\t\t\n`;
  method += `\t\t\treturn responseHandler(response, nil)\n`;
  method += `\t\t},\n`;
  method += `\t})\n\n`;
  
  method += `\t// Send request\n`;
  method += `\treturn c.sendRequest(requestMap)\n`;
  method += `}\n\n`;
  
  return method;
}

/*
 * Check if response message has oneOf types
 */
function hasOneOfInResponse(receiveMessage) {
  if (!receiveMessage || !receiveMessage.payload()) {
    return false;
  }
  
  const payload = receiveMessage.payload();
  const properties = payload.properties ? payload.properties() : null;
  
  if (properties && properties.result) {
    const resultProperty = properties.result;
    return resultProperty.oneOf && Array.isArray(resultProperty.oneOf);
  }
  
  return false;
}

/*
 * Generate helper methods for oneOf response handling
 */
function generateOneOfHelperMethods(asyncapi) {
  let helpers = '';
  
  helpers += `// RegisterTypedResponseHandler registers a typed response handler for a request ID\n`;
  helpers += `func RegisterTypedResponseHandler[T any](c *Client, requestID string, handler func(*T, error) error) {\n`;
  helpers += `\tc.responseHandlers.Store(requestID, ResponseHandler{\n`;
  helpers += `\t\tRequestID: requestID,\n`;
  helpers += `\t\tHandler: func(data []byte, err error) error {\n`;
  helpers += `\t\t\tif err != nil {\n`;
  helpers += `\t\t\t\treturn handler(nil, err)\n`;
  helpers += `\t\t\t}\n`;
  helpers += `\t\t\t\n`;
  helpers += `\t\t\t// Parse the response into the specified type\n`;
  helpers += `\t\t\tvar response T\n`;
  helpers += `\t\t\tif err := json.Unmarshal(data, &response); err != nil {\n`;
  helpers += `\t\t\t\treturn handler(nil, fmt.Errorf("failed to parse response: %w", err))\n`;
  helpers += `\t\t\t}\n`;
  helpers += `\t\t\t\n`;
  helpers += `\t\t\treturn handler(&response, nil)\n`;
  helpers += `\t\t},\n`;
  helpers += `\t})\n`;
  helpers += `}\n\n`;
  
  helpers += `// structToMap converts a struct to a map[string]interface{}\n`;
  helpers += `func structToMap(v interface{}) (map[string]interface{}, error) {\n`;
  helpers += `\tdata, err := json.Marshal(v)\n`;
  helpers += `\tif err != nil {\n`;
  helpers += `\t\treturn nil, err\n`;
  helpers += `\t}\n`;
  helpers += `\t\n`;
  helpers += `\tvar result map[string]interface{}\n`;
  helpers += `\tif err := json.Unmarshal(data, &result); err != nil {\n`;
  helpers += `\t\treturn nil, err\n`;
  helpers += `\t}\n`;
  helpers += `\t\n`;
  helpers += `\treturn result, nil\n`;
  helpers += `}\n\n`;
  
  return helpers;
}

/*
 * Generate UserDataStream convenience methods
 */
function generateUserDataStreamConvenienceMethods() {
  let methods = '';
  
  methods += `// SubscribeToUserDataStream subscribes to user data stream events\n`;
  methods += `// This is a convenience method that handles listen key management automatically\n`;
  methods += `func (c *Client) SubscribeToUserDataStream(ctx context.Context, listenKey string) error {\n`;
  methods += `\trequest := &models.UserDataStreamSubscribeSend{\n`;
  methods += `\t\tId:     GenerateRequestID(),\n`;
  methods += `\t\tMethod: "userDataStream.subscribe",\n`;
  methods += `\t}\n`;
  methods += `\t\n`;
  methods += `\t// Convert struct to map for WebSocket sending\n`;
  methods += `\trequestMap, err := structToMap(request)\n`;
  methods += `\tif err != nil {\n`;
  methods += `\t\treturn fmt.Errorf("failed to convert request to map: %w", err)\n`;
  methods += `\t}\n`;
  methods += `\t\n`;
  methods += `\t// Add listen key to params\n`;
  methods += `\tif requestMap["params"] == nil {\n`;
  methods += `\t\trequestMap["params"] = make(map[string]interface{})\n`;
  methods += `\t}\n`;
  methods += `\tif params, ok := requestMap["params"].(map[string]interface{}); ok {\n`;
  methods += `\t\tparams["listenKey"] = listenKey\n`;
  methods += `\t}\n`;
  methods += `\t\n`;
  methods += `\treturn c.sendRequest(requestMap)\n`;
  methods += `}\n\n`;
  
  methods += `// UnsubscribeFromUserDataStream unsubscribes from user data stream events\n`;
  methods += `func (c *Client) UnsubscribeFromUserDataStream(ctx context.Context) error {\n`;
  methods += `\trequest := &models.UserDataStreamUnsubscribeSend{\n`;
  methods += `\t\tId:     GenerateRequestID(),\n`;
  methods += `\t\tMethod: "userDataStream.unsubscribe",\n`;
  methods += `\t}\n`;
  methods += `\t\n`;
  methods += `\t// Convert struct to map for WebSocket sending\n`;
  methods += `\trequestMap, err := structToMap(request)\n`;
  methods += `\tif err != nil {\n`;
  methods += `\t\treturn fmt.Errorf("failed to convert request to map: %w", err)\n`;
  methods += `\t}\n`;
  methods += `\t\n`;
  methods += `\treturn c.sendRequest(requestMap)\n`;
  methods += `}\n\n`;
  
  return methods;
}

/*
 * Get Go type based on property type
 */
function getGoType(type) {
  switch (type) {
    case 'string':
      return 'string';
    case 'integer':
      return 'int64';
    case 'number':
      return 'float64';
    case 'boolean':
      return 'bool';
    case 'object':
      return 'interface{}';
    case 'array':
      return '[]interface{}';
    default:
      return 'interface{}';
  }
}

/*
 * Convert string to PascalCase
 */
function toPascalCase(str) {
  if (!str) return '';
  
  // Handle special cases with dots, underscores, and camelCase
  return str
    .split(/[._-]/)
    .map(word => {
      if (!word) return '';
      // Handle camelCase words by splitting on uppercase letters
      return word.replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(' ')
        .map(subWord => subWord.charAt(0).toUpperCase() + subWord.slice(1).toLowerCase())
        .join('');
    })
    .join('')
    .replace(/\s+/g, ''); // Remove any remaining spaces
}

/*
 * Capitalize first letter
 */
function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
} 