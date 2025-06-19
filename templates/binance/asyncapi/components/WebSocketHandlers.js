/*
 * This component generates WebSocket handler methods for channels
 * As input it requires the AsyncAPI document
 * Now supports oneOf response types and async response handling
 */
export function WebSocketHandlers({ asyncapi }) {
  const operations = asyncapi.operations();
  let handlers = '';

  operations.forEach((operation) => {
    if (operation.action() === 'send') {
      handlers += generateRequestMethod(operation);
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
 * Generate a request method for an operation that sends messages
 */
function generateRequestMethod(operation) {
  const operationId = operation.id();
  const methodName = capitalizeFirst(operationId);
  const channel = operation.channels()[0];
  const channelAddress = channel.address();
  
  // Get the sendMessage to understand the request structure
  const sendMessage = channel.messages().get('sendMessage');
  if (!sendMessage || !sendMessage.payload()) {
    return `// Error: No sendMessage found for ${operationId}\n`;
  }
  
  const payload = sendMessage.payload();
  const properties = payload.properties;
  
  // Extract parameters from the params object if it exists
  let paramsList = [];
  let paramsStructFields = [];
  let requiredParams = [];
  
  if (properties && properties.params) {
    const paramsProperties = properties.params.properties;
    if (paramsProperties) {
      Object.keys(paramsProperties).forEach(paramName => {
        const paramProp = paramsProperties[paramName];
        const goType = getGoType(paramProp.type);
        paramsList.push(`${paramName} ${goType}`);
        paramsStructFields.push(`\t\t${capitalizeFirst(paramName)} ${goType} \`json:"${paramName}"\``);
      });
      
      // Get required parameters
      if (properties.params.required && Array.isArray(properties.params.required)) {
        requiredParams = properties.params.required;
      }
    }
  }
  
  let handler = `// ${methodName} sends a ${channelAddress} request with enhanced response handling\n`;
  handler += `func (c *Client) ${methodName}(`;
  
  // Add parameters to function signature
  if (paramsList.length > 0) {
    handler += paramsList.join(', ') + ', ';
  }
  
  handler += `responseHandler func(data []byte) error) error {\n`;
  
  // Generate request ID
  handler += `\treqID := c.generateRequestID()\n`;
  
  // Build request structure
  handler += `\trequest := map[string]interface{}{\n`;
  handler += `\t\t"id":     reqID,\n`;
  handler += `\t\t"method": "${channelAddress}",\n`;
  
      if (paramsList.length > 0) {
      handler += `\t\t"params": map[string]interface{}{\n`;
      Object.keys(properties.params.properties).forEach(paramName => {
        handler += `\t\t\t"${paramName}": ${paramName},\n`;
      });
      handler += `\t\t},\n`;
    }
  
  handler += `\t}\n\n`;
  
  // Register response handler
  handler += `\t// Register response handler\n`;
  handler += `\tc.registerResponseHandler(reqID, responseHandler)\n\n`;
  
  // Send request
  handler += `\t// Send request\n`;
  handler += `\treturn c.sendRequest(request)\n`;
  handler += '}\n\n';

  // Generate a convenience method that handles oneOf responses automatically
  handler += generateOneOfConvenienceMethod(operation, methodName, channelAddress, paramsList);

  return handler;
}

/*
 * Generate convenience method that automatically handles oneOf responses
 */
function generateOneOfConvenienceMethod(operation, methodName, channelAddress, paramsList) {
  const channel = operation.channels()[0];
  const receiveMessage = channel.messages().get('receiveMessage');
  
  if (!receiveMessage || !receiveMessage.payload()) {
    return '';
  }

  const payload = receiveMessage.payload();
  const properties = payload.properties;
  
  // Check if result has oneOf
  const hasOneOf = properties && properties.result && properties.result.oneOf && Array.isArray(properties.result.oneOf);
  
  if (!hasOneOf) {
    return '';
  }

  let method = `// ${methodName}WithOneOfHandler sends a ${channelAddress} request with automatic oneOf response parsing\n`;
  method += `func (c *Client) ${methodName}WithOneOfHandler(`;
  
  if (paramsList.length > 0) {
    method += paramsList.join(', ') + ', ';
  }
  
  method += `oneOfHandler func(result interface{}, responseType string) error) error {\n`;
  method += `\treturn c.${methodName}(`;
  
  if (paramsList.length > 0) {
    // Extract parameter names for the call
    const paramNames = paramsList.map(param => param.split(' ')[0]);
    method += paramNames.join(', ') + ', ';
  }
  
  method += `func(data []byte) error {\n`;
  method += `\t\t// Parse the oneOf response\n`;
  method += `\t\tresult, responseType, err := ParseOneOfMessage(data)\n`;
  method += `\t\tif err != nil {\n`;
  method += `\t\t\treturn err\n`;
  method += `\t\t}\n`;
  method += `\t\treturn oneOfHandler(result, responseType)\n`;
  method += `\t})\n`;
  method += '}\n\n';

  return method;
}

/*
 * Generate helper methods for oneOf response handling
 */
function generateOneOfHelperMethods(asyncapi) {
  let helpers = '';
  
  helpers += `// HandleUserDataStreamResponse is a helper to handle user data stream responses with oneOf types\n`;
  helpers += `func (c *Client) HandleUserDataStreamResponse(data []byte, handlers map[string]func(interface{}) error) error {\n`;
  helpers += `\tresult, responseType, err := ParseOneOfMessage(data)\n`;
  helpers += `\tif err != nil {\n`;
  helpers += `\t\treturn err\n`;
  helpers += `\t}\n\n`;
  helpers += `\tif handler, exists := handlers[responseType]; exists {\n`;
  helpers += `\t\treturn handler(result)\n`;
  helpers += `\t}\n\n`;
  helpers += `\treturn nil // No specific handler, but not an error\n`;
  helpers += `}\n\n`;

  helpers += `// SetupDefaultUserDataStreamHandlers sets up default handlers for all user data stream event types\n`;
  helpers += `func (c *Client) SetupDefaultUserDataStreamHandlers() {\n`;
  helpers += `\t// Register global handlers for each event type\n`;
  helpers += `\tc.RegisterGlobalHandler("OutboundAccountPositionEvent", func(data interface{}) error {\n`;
  helpers += `\t\tlog.Printf("Received OutboundAccountPositionEvent: %+v", data)\n`;
  helpers += `\t\treturn nil\n`;
  helpers += `\t})\n\n`;
  
  helpers += `\tc.RegisterGlobalHandler("BalanceUpdateEvent", func(data interface{}) error {\n`;
  helpers += `\t\tlog.Printf("Received BalanceUpdateEvent: %+v", data)\n`;
  helpers += `\t\treturn nil\n`;
  helpers += `\t})\n\n`;
  
  helpers += `\tc.RegisterGlobalHandler("ExecutionReportEvent", func(data interface{}) error {\n`;
  helpers += `\t\tlog.Printf("Received ExecutionReportEvent: %+v", data)\n`;
  helpers += `\t\treturn nil\n`;
  helpers += `\t})\n\n`;
  
  helpers += `\tc.RegisterGlobalHandler("ListStatusEvent", func(data interface{}) error {\n`;
  helpers += `\t\tlog.Printf("Received ListStatusEvent: %+v", data)\n`;
  helpers += `\t\treturn nil\n`;
  helpers += `\t})\n\n`;
  
  helpers += `\tc.RegisterGlobalHandler("ListenKeyExpiredEvent", func(data interface{}) error {\n`;
  helpers += `\t\tlog.Printf("Received ListenKeyExpiredEvent: %+v", data)\n`;
  helpers += `\t\treturn nil\n`;
  helpers += `\t})\n\n`;
  
  helpers += `\tc.RegisterGlobalHandler("ExternalLockUpdateEvent", func(data interface{}) error {\n`;
  helpers += `\t\tlog.Printf("Received ExternalLockUpdateEvent: %+v", data)\n`;
  helpers += `\t\treturn nil\n`;
  helpers += `\t})\n\n`;
  
  helpers += `\tc.RegisterGlobalHandler("EventStreamTerminatedEvent", func(data interface{}) error {\n`;
  helpers += `\t\tlog.Printf("Received EventStreamTerminatedEvent: %+v", data)\n`;
  helpers += `\t\treturn nil\n`;
  helpers += `\t})\n`;
  helpers += `}\n\n`;

  return helpers;
}

/*
 * Generate UserDataStream specific convenience methods
 */
function generateUserDataStreamConvenienceMethods() {
  let methods = '';
  
  // UserDataStreamSubscribe method
  methods += `// UserDataStreamSubscribe is a convenience method for userDataStream.subscribe\n`;
  methods += `func (c *Client) UserDataStreamSubscribe(responseHandler func(data []byte) error) error {\n`;
  methods += `\treturn c.SendUserdatastreamSubscribe(responseHandler)\n`;
  methods += `}\n\n`;
  
  // UserDataStreamSubscribeWithOneOfHandler method
  methods += `// UserDataStreamSubscribeWithOneOfHandler subscribes to user data stream with automatic oneOf parsing\n`;
  methods += `func (c *Client) UserDataStreamSubscribeWithOneOfHandler(oneOfHandler func(result interface{}, responseType string) error) error {\n`;
  methods += `\treturn c.SendUserdatastreamSubscribe(func(data []byte) error {\n`;
  methods += `\t\t// Parse the oneOf response\n`;
  methods += `\t\tresult, responseType, err := ParseOneOfMessage(data)\n`;
  methods += `\t\tif err != nil {\n`;
  methods += `\t\t\treturn err\n`;
  methods += `\t\t}\n`;
  methods += `\t\treturn oneOfHandler(result, responseType)\n`;
  methods += `\t})\n`;
  methods += `}\n\n`;
  
  // UserDataStreamUnsubscribe method
  methods += `// UserDataStreamUnsubscribe is a convenience method for userDataStream.unsubscribe\n`;
  methods += `func (c *Client) UserDataStreamUnsubscribe(responseHandler func(data []byte) error) error {\n`;
  methods += `\treturn c.SendUserdatastreamUnsubscribe(responseHandler)\n`;
  methods += `}\n\n`;
  
  return methods;
}

/*
 * Convert AsyncAPI type to Go type
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
      return 'map[string]interface{}';
    default:
      return 'interface{}';
  }
}

/*
 * Convert string to CamelCase, handling underscores and dots
 * Examples: user_data_stream -> UserDataStream, account.commission -> AccountCommission
 * Remove parentheses and content inside them: method(param) -> Method
 */
function capitalizeFirst(str) {
  if (!str) return '';
  
  // Remove parentheses and their content
  const cleanStr = str.replace(/\([^)]*\)/g, '');
  
  // Split by underscore and dots, then capitalize each word
  return cleanStr
    .split(/[._]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
} 