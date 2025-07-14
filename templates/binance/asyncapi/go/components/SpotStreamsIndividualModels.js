/*
 * Dedicated component for generating spot-streams Go models
 * Handles market data stream events with proper field naming from descriptions
 */

export function SpotStreamsIndividualModels({ asyncapi }) {
  const messages = new Map();
  
  // Extract all messages from channels
  asyncapi.channels().forEach((channel) => {
    channel.messages().forEach((message) => {
      const messageName = message.name() || message.id();
      const messageId = message.id();
      const payload = message.payload();
      
      if (payload && payload.type() === 'object') {
        messages.set(messageId || messageName, {
          message,
          payload,
          channel: channel.address(),
          originalName: messageName,
          messageId: messageId
        });
      }
    });
  });

  // Extract schemas from components
  const componentSchemas = new Map();
  
  if (asyncapi.components()) {
    const json = asyncapi.json();
    if (json && json.components && json.components.schemas) {
      Object.entries(json.components.schemas).forEach(([schemaName, schemaData]) => {
        componentSchemas.set(schemaName, schemaData);
      });
    }
  }

  // Generate model files
  const modelFiles = [];
  
  // First, collect all schema names to prioritize them over message models
  const schemaModelNames = new Set();
  componentSchemas.forEach((schemaData, schemaName) => {
    schemaModelNames.add(toSnakeCase(schemaName));
  });

  // Generate message models (but skip if we have a corresponding schema model)
  messages.forEach((messageData, messageName) => {
    const messageFileName = toSnakeCase(messageName);
    
    // Check if we have a corresponding schema model that should take priority
    const hasCorrespondingSchema = Array.from(schemaModelNames).some(schemaFileName => {
      // Check for exact match
      if (schemaFileName === messageFileName) {
        return true;
      }
      
      // Check for Event suffix patterns (e.g., "liquidation" message vs "liquidation_event" schema)
      const baseMessageName = messageFileName.replace(/_/g, '');
      const baseSchemaName = schemaFileName.replace(/_event$/, '').replace(/_/g, '');
      if (baseMessageName === baseSchemaName && schemaFileName.endsWith('_event')) {
        return true;
      }
      
      // Check for Error/Response patterns (e.g., "error_message" message vs "error_response" schema)
      if (messageFileName.includes('error') && schemaFileName.includes('error')) {
        return true;
      }
      
      return false;
    });
    
    if (hasCorrespondingSchema) {
      // Skip message model since schema model takes priority
      return;
    }
    
    const modelContent = generateSpotStreamsModelFile(messageName, messageData.payload, messageData.message, componentSchemas);
    modelFiles.push({
      name: `${messageFileName}.go`,
      content: modelContent
    });
  });

  // Generate component schema models (these take priority)
  componentSchemas.forEach((schemaData, schemaName) => {
    const schemaFileName = toSnakeCase(schemaName);
    
    const modelContent = generateSpotStreamsSchemaFile(schemaName, schemaData);
    modelFiles.push({
      name: `${schemaFileName}.go`,
      content: modelContent
    });
  });

  return modelFiles;
}

/*
 * Generate a Go model file for spot-streams message
 */
function generateSpotStreamsModelFile(name, payload, message, componentSchemas) {
  const structName = toPascalCase(name);
  
  let modelCode = `package models

import (
	"encoding/json"
)

`;

  // Generate the main struct
  modelCode += generateSpotStreamsStruct(structName, payload, message);
  
  // Generate String method
  modelCode += `// String returns string representation of ${structName}
func (s ${structName}) String() string {
	b, _ := json.Marshal(s)
	return string(b)
}

`;

  // Generate constructor
  modelCode += `// New${structName} creates a new ${structName} instance
func New${structName}() *${structName} {
	return &${structName}{}
}

`;

  // Only generate event methods for event types
  if (structName.includes('Event')) {
    modelCode += generateEventMethods(structName, payload);
  }

  return modelCode;
}

/*
 * Generate a Go model file for spot-streams component schema
 */
function generateSpotStreamsSchemaFile(schemaName, schemaData) {
  const structName = toPascalCase(schemaName);
  
  let modelCode = `package models

import (
	"encoding/json"
)

`;

  // Generate the main struct
  modelCode += generateSpotStreamsStructFromSchema(structName, schemaData);
  
  // Generate String method
  modelCode += `// String returns string representation of ${structName}
func (s ${structName}) String() string {
	b, _ := json.Marshal(s)
	return string(b)
}

`;

  return modelCode;
}

/*
 * Generate Go struct for spot-streams with proper field naming
 */
function generateSpotStreamsStruct(structName, payload, message) {
  const usedStructNames = new Set();
  let nestedStructs = '';
  
  let structDef = `// ${structName} represents ${message.name() || structName}
`;
  
  if (message.description()) {
    // Format description as proper Go comments
    const description = message.description();
    if (description && typeof description === 'string') {
      const descriptionLines = description.split('\n');
      descriptionLines.forEach(line => {
        structDef += `// ${line.trim()}
`;
      });
    }
  }
  
  structDef += `type ${structName} struct {
`;

  // Get properties
  let properties;
  try {
    if (typeof payload.properties === 'function') {
      properties = payload.properties();
    } else {
      properties = payload.properties;
    }
  } catch (e) {
    console.warn('Error accessing payload properties:', e.message);
    properties = {};
  }

  // Generate fields with proper naming
  const usedFieldNames = new Set();
  
  Object.keys(properties).forEach((propName) => {
    const prop = properties[propName];
    if (!prop) return;

    // Generate meaningful field name from description, passing event type detection
    const eventType = detectEventTypeFromStructName(structName);
    const fieldName = generateSpotStreamsFieldName(propName, prop, usedFieldNames, eventType);
    usedFieldNames.add(fieldName);
    
    // Generate field documentation
    if (prop.description) {
      const description = typeof prop.description === 'function' ? prop.description() : prop.description;
      if (description && typeof description === 'string') {
        // Format description as proper Go comments, handling multi-line descriptions
        const descriptionLines = description.split('\n');
        descriptionLines.forEach(line => {
          structDef += `\t// ${line.trim()}
`;
        });
      }
    }
    
    // Generate field type
    const goType = mapSpotStreamsJsonTypeToGo(prop, propName, structName, usedStructNames);
    const jsonTag = prop.example ? `,omitempty` : `,omitempty`;
    
    structDef += `\t${fieldName} ${goType} \`json:"${propName}${jsonTag}"\`
`;
  });

  structDef += `}

`;

  // Generate nested structs
  usedStructNames.forEach(nestedStructName => {
    if (nestedStructName !== structName) {
      // Find the property that corresponds to this nested struct
      for (const [propName, prop] of Object.entries(properties)) {
        const fieldName = generateSpotStreamsFieldName(propName, prop, new Set(), '');
        const expectedStructName = `${structName}${fieldName}`;
        
        // Handle direct object properties
        if (expectedStructName === nestedStructName && prop.type === 'object' && prop.properties) {
          nestedStructs += generateNestedStruct(nestedStructName, prop.properties, `${fieldName.toLowerCase()} details`);
          break;
        }
        
        // Handle array of objects (items have properties)
        if (prop.type === 'array' && prop.items && prop.items.type === 'object' && prop.items.properties) {
          const arrayItemStructName = `${structName}${fieldName}Item`;
          if (arrayItemStructName === nestedStructName) {
            nestedStructs += generateNestedStruct(nestedStructName, prop.items.properties, `${fieldName.toLowerCase()} item details`);
            break;
          }
        }
      }
    }
  });

  return structDef + nestedStructs;
}

/*
 * Generate nested struct definition
 */
function generateNestedStruct(structName, properties, description) {
  let structDef = `// ${structName} represents the ${description}
type ${structName} struct {
`;

  const usedFieldNames = new Set();
  
  Object.keys(properties).forEach((propName) => {
    const prop = properties[propName];
    if (!prop) return;

    // Generate meaningful field name from description, passing event type detection
    const eventType = detectEventTypeFromStructName(structName);
    const fieldName = generateSpotStreamsFieldName(propName, prop, usedFieldNames, eventType);
    usedFieldNames.add(fieldName);
    
    // Generate field documentation
    if (prop.description) {
      const description = typeof prop.description === 'function' ? prop.description() : prop.description;
      if (description && typeof description === 'string') {
        // Format description as proper Go comments, handling multi-line descriptions
        const descriptionLines = description.split('\n');
        descriptionLines.forEach(line => {
          structDef += `\t// ${line.trim()}
`;
        });
      }
    }
    
    // Generate field type (no nested struct generation to avoid infinite recursion)
    const goType = mapSpotStreamsJsonTypeToGo(prop, propName, '', new Set());
    const jsonTag = prop.example ? `,omitempty` : `,omitempty`;
    
    structDef += `\t${fieldName} ${goType} \`json:"${propName}${jsonTag}"\`
`;
  });

  structDef += `}

`;
  return structDef;
}

/*
 * Generate Go struct from component schema
 */
function generateSpotStreamsStructFromSchema(structName, schemaData) {
  const usedStructNames = new Set();
  let nestedStructs = '';
  
  let structDef = `// ${structName} represents ${structName}
`;
  
  if (schemaData.description) {
    // Format description as proper Go comments
    const description = schemaData.description;
    if (description && typeof description === 'string') {
      const descriptionLines = description.split('\n');
      descriptionLines.forEach(line => {
        structDef += `// ${line.trim()}
`;
      });
    }
  }
  
  structDef += `type ${structName} struct {
`;

  // Generate fields with proper naming
  const usedFieldNames = new Set();
  const properties = schemaData.properties || {};
  
  Object.keys(properties).forEach((propName) => {
    const prop = properties[propName];
    if (!prop) return;

    // Generate meaningful field name from description, passing event type detection
    const eventType = detectEventTypeFromStructName(structName);
    const fieldName = generateSpotStreamsFieldName(propName, prop, usedFieldNames, eventType);
    usedFieldNames.add(fieldName);
    
    // Generate field documentation
    if (prop.description) {
      // Format description as proper Go comments, handling multi-line descriptions
      if (prop.description && typeof prop.description === 'string') {
        const descriptionLines = prop.description.split('\n');
        descriptionLines.forEach(line => {
          structDef += `\t// ${line.trim()}
`;
        });
      }
    }
    
    // Generate field type
    let goType = mapSpotStreamsJsonTypeToGo(prop, propName, structName, usedStructNames);
    const jsonTag = prop.example ? `,omitempty` : `,omitempty`;
    
    // Use pointer for optional nested objects (allows nil checking)
    // This applies to objects that aren't basic types and have omitempty
    if (prop.type === 'object' && goType !== 'interface{}' && jsonTag.includes('omitempty')) {
      if (!goType.startsWith('*')) {
        goType = `*${goType}`;
      }
    }
    
    structDef += `\t${fieldName} ${goType} \`json:"${propName}${jsonTag}"\`
`;
  });

  structDef += `}

`;

  // Generate nested structs
  usedStructNames.forEach(nestedStructName => {
    if (nestedStructName !== structName) {
      // Find the property that corresponds to this nested struct
      for (const [propName, prop] of Object.entries(properties)) {
        const fieldName = generateSpotStreamsFieldName(propName, prop, new Set(), '');
        const expectedStructName = `${structName}${fieldName}`;
        
        // Handle direct object properties
        if (expectedStructName === nestedStructName && prop.type === 'object' && prop.properties) {
          nestedStructs += generateNestedStruct(nestedStructName, prop.properties, `${fieldName.toLowerCase()} details`);
          break;
        }
        
        // Handle array of objects (items have properties)
        if (prop.type === 'array' && prop.items && prop.items.type === 'object' && prop.items.properties) {
          const arrayItemStructName = `${structName}${fieldName}Item`;
          if (arrayItemStructName === nestedStructName) {
            nestedStructs += generateNestedStruct(nestedStructName, prop.items.properties, `${fieldName.toLowerCase()} item details`);
            break;
          }
        }
      }
    }
  });

  return structDef + nestedStructs;
}

/*
 * Detect event type from struct name
 */
function detectEventTypeFromStructName(structName) {
  if (!structName) return '';
  
  const nameLower = structName.toLowerCase();
  
  if (nameLower.includes('bookticker')) {
    return 'bookTicker';
  } else if (nameLower.includes('ticker') && (nameLower.includes('24hr') || nameLower.includes('rolling'))) {
    return 'ticker';
  } else if (nameLower.includes('miniticker')) {
    return 'miniTicker';
  } else if (nameLower.includes('markprice')) {
    return 'markPrice';
  } else if (nameLower.includes('aggtrade') || nameLower.includes('aggregatetrade')) {
    return 'aggTrade';
  } else if (nameLower.includes('trade')) {
    return 'trade';
  } else if (nameLower.includes('kline')) {
    return 'kline';
  } else if (nameLower.includes('depth')) {
    return 'depthUpdate';
  }
  
  return '';
}

/*
 * Get event-specific field mappings based on event type
 */
function getEventSpecificFieldMapping(propName, eventType, property) {
  // Common fields that are the same across all events
  const commonFields = {
    'e': 'EventType',
    'E': 'EventTime', 
    's': 'Symbol',
    'stream': 'StreamName',
    'data': 'StreamData'
  };
  
  // Event-specific field mappings
  const eventSpecificMappings = {
    // Book Ticker Event
    'bookTicker': {
      'u': 'UpdateId',
      'b': 'BestBidPrice',
      'B': 'BestBidQuantity',
      'a': 'BestAskPrice',
      'A': 'BestAskQuantity'
    },
    
    // Ticker Event (24hr statistics)
    'ticker': {
      'P': 'PriceChangePercent',
      'p': 'PriceChange',
      'w': 'WeightedAveragePrice',
      'c': 'LastPrice',
      'Q': 'LastQuantity',
      'o': 'OpenPrice',
      'h': 'HighPrice',
      'l': 'LowPrice',
      'v': 'TotalTradedBaseAssetVolume',
      'q': 'TotalTradedQuoteAssetVolume',
      'O': 'OpenTime',
      'C': 'CloseTime',
      'F': 'FirstTradeId',
      'L': 'LastTradeId',
      'n': 'TotalNumberOfTrades'
    },
    
    // Mark Price Event
    'markPrice': {
      'p': 'MarkPrice',
      'P': 'EstimatedSettlePrice',
      'i': 'IndexPrice',
      'r': 'FundingRate',
      'T': 'NextFundingTime'
    },
    
    // Aggregate Trade Event
    'aggTrade': {
      'a': 'AggregateTradeId',
      'p': 'Price',
      'q': 'Quantity',
      'f': 'FirstTradeId',
      'l': 'LastTradeId',
      'T': 'TradeTime',
      't': 'TradeTime',
      'm': 'IsBuyerMaker'
    },
    
    // Trade Event
    'trade': {
      't': 'TradeId',
      'p': 'Price',
      'q': 'Quantity',
      'b': 'BuyerOrderId',
      'a': 'SellerOrderId',
      'T': 'TradeTime',
      'm': 'IsBuyerMaker'
    },
    
    // Kline Event
    'kline': {
      'k': 'Kline',
      't': 'KlineStartTime',
      'T': 'KlineCloseTime',
      'i': 'Interval',
      'f': 'FirstTradeId',
      'L': 'LastTradeId',
      'o': 'OpenPrice',
      'c': 'ClosePrice',
      'h': 'HighPrice',
      'l': 'LowPrice',
      'v': 'BaseAssetVolume',
      'n': 'NumberOfTrades',
      'x': 'IsKlineClosed',
      'q': 'QuoteAssetVolume',
      'V': 'TakerBuyBaseAssetVolume',
      'Q': 'TakerBuyQuoteAssetVolume'
    },
    
    // Depth Events (partial and diff)
    'depthUpdate': {
      'u': 'FinalUpdateId',
      'U': 'FirstUpdateId',
      'b': 'Bids',
      'a': 'Asks',
      'pu': 'PrevFinalUpdateId'
    },
    
    // Mini Ticker Event
    'miniTicker': {
      'c': 'ClosePrice',
      'o': 'OpenPrice',
      'h': 'HighPrice',
      'l': 'LowPrice',
      'v': 'TotalTradedBaseAssetVolume',
      'q': 'TotalTradedQuoteAssetVolume'
    }
  };
  
  // Check common fields first
  if (commonFields[propName]) {
    return commonFields[propName];
  }
  
  // Detect event type from property description or structure
  let detectedEventType = eventType;
  if (!detectedEventType && property && property.description) {
    const description = typeof property.description === 'function' ? property.description() : property.description;
    if (description && typeof description === 'string') {
      const descLower = description.toLowerCase();
      if (descLower.includes('book ticker') || descLower.includes('best bid') || descLower.includes('best ask')) {
        detectedEventType = 'bookTicker';
      } else if (descLower.includes('24hr') || descLower.includes('ticker') || descLower.includes('rolling window')) {
        detectedEventType = 'ticker';
      } else if (descLower.includes('mark price') || descLower.includes('funding')) {
        detectedEventType = 'markPrice';
      } else if (descLower.includes('aggregate trade')) {
        detectedEventType = 'aggTrade';
      } else if (descLower.includes('trade')) {
        detectedEventType = 'trade';
      } else if (descLower.includes('kline') || descLower.includes('candlestick')) {
        detectedEventType = 'kline';
      } else if (descLower.includes('depth') || descLower.includes('order book')) {
        detectedEventType = 'depthUpdate';
      } else if (descLower.includes('mini ticker')) {
        detectedEventType = 'miniTicker';
      }
    }
  }
  
  // Return event-specific mapping if found
  if (detectedEventType && eventSpecificMappings[detectedEventType] && eventSpecificMappings[detectedEventType][propName]) {
    return eventSpecificMappings[detectedEventType][propName];
  }
  
  return null;
}

/*
 * Generate meaningful Go field names for spot-streams using descriptions
 */
function generateSpotStreamsFieldName(propName, property, usedFieldNames, eventType = '') {
  let fieldName;
  
  // Get event-specific mappings based on the event type or structure name
  fieldName = getEventSpecificFieldMapping(propName, eventType, property);
  
  if (fieldName) {
    // Use the event-specific mapping
  } else {
    // Try to use description only if no mapping exists
    if (property && property.description) {
      const description = typeof property.description === 'function' ? property.description() : property.description;
      if (description && typeof description === 'string') {
        // Clean and convert description to field name
        fieldName = description
          .replace(/\s*\([^)]*\)\s*/g, '') // Remove (xxx) patterns
          .replace(/[^\w\s]/g, '') // Remove punctuation
          .trim()
          .split(/\s+/) // Split on whitespace
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join('');
        
        // Ensure it starts with uppercase and is valid Go identifier
        if (fieldName && /^[A-Z][a-zA-Z0-9]*$/.test(fieldName)) {
          // Handle collisions
          let finalFieldName = fieldName;
          let counter = 2;
          while (usedFieldNames.has(finalFieldName)) {
            finalFieldName = fieldName + counter.toString();
            counter++;
          }
          return finalFieldName;
        }
      }
    }
    
    // Convert property name to PascalCase as final fallback
    fieldName = toPascalCase(propName);
  }
  
  // Handle collisions
  let finalFieldName = fieldName;
  let counter = 2;
  while (usedFieldNames.has(finalFieldName)) {
    finalFieldName = fieldName + counter.toString();
    counter++;
  }
  
  return finalFieldName;
}

/*
 * Map JSON types to Go types for spot-streams
 */
function mapSpotStreamsJsonTypeToGo(property, propName, structName = '', usedStructNames = new Set()) {
  let propType;
  let propFormat;
  
  try {
    if (typeof property.type === 'function') {
      propType = property.type();
    } else {
      propType = property.type;
    }
    
    if (typeof property.format === 'function') {
      propFormat = property.format();
    } else {
      propFormat = property.format;
    }
  } catch (e) {
    console.warn(`Error accessing type/format for ${propName}:`, e.message);
    propType = 'string';
  }

  switch (propType) {
    case 'string':
      return 'string';
    case 'integer':
      if (propFormat === 'int64') {
        return 'int64';
      }
      return 'int';
    case 'number':
      return 'float64';
    case 'boolean':
      return 'bool';
    case 'array':
      // Handle array types
      let items;
      try {
        if (typeof property.items === 'function') {
          items = property.items();
        } else {
          items = property.items;
        }
      } catch (e) {
        console.warn(`Error accessing array items for ${propName}:`, e.message);
        return '[]interface{}';
      }
      
      if (items) {
        // For array items that are objects, generate proper struct name
        if (items.type === 'object' && items.properties && structName) {
          const fieldName = generateSpotStreamsFieldName(propName, property, new Set(), '');
          const arrayItemStructName = `${structName}${fieldName}Item`;
          usedStructNames.add(arrayItemStructName);
          return `[]${arrayItemStructName}`;
        } else {
          const itemType = mapSpotStreamsJsonTypeToGo(items, `${propName}Item`, structName, usedStructNames);
          return `[]${itemType}`;
        }
      }
      return '[]interface{}';
    case 'object':
      // Check if this object has properties (nested struct)
      const hasProperties = property.properties && ((typeof property.properties === 'object' && Object.keys(property.properties).length > 0) || (typeof property.properties === 'function'));
      
      if (hasProperties && structName) {
        // Generate nested struct name using {structName}{fieldName} convention
        const fieldName = generateSpotStreamsFieldName(propName, property, new Set());
        const nestedStructName = `${structName}${fieldName}`;
        
        // Track that we're creating a nested struct
        usedStructNames.add(nestedStructName);
        
        return nestedStructName;
      }
      
      return 'interface{}';
    default:
      return 'interface{}';
  }
}

/*
 * Convert string to snake_case for file names
 */
function toSnakeCase(str) {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/*
 * Generate event methods for event types
 */
function generateEventMethods(structName, payload) {
  let methods = '';
  
  // Try to get properties to check if EventType and EventTime fields exist
  let properties;
  try {
    if (typeof payload.properties === 'function') {
      properties = payload.properties();
    } else {
      properties = payload.properties;
    }
  } catch (e) {
    properties = {};
  }

  // Only generate methods if the struct actually has the event fields
  const hasEventType = Object.keys(properties).some(prop => 
    prop === 'e' || (properties[prop] && properties[prop].description && 
    properties[prop].description.toLowerCase().includes('event type')));
    
  const hasEventTime = Object.keys(properties).some(prop => 
    prop === 'E' || (properties[prop] && properties[prop].description && 
    properties[prop].description.toLowerCase().includes('event time')));

  if (hasEventType) {
    methods += `// GetEventType returns the event type for ${structName}
func (s ${structName}) GetEventType() string {
	return s.EventType
}

`;
  }

  if (hasEventTime) {
    methods += `// GetEventTime returns the event timestamp for ${structName}
func (s ${structName}) GetEventTime() int64 {
	return s.EventTime
}

`;
  }

  return methods;
}

/*
 * Convert string to PascalCase
 */
function toPascalCase(str) {
  if (!str) return '';
  
  // Handle camelCase/PascalCase strings and convert them properly
  // First, split on common separators and camelCase boundaries
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase: "camelCase" -> "camel Case"
    .split(/[._\-\s]+/) // Split on separators
    .map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}