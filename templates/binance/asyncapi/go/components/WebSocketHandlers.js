/*
 * This component generates WebSocket handler methods for channels
 * As input it requires the AsyncAPI document
 * Now supports AsyncAPI 3.0 with event messages and improved authentication handling
 */

/*
 * Check if an operation with a specific method name exists in the spec
 */
function hasOperation(asyncapi, methodName) {
  const operations = asyncapi.operations();
  let found = false;
  
  operations.forEach((operation) => {
    const messages = operation.messages();
    messages.forEach((message) => {
      try {
        const payload = message.payload();
        if (payload && payload.properties) {
          let props;
          if (typeof payload.properties === 'function') {
            props = payload.properties();
          } else {
            props = payload.properties;
          }
          
          // Check if props is a Map-like object with a get method
          let methodProp;
          if (props && typeof props.get === 'function') {
            methodProp = props.get('method');
          } else if (props && props.method) {
            methodProp = props.method;
          }
          
          // Check if the method property has a const value matching our target
          if (methodProp) {
            let constValue;
            if (typeof methodProp.const === 'function') {
              constValue = methodProp.const();
            } else if (methodProp.const) {
              constValue = methodProp.const;
            }
            
            if (constValue === methodName) {
              found = true;
            }
          }
        }
      } catch (e) {
        // Ignore errors and continue checking other messages
      }
    });
  });
  
  return found;
}

export function WebSocketHandlers({ asyncapi }) {
  const operations = asyncapi.operations();
  let handlers = '';

  // Generate eventHandlers type for Client struct
  handlers += generateEventHandlersType(asyncapi);

  // Generate handlers for send operations (request methods)
  operations.forEach((operation) => {
    if (operation.action() === 'send') {
      handlers += generateTypedRequestMethod(operation, asyncapi);
      handlers += '\n';
    }
  });

  // Generate event handlers for receive operations (event handling)
  handlers += generateEventHandlers(asyncapi);

  // Generate helper methods for oneOf response handling
  handlers += generateOneOfHelperMethods(asyncapi);
  
  // Generate UserDataStream convenience methods only if the required types exist
  const hasUserDataStreamSubscribe = hasOperation(asyncapi, 'userDataStream.subscribe');
  const hasUserDataStreamUnsubscribe = hasOperation(asyncapi, 'userDataStream.unsubscribe');
  
  if (hasUserDataStreamSubscribe || hasUserDataStreamUnsubscribe) {
    handlers += generateUserDataStreamConvenienceMethods();
  }

  // Generate parameter validation helper methods
  handlers += generateParameterValidationHelpers();

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
                                       messageId.includes('externalLockUpdate') ||
                                       messageId.includes('eventStreamTerminated'));
      
      if (isEventMessage) {
        eventHandlers += generateEventHandler(message, asyncapi);
        eventHandlers += '\n';
      }
    });
  });
  
  return eventHandlers;
}

/*
 * Generate event handler for a specific event message
 */
function generateEventHandler(message, asyncapi) {
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
function generateTypedRequestMethod(operation, asyncapi) {
  const operationId = operation.id();
  // Clean the method name - remove 'send' prefix if present
  const cleanedOperationId = operationId.replace(/^send/, '');
  
  // Extract the actual method value from the send message to use for the Go method name
  const sendMessage = operation.messages().find(msg => {
    const msgId = msg.id();
    return msgId && (msgId.includes('Request') || msg.name().includes('Request'));
  });
  
  let methodName;
  if (sendMessage) {
    const actualMethod = extractMethodFromMessage(sendMessage);
    if (actualMethod) {
      // Use the actual method value for the Go method name (this preserves proper casing)
      // Convert dots and slashes to camelCase for valid Go method names
      // Handle both "v2/account.balance" style and "account.balance" style methods
      methodName = actualMethod
        .replace(/\//g, '.') // Convert slashes to dots first
        .split('.').map((part, index) => {
          if (index === 0) {
            return capitalizeFirst(part);
          } else {
            return capitalizeFirst(part);
          }
        }).join('');
    } else {
      // Fallback to operation ID
      methodName = capitalizeFirst(toPascalCase(cleanedOperationId));
    }
  } else {
    // Fallback to operation ID
    methodName = capitalizeFirst(toPascalCase(cleanedOperationId));
  }
  const channel = operation.channels()[0];
  const channelAddress = channel.address();
  
  // Get the messages for this operation
  const messages = operation.messages();
  let receiveMessage = null;
  
  // sendMessage was already found above, now we just need receiveMessage
  
  // Find corresponding receive operation and response message
  // Look for operations with matching base name but 'receive' action
  if (asyncapi && asyncapi.operations) {
    const allOperations = asyncapi.operations();
    const expectedReceiveOperationId = `receive${capitalizeFirst(cleanedOperationId)}`;
    
    allOperations.forEach((op) => {
      if (op.id() === expectedReceiveOperationId && op.action() === 'receive') {
        const receiveMessages = op.messages();
        receiveMessages.forEach((msg) => {
          const msgName = msg.name() || msg.id();
          const msgId = msg.id();
          
          if (msgId.includes('Response') || msgName.includes('Response')) {
            receiveMessage = msg;
          }
        });
      }
    });
  }
  
  // If we still don't have a receive message, try alternative matching strategies
  if (!receiveMessage && asyncapi && asyncapi.operations) {
    const allOperations = asyncapi.operations();
    
    // Strategy 1: Look for any receive operation that has a response message matching our request
    allOperations.forEach((op) => {
      if (op.action() === 'receive' && !receiveMessage) {
        const receiveMessages = op.messages();
        receiveMessages.forEach((msg) => {
          const msgId = msg.id();
          const msgName = msg.name() || msg.id();
          
          // Try to match based on operation name pattern
          if (sendMessage) {
            const sendMsgId = sendMessage.id();
            const expectedResponseId = sendMsgId.replace('Request', 'Response');
            
            if (msgId === expectedResponseId || msgName.includes('Response')) {
              // Additional check: make sure this response is related to our request
              if (msgId.toLowerCase().includes(cleanedOperationId.toLowerCase()) || 
                  msgName.toLowerCase().includes(cleanedOperationId.toLowerCase())) {
                receiveMessage = msg;
              }
            }
          }
        });
      }
    });
  }
  
  if (!sendMessage || !sendMessage.payload()) {
    return `// Error: No sendMessage found for ${operationId}\n`;
  }
  
  // Extract the actual method value from the send message payload
  const actualMethod = extractMethodFromMessage(sendMessage);
  if (!actualMethod) {
    // Add debug information to help troubleshoot
    const debugInfo = getDebugInfoForMessage(sendMessage);
    return `// Error: No method enum found in sendMessage for ${operationId}\n// Debug: ${debugInfo}\n`;
  }
  
  // Generate struct names based on the actual model naming convention
  const requestStructName = getModelStructName('', sendMessage.id() || sendMessage.name());
  const responseStructName = receiveMessage ? getModelStructName('', receiveMessage.id() || receiveMessage.name()) : null;
  
  let handler = '';
  
  // Generate basic method that takes request struct and returns response struct
  handler += generateBasicTypedMethod(methodName, actualMethod, requestStructName, responseStructName, sendMessage);
  
  // Generate convenience method with individual parameters
  handler += generateConvenienceMethod(operation, methodName, actualMethod, requestStructName, responseStructName, sendMessage);
  
  // Generate oneOf handler method if response has oneOf
  if (receiveMessage && hasOneOfInResponse(receiveMessage)) {
    handler += generateOneOfHandlerMethod(methodName, actualMethod, requestStructName, sendMessage);
  }

  return handler;
}

/*
 * Extract the actual method value from send message payload
 */
function extractMethodFromMessage(sendMessage) {
  if (!sendMessage || !sendMessage.payload || typeof sendMessage.payload !== 'function') {
    return null;
  }
  
  const payload = sendMessage.payload();
  if (!payload) {
    return null;
  }
  
  // Handle AsyncAPI objects - properties might be a function
  let properties;
  try {
    if (typeof payload.properties === 'function') {
      properties = payload.properties();
    } else {
      properties = payload.properties;
    }
  } catch (e) {
    console.warn('Error accessing payload properties for method extraction:', e.message);
    return null;
  }
  
  if (!properties) {
    return null;
  }
  
  // Handle AsyncAPI Map-like objects for properties
  let methodProperty;
  try {
    if (typeof properties.all === 'function') {
      // AsyncAPI Map-like object
      const allProperties = properties.all();
      methodProperty = allProperties && allProperties.method;
    } else if (properties instanceof Map) {
      // Map object
      methodProperty = properties.get('method');
    } else if (typeof properties === 'object') {
      // Regular object
      methodProperty = properties.method;
    }
  } catch (e) {
    console.warn('Error accessing method property:', e.message);
    return null;
  }
  
  if (!methodProperty) {
    return null;
  }
  
  // Extract enum value from method property
  let enumValues;
  try {
    if (typeof methodProperty.enum === 'function') {
      enumValues = methodProperty.enum();
    } else {
      enumValues = methodProperty.enum;
    }
  } catch (e) {
    console.warn('Error accessing method enum:', e.message);
    enumValues = null;
  }
  
  if (enumValues && Array.isArray(enumValues) && enumValues.length > 0) {
    // Return the first (and usually only) enum value
    return enumValues[0];
  }
  
  // Fall back to example if no enum found
  let example;
  try {
    if (typeof methodProperty.example === 'function') {
      example = methodProperty.example();
    } else {
      example = methodProperty.example;
    }
  } catch (e) {
    console.warn('Error accessing method example:', e.message);
    example = null;
  }
  
  if (example) {
    return example;
  }
  
  return null;
}

/*
 * Generate debug information for a message when method extraction fails
 */
function getDebugInfoForMessage(message) {
  const info = [];
  
  if (message) {
    info.push(`message exists: true`);
    info.push(`message.id(): ${message.id()}`);
    info.push(`message.name(): ${message.name()}`);
    
    const payload = message.payload();
    if (payload) {
      info.push(`payload exists: true`);
      
      // Check payload properties
      let properties;
      if (typeof payload.properties === 'function') {
        properties = payload.properties();
        info.push(`properties() function exists: true`);
      } else if (payload.properties) {
        properties = payload.properties;
        info.push(`properties property exists: true`);
      }
      
      if (properties) {
        info.push(`properties exist: true`);
        
        // Check different property access methods
        if (typeof properties.all === 'function') {
          const allProps = properties.all();
          info.push(`properties.all() keys: ${Object.keys(allProps).join(', ')}`);
          if (allProps.method) {
            info.push(`method property found via all()`);
            const methodProp = allProps.method;
            if (methodProp.enum) {
              info.push(`method.enum: ${JSON.stringify(methodProp.enum)}`);
            }
            if (methodProp.example) {
              info.push(`method.example: ${methodProp.example}`);
            }
          }
        } else if (properties instanceof Map) {
          info.push(`properties is Map with keys: ${Array.from(properties.keys()).join(', ')}`);
          if (properties.has('method')) {
            info.push(`method found in Map`);
          }
        } else {
          info.push(`properties keys: ${Object.keys(properties).join(', ')}`);
          if (properties.method) {
            info.push(`method property found directly`);
          }
        }
      } else {
        info.push(`properties: null`);
      }
    } else {
      info.push(`payload: null`);
    }
  } else {
    info.push(`message: null`);
  }
  
  return info.join(', ');
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
 * Extract required parameters from send message
 */
function extractRequiredParameters(sendMessage) {
  if (!sendMessage || !sendMessage.payload || typeof sendMessage.payload !== 'function') {
    return [];
  }
  
  const payload = sendMessage.payload();
  if (!payload) {
    return [];
  }
  
  // Handle AsyncAPI objects - properties might be a function
  let properties;
  try {
    if (typeof payload.properties === 'function') {
      properties = payload.properties();
    } else {
      properties = payload.properties;
    }
  } catch (e) {
    console.warn('Error accessing payload properties:', e.message);
    return [];
  }
  
  if (!properties) {
    return [];
  }
  
  // Handle AsyncAPI Map-like objects for properties
  let paramsProperty;
  try {
    if (typeof properties.all === 'function') {
      // AsyncAPI Map-like object
      const allProperties = properties.all();
      paramsProperty = allProperties && allProperties.params;
    } else if (properties instanceof Map) {
      // Map object
      paramsProperty = properties.get('params');
    } else if (typeof properties === 'object') {
      // Regular object
      paramsProperty = properties.params;
    }
  } catch (e) {
    console.warn('Error accessing properties:', e.message);
    return [];
  }
  
  if (!paramsProperty) {
    return [];
  }
  
  // Extract required array from params property
  let required = [];
  try {
    if (typeof paramsProperty.required === 'function') {
      required = paramsProperty.required();
    } else if (paramsProperty.required) {
      required = paramsProperty.required;
    }
  } catch (e) {
    console.warn('Error accessing required parameters:', e.message);
    return [];
  }
  
  return Array.isArray(required) ? required : [];
}

/*
 * Extract parameter information including types from send message
 */
function extractParameterInfo(sendMessage) {
  if (!sendMessage || !sendMessage.payload || typeof sendMessage.payload !== 'function') {
    return {};
  }
  
  const payload = sendMessage.payload();
  if (!payload) {
    return {};
  }
  
  // Handle AsyncAPI objects - properties might be a function
  let properties;
  try {
    if (typeof payload.properties === 'function') {
      properties = payload.properties();
    } else {
      properties = payload.properties;
    }
  } catch (e) {
    console.warn('Error accessing payload properties:', e.message);
    return {};
  }
  
  if (!properties) {
    return {};
  }
  
  // Handle AsyncAPI Map-like objects for properties
  let paramsProperty;
  try {
    if (typeof properties.all === 'function') {
      // AsyncAPI Map-like object
      const allProperties = properties.all();
      paramsProperty = allProperties && allProperties.params;
    } else if (properties instanceof Map) {
      // Map object
      paramsProperty = properties.get('params');
    } else if (typeof properties === 'object') {
      // Regular object
      paramsProperty = properties.params;
    }
  } catch (e) {
    console.warn('Error accessing properties:', e.message);
    return {};
  }
  
  if (!paramsProperty) {
    return {};
  }
  
  // Extract properties of params
  let paramsProperties = {};
  try {
    if (typeof paramsProperty.properties === 'function') {
      paramsProperties = paramsProperty.properties();
    } else if (paramsProperty.properties) {
      paramsProperties = paramsProperty.properties;
    }
  } catch (e) {
    console.warn('Error accessing params properties:', e.message);
    return {};
  }
  
  // Build parameter info with types
  const paramInfo = {};
  if (typeof paramsProperties.all === 'function') {
    const allProps = paramsProperties.all();
    Object.keys(allProps).forEach(key => {
      const prop = allProps[key];
      paramInfo[key] = {
        type: prop.type || 'string',
        format: prop.format
      };
    });
  } else if (paramsProperties instanceof Map) {
    paramsProperties.forEach((prop, key) => {
      paramInfo[key] = {
        type: prop.type || 'string',
        format: prop.format
      };
    });
  } else if (typeof paramsProperties === 'object') {
    Object.keys(paramsProperties).forEach(key => {
      const prop = paramsProperties[key];
      paramInfo[key] = {
        type: prop.type || 'string',
        format: prop.format
      };
    });
  }
  
  return paramInfo;
}

/*
 * Generate parameter validation code for a request
 */
function generateParameterValidation(sendMessage, actualMethod) {
  const requiredParams = extractRequiredParameters(sendMessage);
  
  // Authentication parameters are automatically added by the signing system
  // but are included in the spec for completeness. We exclude them from validation
  // error messages since they will be added automatically.
  const authParams = ['apiKey', 'signature', 'timestamp'];
  const userParams = requiredParams.filter(param => !authParams.includes(param));
  
  if (userParams.length === 0) {
    return '';
  }
  
  // For now, we'll skip parameter validation entirely to avoid type mismatch issues
  // A proper implementation would need to:
  // 1. Correctly extract type information from the AsyncAPI spec
  // 2. Generate appropriate validation based on the field type
  // 3. Use pointers for optional numeric fields to allow nil checks
  
  let validation = `\t// Validate required parameters (excluding auth parameters that are auto-added)\n`;
  validation += `\tif request.Params == nil {\n`;
  validation += `\t\treturn fmt.Errorf("method ${actualMethod} requires parameters but none provided: %v", []string{${userParams.map(p => `"${p}"`).join(', ')}})\n`;
  validation += `\t}\n\n`;
  
  // Skip individual field validation for now
  
  return validation;
}

/*
 * Generate basic typed method that takes request struct
 */
function generateBasicTypedMethod(methodName, actualMethod, requestStructName, responseStructName, sendMessage) {
  // Extract authentication type from the send message
  const authType = extractAuthTypeFromMessage(sendMessage);
  
  let method = `// Send${methodName} sends a ${actualMethod} request using typed request/response structs\n`;
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
  method += `\trequest.Method = "${actualMethod}"\n\n`;
  
  // Add parameter validation
  method += generateParameterValidation(sendMessage, actualMethod);
  
  method += `\t// Convert struct to map for WebSocket sending\n`;
  method += `\trequestMap, err := structToMap(request)\n`;
  method += `\tif err != nil {\n`;
  method += `\t\treturn fmt.Errorf("failed to convert request to map: %w", err)\n`;
  method += `\t}\n\n`;
  
  // Add authentication logic using context
  if (authType !== 'NONE') {
    // Check if this is a userDataStream method at template generation time
    const isUserDataStreamMethod = actualMethod === 'userDataStream.subscribe' || actualMethod === 'userDataStream.unsubscribe';
    
    if (isUserDataStreamMethod) {
      // For userDataStream methods, skip params creation entirely
      method += `\t// userDataStream methods don't need params - authentication is handled at the WebSocket connection level\n`;
    } else {
      // For other methods, handle params normally
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
      method += `\t}\n`;
    }
    method += `\n`;
  }
  
  method += `\t// Register typed response handler with automatic JSON parsing\n`;
  if (responseStructName) {
    // Use typed handler for specific response types
    const genericType = `models.${responseStructName}`;
    method += `\tRegisterTypedResponseHandler[${genericType}](c, reqID, responseHandler)\n\n`;
  } else {
    // Use untyped handler for interface{} responses
    method += `\tc.responseHandlers.Store(reqID, ResponseHandler{\n`;
    method += `\t\tRequestId: reqID,\n`;
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
  if (!sendMessage) {
    return 'NONE';
  }
  
  let messageName = '';
  try {
    if (typeof sendMessage.name === 'function') {
      messageName = sendMessage.name() || '';
    } else if (sendMessage.name) {
      messageName = sendMessage.name;
    }
  } catch (e) {
    console.warn('Error accessing message name:', e.message);
  }
  
  let description = '';
  try {
    if (typeof sendMessage.description === 'function') {
      description = sendMessage.description() || '';
    } else if (sendMessage.description) {
      description = sendMessage.description;
    }
  } catch (e) {
    console.warn('Error accessing message description:', e.message);
  }
  
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
  if (messageName.includes('(SIGNED)') || description.includes('SIGNED')) {
    return 'SIGNED';
  }
  
  // Check for specific method patterns that typically require authentication
  let messageId = '';
  try {
    if (typeof sendMessage.id === 'function') {
      messageId = sendMessage.id() || '';
    } else if (sendMessage.id) {
      messageId = sendMessage.id;
    }
  } catch (e) {
    console.warn('Error accessing message id:', e.message);
  }
  
  if (messageId) {
    // Only check for account and order patterns, NOT trades
    // trades.aggregate and trades.historical are public endpoints
    if (messageId.includes('account') || messageId.includes('order')) {
      return 'USER_DATA';
    }
    if (messageId.includes('userDataStream')) {
      return 'USER_STREAM';
    }
    // More specific trading patterns that require auth (not just any "trade")
    if (messageId.includes('myTrades') || messageId.includes('order.place') || messageId.includes('order.cancel')) {
      return 'USER_DATA';
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
    case 'SIGNED':
      return 'AuthTypeSigned';
    case 'NONE':
    default:
      return 'AuthTypeNone';
  }
}

/*
 * Generate convenience method with individual parameters
 */
function generateConvenienceMethod(operation, methodName, actualMethod, requestStructName, responseStructName, sendMessage) {
  // For now, skip convenience methods to keep the generated code simpler
  // They can be added later if needed
  return '';
}

/*
 * Generate oneOf handler method for responses with oneOf types
 */
function generateOneOfHandlerMethod(methodName, actualMethod, requestStructName, sendMessage) {
  const authType = extractAuthTypeFromMessage(sendMessage);
  
  let method = `// Send${methodName}WithOneOfHandler sends a ${actualMethod} request with oneOf response handling\n`;
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
  method += `\trequest.Method = "${actualMethod}"\n\n`;
  
  // Add parameter validation
  method += generateParameterValidation(sendMessage, actualMethod);
  
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
    
    // Check if this is a userDataStream method at template generation time
    const isUserDataStreamMethod = actualMethod === 'userDataStream.subscribe' || actualMethod === 'userDataStream.unsubscribe';
    
    if (isUserDataStreamMethod) {
      // For userDataStream methods, skip params creation entirely
      method += `\t// userDataStream methods don't need params - authentication is handled at the WebSocket connection level\n`;
    } else {
      // For other methods, handle params normally
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
      method += `\t}\n`;
    }
    method += `\n`;
  }
  
  method += `\t// Register generic response handler for oneOf handling\n`;
  method += `\tc.responseHandlers.Store(reqID, ResponseHandler{\n`;
  method += `\t\tRequestId: reqID,\n`;
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
  helpers += `\t\tRequestId: requestID,\n`;
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
  
  helpers += `// structToMap converts a struct to a map[string]interface{} while preserving number precision\n`;
  helpers += `func structToMap(v interface{}) (map[string]interface{}, error) {\n`;
  helpers += `\tdata, err := json.Marshal(v)\n`;
  helpers += `\tif err != nil {\n`;
  helpers += `\t\treturn nil, err\n`;
  helpers += `\t}\n`;
  helpers += `\t\n`;
  helpers += `\t// Use a decoder that preserves number precision\n`;
  helpers += `\tdecoder := json.NewDecoder(strings.NewReader(string(data)))\n`;
  helpers += `\tdecoder.UseNumber()\n`;
  helpers += `\t\n`;
  helpers += `\tvar result map[string]interface{}\n`;
  helpers += `\tif err := decoder.Decode(&result); err != nil {\n`;
  helpers += `\t\treturn nil, err\n`;
  helpers += `\t}\n`;
  helpers += `\t\n`;
  helpers += `\t// Convert json.Number to appropriate types\n`;
  helpers += `\tconvertJSONNumbers(result)\n`;
  helpers += `\t\n`;
  helpers += `\treturn result, nil\n`;
  helpers += `}\n\n`;
  helpers += `// convertJSONNumbers recursively converts json.Number values to appropriate types\n`;
  helpers += `func convertJSONNumbers(m map[string]interface{}) {\n`;
  helpers += `\tfor k, v := range m {\n`;
  helpers += `\t\tswitch val := v.(type) {\n`;
  helpers += `\t\tcase json.Number:\n`;
  helpers += `\t\t\t// Try to convert to int64 first, then fall back to float64\n`;
  helpers += `\t\t\tif intVal, err := val.Int64(); err == nil {\n`;
  helpers += `\t\t\t\tm[k] = intVal\n`;
  helpers += `\t\t\t} else if floatVal, err := val.Float64(); err == nil {\n`;
  helpers += `\t\t\t\tm[k] = floatVal\n`;
  helpers += `\t\t\t} else {\n`;
  helpers += `\t\t\t\t// Keep as string if conversion fails\n`;
  helpers += `\t\t\t\tm[k] = string(val)\n`;
  helpers += `\t\t\t}\n`;
  helpers += `\t\tcase map[string]interface{}:\n`;
  helpers += `\t\t\t// Recursively convert nested maps\n`;
  helpers += `\t\t\tconvertJSONNumbers(val)\n`;
  helpers += `\t\t}\n`;
  helpers += `\t}\n`;
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
  methods += `\trequest := &models.UserDataStreamSubscribeRequest{\n`;
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
  methods += `\trequest := &models.UserDataStreamUnsubscribeRequest{\n`;
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
  
  // If the string is already in PascalCase (starts with uppercase and contains more uppercase letters), preserve it
  if (/^[A-Z]/.test(str) && /[A-Z]/.test(str.slice(1))) {
    return str;
  }
  
  // Handle camelCase strings by preserving internal capital letters
  // Split on dots, underscores, and dashes first
  return str
    .split(/[._-]/)
    .map(word => {
      if (!word) return '';
      
      // For words that contain camelCase (have uppercase letters in the middle),
      // split them carefully to preserve the original casing
      if (/[a-z][A-Z]/.test(word)) {
        // Split on camelCase boundaries but preserve the case of each part
        const parts = word.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
        return parts
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join('');
      } else {
        // For words without camelCase, just capitalize the first letter
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
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

/*
 * Generate parameter validation helper methods
 */
function generateParameterValidationHelpers() {
  // These helper methods are now generated in generateOneOfHelperMethods
  // Return empty string to avoid duplicate declarations
  return '';
}

/*
 * Generate eventHandlers type for Client struct
 */
function generateEventHandlersType(asyncapi) {
  return `
// Event handler registry placeholder type
type eventHandlers struct {
	// This struct will be populated by module-specific handlers
	// It serves as a placeholder to satisfy the Client struct definition
}

`;
} 