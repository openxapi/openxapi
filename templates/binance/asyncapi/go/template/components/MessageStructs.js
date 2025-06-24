/*
 * This component generates Go structs for message payloads
 * As input it requires the AsyncAPI document
 * Updated for AsyncAPI 3.0 with improved event and request/response handling
 */
export function MessageStructs({ asyncapi }) {
  const messages = new Map();
  let structs = '';

  // Extract all messages from channels
  asyncapi.channels().forEach((channel) => {
    channel.messages().forEach((message) => {
      const messageId = message.id();
      const messageName = message.name() || messageId;
      const payload = message.payload();
      
      if (payload && payload.type() === 'object' && messageId) {
        messages.set(messageId, {
          message,
          payload,
          channel: channel.address()
        });
      }
    });
  });

  // Extract schemas from components
  if (asyncapi.components()) {
    const json = asyncapi.json();
    if (json && json.components && json.components.schemas) {
      Object.entries(json.components.schemas).forEach(([schemaName, schemaData]) => {
        if (schemaData.type === 'object') {
          structs += generateComponentStruct(schemaName, schemaData);
          structs += '\n';
        }
      });
    }
  }

  // Generate structs for channel messages
  messages.forEach((messageData, messageId) => {
    structs += generateStruct(messageId, messageData.payload, messageData.message);
    structs += '\n';
  });

  return structs;
}

/*
 * Generate a Go struct from a component schema
 */
function generateComponentStruct(name, schema) {
  const structName = capitalizeFirst(name);
  let structDef = `// ${structName} represents the ${name} schema\n`;
  
  if (schema.description) {
    structDef += `// ${schema.description}\n`;
  }
  
  structDef += `type ${structName} struct {\n`;

  if (schema.properties) {
    Object.keys(schema.properties).forEach((propName) => {
      const prop = schema.properties[propName];
      const goType = mapComponentJsonTypeToGo(prop);
      let fieldName = capitalizeFirst(propName);
      
      const jsonTag = `\`json:"${propName}"\``;
      
      if (prop.description) {
        structDef += `\t// ${prop.description}\n`;
      }
      if (prop.example !== undefined) {
        structDef += `\t// Example: ${JSON.stringify(prop.example)}\n`;
      }
      structDef += `\t${fieldName} ${goType} ${jsonTag}\n`;
    });
  }

  structDef += '}\n';
  return structDef;
}

/*
 * Generate a Go struct from a JSON schema (for message payloads)
 */
function generateStruct(name, schema, message) {
  const structName = capitalizeFirst(name);
  let structDef = `// ${structName} represents the ${name} message payload\n`;
  
  if (message && message.description()) {
    structDef += `// ${message.description()}\n`;
  }
  
  structDef += `type ${structName} struct {\n`;

  const properties = schema.properties();
  const usedFieldNames = new Set();
  
  if (properties) {
    // Handle AsyncAPI Map-like objects
    let propertiesToIterate;
    if (typeof properties.all === 'function') {
      propertiesToIterate = properties.all();
    } else if (properties instanceof Map) {
      propertiesToIterate = {};
      for (const [key, value] of properties) {
        propertiesToIterate[key] = value;
      }
    } else {
      propertiesToIterate = properties;
    }
    
    Object.keys(propertiesToIterate).forEach((propName) => {
      const prop = propertiesToIterate[propName];
      const goType = mapJsonTypeToGo(prop);
      let fieldName = capitalizeFirst(propName);
      
      // Handle duplicate field names by appending the original case
      if (usedFieldNames.has(fieldName)) {
        fieldName = fieldName + propName.toUpperCase();
      }
      usedFieldNames.add(fieldName);
      
      const jsonTag = `\`json:"${propName}"\``;
      
      // Handle property description
      let description;
      if (typeof prop.description === 'function') {
        description = prop.description();
      } else {
        description = prop.description;
      }
      
      if (description) {
        structDef += `\t// ${description}\n`;
      }
      
      // Handle examples
      let example;
      if (typeof prop.example === 'function') {
        example = prop.example();
      } else {
        example = prop.example;
      }
      
      if (example !== undefined) {
        structDef += `\t// Example: ${JSON.stringify(example)}\n`;
      }
      
      structDef += `\t${fieldName} ${goType} ${jsonTag}\n`;
    });
  }

  structDef += '}\n';
  return structDef;
}

/*
 * Map JSON schema types to Go types (for AsyncAPI properties)
 */
function mapJsonTypeToGo(property) {
  // Handle AsyncAPI objects - type might be a function
  const type = (typeof property.type === 'function') ? property.type() : property.type;
  
  switch (type) {
    case 'string':
      // Handle format-specific types
      let format;
      if (typeof property.format === 'function') {
        format = property.format();
      } else {
        format = property.format;
      }
      
      if (format === 'date-time') {
        return 'time.Time';
      }
      return 'string';
      
    case 'integer':
      let intFormat;
      if (typeof property.format === 'function') {
        intFormat = property.format();
      } else {
        intFormat = property.format;
      }
      
      if (intFormat === 'int32') {
        return 'int32';
      } else if (intFormat === 'int64') {
        return 'int64';
      }
      return 'int64';
      
    case 'number':
      let numFormat;
      if (typeof property.format === 'function') {
        numFormat = property.format();
      } else {
        numFormat = property.format;
      }
      
      if (numFormat === 'float') {
        return 'float32';
      } else if (numFormat === 'double') {
        return 'float64';
      }
      return 'float64';
      
    case 'boolean':
      return 'bool';
      
    case 'object':
      return 'interface{}';
      
    case 'array':
      // Handle AsyncAPI objects - items might be a function
      const items = (typeof property.items === 'function') ? property.items() : property.items;
      if (items) {
        return `[]${mapJsonTypeToGo(items)}`;
      }
      return '[]interface{}';
      
    default:
      return 'interface{}';
  }
}

/*
 * Map JSON schema types to Go types (for component schemas)
 */
function mapComponentJsonTypeToGo(property) {
  switch (property.type) {
    case 'string':
      if (property.format === 'date-time') {
        return 'time.Time';
      }
      return 'string';
      
    case 'integer':
      if (property.format === 'int32') {
        return 'int32';
      } else if (property.format === 'int64') {
        return 'int64';
      }
      return 'int64';
      
    case 'number':
      if (property.format === 'float') {
        return 'float32';
      } else if (property.format === 'double') {
        return 'float64';
      }
      return 'float64';
      
    case 'boolean':
      return 'bool';
      
    case 'object':
      return 'interface{}';
      
    case 'array':
      if (property.items) {
        return `[]${mapComponentJsonTypeToGo(property.items)}`;
      }
      return '[]interface{}';
      
    default:
      return 'interface{}';
  }
}

/*
 * Capitalize first letter of a string
 */
function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
} 