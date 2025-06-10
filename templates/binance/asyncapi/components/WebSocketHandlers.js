/*
 * This component generates WebSocket handler methods for channels
 * As input it requires the AsyncAPI document
 */
export function WebSocketHandlers({ asyncapi }) {
  const operations = asyncapi.operations();
  let handlers = '';

  operations.forEach((operation) => {
    if (operation.action() === 'receive') {
      handlers += generateHandler(operation);
      handlers += '\n';
    }
  });

  return handlers;
}

/*
 * Generate a handler method for an operation
 */
function generateHandler(operation) {
  const operationId = operation.id();
  const methodName = `Handle${capitalizeFirst(operationId)}`;
  const channel = operation.channels()[0];
  const channelAddress = channel.address();
  
  // Check if the channel address contains path parameters
  const hasParameters = channelAddress.includes('{') && channelAddress.includes('}');
  
  let handler = `// ${methodName} handles messages for the ${operationId} operation\n`;
  
  if (hasParameters) {
    // Extract parameter names from the path
    const parameterNames = extractParameterNames(channelAddress);
    const parameterList = parameterNames.map(name => `${name} string`).join(', ');
    
    handler += `func (c *Client) ${methodName}(${parameterList}, handler func(data []byte) error) error {\n`;
    
    // Generate path construction with parameter replacement
    let pathConstruction = `\tpath := "${channelAddress}"`;
    parameterNames.forEach(paramName => {
      pathConstruction += `\n\tpath = strings.ReplaceAll(path, "{${paramName}}", ${paramName})`;
    });
    handler += pathConstruction + '\n';
  } else {
    handler += `func (c *Client) ${methodName}(handler func(data []byte) error) error {\n`;
    handler += `\tpath := "${channelAddress}"\n`;
  }
  
  handler += `\treturn c.subscribe(path, handler)\n`;
  handler += '}\n';

  return handler;
}

/*
 * Extract parameter names from a path with parameters like /ws/{streamName}
 */
function extractParameterNames(path) {
  const parameterRegex = /\{([^}]+)\}/g;
  const parameters = [];
  let match;
  
  while ((match = parameterRegex.exec(path)) !== null) {
    parameters.push(match[1]);
  }
  
  return parameters;
}

/*
 * Capitalize first letter of a string
 */
function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
} 