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
  
  // Generate message models
  messages.forEach((messageData, messageName) => {
    const modelContent = generateSpotStreamsModelFile(messageName, messageData.payload, messageData.message, componentSchemas);
    modelFiles.push({
      name: `${toSnakeCase(messageName)}.go`,
      content: modelContent
    });
  });

  // Generate component schema models
  componentSchemas.forEach((schemaData, schemaName) => {
    const modelContent = generateSpotStreamsSchemaFile(schemaName, schemaData);
    modelFiles.push({
      name: `${toSnakeCase(schemaName)}.go`,
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

    // Generate meaningful field name from description
    const fieldName = generateSpotStreamsFieldName(propName, prop, usedFieldNames);
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
    const goType = mapSpotStreamsJsonTypeToGo(prop, propName);
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

    // Generate meaningful field name from description
    const fieldName = generateSpotStreamsFieldName(propName, prop, usedFieldNames);
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
    const goType = mapSpotStreamsJsonTypeToGo(prop, propName);
    const jsonTag = prop.example ? `,omitempty` : `,omitempty`;
    
    structDef += `\t${fieldName} ${goType} \`json:"${propName}${jsonTag}"\`
`;
  });

  structDef += `}

`;
  return structDef;
}

/*
 * Generate meaningful Go field names for spot-streams using descriptions
 */
function generateSpotStreamsFieldName(propName, property, usedFieldNames) {
  let fieldName;
  
  // Check for common field mappings first (this takes priority)
  const commonFieldMappings = {
    'e': 'EventType',
    'E': 'EventTime', 
    's': 'Symbol',
    'a': 'AggregateTradeId',
    'p': 'Price',
    'q': 'Quantity',
    'f': 'FirstTradeId',
    'l': 'LastTradeId',
    'T': 'TradeTime',
    'm': 'IsBuyerMaker',
    't': 'TradeId',
    'b': 'BuyerOrderId',
    'A': 'SellerOrderId',
    'M': 'Ignore',
    'k': 'Kline',
    'c': 'ClosePrice',
    'o': 'OpenPrice',
    'h': 'HighPrice',
    'v': 'Volume',
    'n': 'NumberOfTrades',
    'x': 'IsKlineClosed',
    'i': 'Interval',
    'L': 'LastTradeId',
    'V': 'TakerBuyBaseVolume',
    'Q': 'TakerBuyQuoteVolume',
    'u': 'UpdateId',
    'U': 'FirstUpdateId',
    'B': 'BestBidQuantity',
    'w': 'WeightedAveragePrice',
    'P': 'PriceChangePercent',
    'F': 'FirstTradeId',
    'C': 'CloseTime',
    'O': 'OpenTime',
    // Combined stream specific fields
    'stream': 'StreamName',
    'data': 'StreamData'
  };

  if (commonFieldMappings[propName]) {
    fieldName = commonFieldMappings[propName];
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
function mapSpotStreamsJsonTypeToGo(property, propName) {
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
        const itemType = mapSpotStreamsJsonTypeToGo(items, `${propName}Item`);
        return `[]${itemType}`;
      }
      return '[]interface{}';
    case 'object':
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