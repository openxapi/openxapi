/*
 * This component generates WebSocket handler methods for channels
 * As input it requires the AsyncAPI document
 * Now uses typed structs from models package for type safety
 */
export function WebSocketHandlers({ asyncapi }) {
  const operations = asyncapi.operations();
  let handlers = '';

  operations.forEach((operation) => {
    if (operation.action() === 'send') {
      handlers += generateTypedRequestMethod(operation);
      handlers += '\n';
    }
  });

  // Generate helper methods for oneOf response handling
  handlers += generateOneOfHelperMethods(asyncapi);
  
  // Generate UserDataStream convenience methods
  handlers += generateUserDataStreamConvenienceMethods();

  return handlers;
}

/*
 * Generate a typed request method for an operation that sends messages
 */
function generateTypedRequestMethod(operation) {
  const operationId = operation.id();
  // Clean the method name - remove 'send_' prefix if present
  const cleanedOperationId = operationId.replace(/^send_?/, '');
  const methodName = capitalizeFirst(toPascalCase(cleanedOperationId));
  const channel = operation.channels()[0];
  const channelAddress = channel.address();
  
  const sendMessage = channel.messages().get('sendMessage');
  const receiveMessage = channel.messages().get('receiveMessage');
  
  if (!sendMessage || !sendMessage.payload()) {
    return `// Error: No sendMessage found for ${operationId}\n`;
  }
  
  // Generate struct names based on the actual model naming convention
  // The actual models use pattern like: AccountCommissionAccountCommissionRatesRequest
  const requestStructName = getModelStructName(channelAddress, sendMessage.title() || 'Request');
  const responseStructName = receiveMessage ? getModelStructName(channelAddress, receiveMessage.title() || 'Response') : 'interface{}';
  
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
 * Generate model struct name based on channel address and message title
 */
function getModelStructName(channelAddress, messageTitle) {
  // Convert channel address like "account.commission" to "AccountCommission"
  const channelPart = channelAddress.split('.').map(part => capitalizeFirst(part)).join('');
  
  // Clean and format the message title
  // Remove common patterns and clean up the title
  const cleanTitle = messageTitle
    .replace(/\s*\([^)]*\)\s*/g, '') // Remove parentheses and content
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Convert to PascalCase
  const titlePart = cleanTitle
    .split(/\s+/)
    .map(word => capitalizeFirst(word.toLowerCase()))
    .join('');
  
  // Ensure proper capitalization for Request/Response suffixes
  let finalName = `${channelPart}${titlePart}`;
  
  // Fix common patterns - ensure Request and Response are properly capitalized
  finalName = finalName.replace(/request$/i, 'Request');
  finalName = finalName.replace(/response$/i, 'Response');
  
  return finalName;
}

/*
 * Generate basic typed method that takes request struct
 */
function generateBasicTypedMethod(methodName, channelAddress, requestStructName, responseStructName, sendMessage) {
  // Extract authentication type from the send message name
  const authType = extractAuthTypeFromMessage(sendMessage);
  
  let method = `// Send${methodName} sends a ${channelAddress} request using typed request/response structs\n`;
  method += `// Authentication required: ${authType}\n`;
  method += `// If request.Id is empty, a new request ID will be generated automatically\n`;
  method += `func (c *Client) Send${methodName}(ctx context.Context, request *models.${requestStructName}, responseHandler func(*models.${responseStructName}, error) error) error {\n`;
  method += `\t// Use existing request ID or generate a new one\n`;
  method += `\tvar reqID string\n`;
  method += `\tif request.Id != "" {\n`;
  method += `\t\treqID = request.Id\n`;
  method += `\t} else {\n`;
  method += `\t\treqID = c.generateRequestID()\n`;
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
  
  method += `\t// Register typed response handler\n`;
  method += `\tc.registerResponseHandler(reqID, func(data []byte) error {\n`;
  method += `\t\tvar response models.${responseStructName}\n`;
  method += `\t\tif err := json.Unmarshal(data, &response); err != nil {\n`;
  method += `\t\t\treturn responseHandler(nil, fmt.Errorf("failed to unmarshal response: %w", err))\n`;
  method += `\t\t}\n`;
  method += `\t\treturn responseHandler(&response, nil)\n`;
  method += `\t})\n\n`;
  
  method += `\t// Send request\n`;
  method += `\treturn c.sendRequest(requestMap)\n`;
  method += `}\n\n`;
  
  return method;
}

/*
 * Extract authentication type from send message name
 */
function extractAuthTypeFromMessage(sendMessage) {
  if (!sendMessage || !sendMessage.name()) {
    return 'NONE';
  }
  
  const messageName = sendMessage.name();
  
  // Extract content from parentheses
  if (messageName.includes('(USER_DATA)')) {
    return 'USER_DATA';
  }
  if (messageName.includes('(TRADE)')) {
    return 'TRADE';
  }
  if (messageName.includes('(USER_STREAM)')) {
    return 'USER_STREAM';
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
    case 'NONE':
    default:
      return 'AuthTypeNone';
  }
}

/*
 * Generate convenience method with default parameters
 */
function generateConvenienceMethod(operation, methodName, channelAddress, requestStructName, responseStructName, sendMessage) {
  let method = `// Send${methodName}Default sends a ${channelAddress} request with default parameters\n`;
  method += `func (c *Client) Send${methodName}Default(ctx context.Context, responseHandler func(*models.${responseStructName}, error) error) error {\n`;
  
  // Build request struct with default ID and Method
  method += `\trequest := &models.${requestStructName}{\n`;
  method += `\t\tId:     c.generateRequestID(),\n`;
  method += `\t\tMethod: "${channelAddress}",\n`;
  method += `\t}\n\n`;
  
  method += `\treturn c.Send${methodName}(ctx, request, responseHandler)\n`;
  method += `}\n\n`;
  
  return method;
}

/*
 * Generate oneOf handler method for responses with oneOf types
 */
function generateOneOfHandlerMethod(methodName, channelAddress, requestStructName, sendMessage) {
  // Extract authentication type from the send message name
  const authType = extractAuthTypeFromMessage(sendMessage);
  let method = `// Send${methodName}WithOneOfHandler sends a ${channelAddress} request with automatic oneOf response parsing\n`;
  method += `// Authentication required: ${authType}\n`;
  method += `// If request.Id is empty, a new request ID will be generated automatically\n`;
  method += `func (c *Client) Send${methodName}WithOneOfHandler(ctx context.Context, request *models.${requestStructName}, oneOfHandler func(result interface{}, responseType string, err error) error) error {\n`;
  method += `\t// Use existing request ID or generate a new one\n`;
  method += `\tvar reqID string\n`;
  method += `\tif request.Id != "" {\n`;
  method += `\t\treqID = request.Id\n`;
  method += `\t} else {\n`;
  method += `\t\treqID = c.generateRequestID()\n`;
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
  
  method += `\t// Register oneOf response handler\n`;
  method += `\tc.registerResponseHandler(reqID, func(data []byte) error {\n`;
  method += `\t\t// Parse the oneOf response\n`;
  method += `\t\tresult, responseType, err := ParseOneOfMessage(data)\n`;
  method += `\t\treturn oneOfHandler(result, responseType, err)\n`;
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
  const properties = payload.properties;
  
  return properties && properties.result && properties.result.oneOf && Array.isArray(properties.result.oneOf);
}

/*
 * Generate helper methods for oneOf response handling
 */
function generateOneOfHelperMethods(asyncapi) {
  let methods = `// HandleUserDataStreamResponse is a helper to handle user data stream responses with oneOf types
func (c *Client) HandleUserDataStreamResponse(data []byte, handlers map[string]func(interface{}) error) error {
	result, responseType, err := ParseOneOfMessage(data)
	if err != nil {
		return err
	}

	if handler, exists := handlers[responseType]; exists {
		return handler(result)
	}

	return nil // No specific handler, but not an error
}

// SetupDefaultUserDataStreamHandlers sets up default handlers for all user data stream event types
func (c *Client) SetupDefaultUserDataStreamHandlers() {
	// Register global handlers for each event type
	c.RegisterGlobalHandler("OutboundAccountPositionEvent", func(data interface{}) error {
		log.Printf("Received OutboundAccountPositionEvent: %+v", data)
		return nil
	})

	c.RegisterGlobalHandler("BalanceUpdateEvent", func(data interface{}) error {
		log.Printf("Received BalanceUpdateEvent: %+v", data)
		return nil
	})

	c.RegisterGlobalHandler("ExecutionReportEvent", func(data interface{}) error {
		log.Printf("Received ExecutionReportEvent: %+v", data)
		return nil
	})

	c.RegisterGlobalHandler("ListStatusEvent", func(data interface{}) error {
		log.Printf("Received ListStatusEvent: %+v", data)
		return nil
	})

	c.RegisterGlobalHandler("ListenKeyExpiredEvent", func(data interface{}) error {
		log.Printf("Received ListenKeyExpiredEvent: %+v", data)
		return nil
	})

	c.RegisterGlobalHandler("ExternalLockUpdateEvent", func(data interface{}) error {
		log.Printf("Received ExternalLockUpdateEvent: %+v", data)
		return nil
	})

	c.RegisterGlobalHandler("EventStreamTerminatedEvent", func(data interface{}) error {
		log.Printf("Received EventStreamTerminatedEvent: %+v", data)
		return nil
	})
}

`;

  return methods;
}

/*
 * Generate UserDataStream convenience methods
 */
function generateUserDataStreamConvenienceMethods() {
  return `// UserDataStreamSubscribe is a convenience method for userDataStream.subscribe with typed response
func (c *Client) UserDataStreamSubscribe(ctx context.Context, request *models.UserDataStreamSubscribeSubscribeToUserDataStreamRequest, responseHandler func(*models.UserDataStreamSubscribeSubscribeToUserDataStreamResponse, error) error) error {
	return c.SendUserDataStreamSubscribe(ctx, request, responseHandler)
}

// UserDataStreamUnsubscribe is a convenience method for userDataStream.unsubscribe with typed response
func (c *Client) UserDataStreamUnsubscribe(ctx context.Context, request *models.UserDataStreamUnsubscribeUnsubscribeFromUserDataStreamRequest, responseHandler func(*models.UserDataStreamUnsubscribeUnsubscribeFromUserDataStreamResponse, error) error) error {
	return c.SendUserDataStreamUnsubscribe(ctx, request, responseHandler)
}

`;
}

/*
 * Get Go type from JSON schema type
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
    case 'array':
      return '[]interface{}';
    case 'object':
      return 'interface{}';
    default:
      return 'interface{}';
  }
}

/*
 * Convert string to PascalCase
 */
function toPascalCase(str) {
  return str
    .replace(/[-_\s.]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
    .replace(/^(.)/, (_, char) => char.toUpperCase());
}

/*
 * Capitalize first letter
 */
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
} 