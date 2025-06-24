/*
 * This component generates individual Go model files for each message type
 * It creates separate .go files in a models package for better organization
 * Now supports AsyncAPI 3.0 with event messages and request/response pairs
 */
export function IndividualModels({ asyncapi }) {
  const messages = new Map();
  const oneOfTypes = new Map(); // Track oneOf types for special handling
  const eventSchemas = new Map(); // Track event schemas separately
  
  // Extract all messages from channels with more specific naming
  asyncapi.channels().forEach((channel) => {
    const channelName = channel.address().replace(/\./g, '_');
    
    channel.messages().forEach((message) => {
      const messageName = message.name() || message.id();
      const messageId = message.id();
      const payload = message.payload();
      
      if (payload && payload.type() === 'object') {
        // Create unique message names based on message ID or name
        const uniqueMessageName = messageId || `${channelName}_${messageName}`;
        
        // Check for oneOf in properties (especially in result field)
        const properties = payload.properties();
        if (properties && properties.result) {
          const resultProperty = properties.result;
          if (resultProperty.oneOf && Array.isArray(resultProperty.oneOf)) {
            // Handle oneOf in result field
            const oneOfSchemas = resultProperty.oneOf;
            const oneOfTypeName = `${uniqueMessageName}_Result`;
            
            oneOfTypes.set(oneOfTypeName, {
              channel: channel.address(),
              schemas: oneOfSchemas,
              description: resultProperty.description || 'OneOf result type'
            });
          }
        }
        
        // Determine if this is an event message based on message structure
        const isEventMessage = messageName.includes('Event') || 
                              (properties && properties.event) ||
                              messageName.match(/(balanceUpdate|executionReport|listStatus|listenKeyExpired|outboundAccountPosition|externalLockUpdate)/i);
        
        messages.set(uniqueMessageName, {
          message,
          payload,
          channel: channel.address(),
          originalName: messageName,
          messageId: messageId,
          isEvent: isEventMessage
        });
      }
    });
  });

  // Extract schemas from components for oneOf references and event schemas
  const componentSchemas = new Map();
  
  // Access component schemas via JSON structure (most reliable method)
  if (asyncapi.components()) {
    const json = asyncapi.json();
    if (json && json.components && json.components.schemas) {
      Object.entries(json.components.schemas).forEach(([schemaName, schemaData]) => {
        componentSchemas.set(schemaName, {
          type: schemaData.type,
          properties: schemaData.properties,
          description: schemaData.description,
          isEvent: schemaName.includes('Event')
        });
        
        // Track event schemas separately
        if (schemaName.includes('Event')) {
          eventSchemas.set(schemaName, schemaData);
        }
      });
    }
  }

  // Generate model files array
  const modelFiles = [];
  
  // Generate regular message models
  messages.forEach((messageData, messageName) => {
    const modelContent = generateModelFile(messageName, messageData.payload, messageData.message, oneOfTypes, componentSchemas, messageData.isEvent);
    modelFiles.push({
      name: `${toSnakeCase(messageName)}.go`,
      content: modelContent
    });
  });

  // Generate oneOf wrapper types
  oneOfTypes.forEach((oneOfData, oneOfTypeName) => {
    const oneOfContent = generateOneOfModel(oneOfTypeName, oneOfData, componentSchemas);
    modelFiles.push({
      name: `${toSnakeCase(oneOfTypeName)}.go`,
      content: oneOfContent
    });
  });

  // Generate component schema models (including event schemas)
  componentSchemas.forEach((schema, schemaName) => {
    // Skip if schema name is just a number or invalid identifier
    if (/^\d+$/.test(schemaName) || !isValidGoIdentifier(schemaName)) {
      console.warn(`Skipping invalid schema name: ${schemaName}`);
      return;
    }
    
    const modelContent = generateComponentSchemaFile(schemaName, schema);
    modelFiles.push({
      name: `${toSnakeCase(schemaName)}.go`,
      content: modelContent
    });
  });

  return modelFiles;
}

/*
 * Generate a complete Go model file with package declaration
 */
function generateModelFile(name, schema, message, oneOfTypes, componentSchemas, isEvent = false) {
  const structName = toPascalCase(name);
  const needsTime = hasTimeFields(schema);
  
  let content = `package models

import (
\t"encoding/json"`;
  
  if (needsTime) {
    content += `
\t"time"`;
  }
  
  content += `
)

`;

  // Generate nested struct definitions first
  const nestedStructs = generateNestedStructs(schema, structName);
  content += nestedStructs;

  content += generateStructWithDocs(structName, schema, message, false, isEvent);
  content += generateHelperMethods(structName, isEvent);
  
  return content;
}

/*
 * Generate nested struct definitions for object properties
 */
function generateNestedStructs(schema, parentName) {
  let nestedStructs = '';
  
  // Handle both AsyncAPI objects and plain objects
  let properties;
  if (typeof schema.properties === 'function') {
    properties = schema.properties();
  } else {
    properties = schema.properties;
  }
  
  if (properties) {
    // Handle AsyncAPI Map-like objects
    let propertiesToIterate;
    if (typeof properties.all === 'function') {
      // AsyncAPI Map-like object
      propertiesToIterate = properties.all();
    } else if (properties instanceof Map) {
      // Convert Map to regular object
      propertiesToIterate = {};
      for (const [key, value] of properties) {
        propertiesToIterate[key] = value;
      }
    } else {
      // Regular object
      propertiesToIterate = properties;
    }
    
    Object.keys(propertiesToIterate).forEach((propName) => {
      const prop = propertiesToIterate[propName];
      
      // Handle AsyncAPI objects - type might be a function
      const propType = (typeof prop.type === 'function') ? prop.type() : prop.type;
      
      // Handle nested objects
      let propProperties;
      if (propType === 'object') {
        if (typeof prop.properties === 'function') {
          propProperties = prop.properties();
        } else {
          propProperties = prop.properties;
        }
        
        // Check if propProperties has content using same logic as in mapJsonTypeToGo
        let propertyKeys = [];
        if (propProperties) {
          if (typeof propProperties.all === 'function') {
            const allProps = propProperties.all();
            propertyKeys = Object.keys(allProps);
          } else if (propProperties instanceof Map) {
            propertyKeys = Array.from(propProperties.keys());
          } else if (typeof propProperties === 'object') {
            propertyKeys = Object.keys(propProperties);
          }
        }
        
        if (propertyKeys && propertyKeys.length > 0) {
          const nestedStructName = `${parentName}${toPascalCase(propName)}`;
          nestedStructs += generateStructWithDocs(nestedStructName, prop, null, true);
          nestedStructs += '\n';
          
          // Recursively generate nested structs
          nestedStructs += generateNestedStructs(prop, nestedStructName);
        }
      }
    });
  }
  
  return nestedStructs;
}

/*
 * Generate a Go struct definition with properties
 */
function generateStructDefinition(name, schema) {
  let structDef = `type ${name} struct {\n`;

  // Handle both AsyncAPI objects and plain objects
  let properties;
  if (typeof schema.properties === 'function') {
    properties = schema.properties();
  } else {
    properties = schema.properties;
  }
  
  let requiredFields;
  if (typeof schema.required === 'function') {
    requiredFields = schema.required() || [];
  } else {
    requiredFields = schema.required || [];
  }
  
  const usedFieldNames = new Set();
  
  if (properties) {
    Object.keys(properties).forEach((propName) => {
      const prop = properties[propName];
      let goType = '';
      
      // Handle oneOf types specially
      if (prop.oneOf && Array.isArray(prop.oneOf)) {
        goType = `${name}${toPascalCase(propName)}`;
      } else {
        goType = mapJsonTypeToGo(prop, propName, name);
      }
      
      let fieldName = toPascalCase(propName);
      
      // Handle duplicate field names
      if (usedFieldNames.has(fieldName)) {
        fieldName = fieldName + toPascalCase(propName);
      }
      usedFieldNames.add(fieldName);
      
      const isRequired = requiredFields.includes(propName);
      const jsonTag = `\`json:"${propName}${getJsonTagOptions(prop, isRequired)}"\``;
      
      if (prop.description) {
        // Handle multi-line descriptions by splitting and prefixing each line with //
        const propDescription = (typeof prop.description === 'function') ? prop.description() : prop.description;
        if (propDescription && typeof propDescription === 'string') {
          const description = propDescription.trim();
          const lines = description.split('\n');
          lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              structDef += `\t// ${trimmedLine}\n`;
            }
          });
        }
      }
      if (prop.examples && prop.examples.length > 0) {
        structDef += `\t// Example: ${prop.examples[0]}\n`;
      }
      structDef += `\t${fieldName} ${goType} ${jsonTag}\n`;
    });
  }

  structDef += '}\n\n';
  return structDef;
}

/*
 * Generate a Go struct with comprehensive documentation
 */
function generateStructWithDocs(name, schema, message, isNested = false, isEvent = false) {
  let structDef = '';
  
  // Add documentation
  if (!isNested) {
    if (message && message.description()) {
      structDef += `// ${name} - ${message.description()}\n`;
    } else if (isEvent) {
      structDef += `// ${name} - Event message structure\n`;
    } else {
      structDef += `// ${name} - Message structure\n`;
    }
    
    if (message && message.name()) {
      structDef += `// Message name: ${message.name()}\n`;
    }
  }
  
  structDef += `type ${name} struct {\n`;
  
  // Handle both AsyncAPI objects and plain objects
  let properties;
  if (typeof schema.properties === 'function') {
    properties = schema.properties();
  } else {
    properties = schema.properties;
  }
  
  if (properties) {
    // Handle AsyncAPI Map-like objects
    let propertiesToIterate;
    if (typeof properties.all === 'function') {
      // AsyncAPI Map-like object
      propertiesToIterate = properties.all();
    } else if (properties instanceof Map) {
      // Convert Map to regular object
      propertiesToIterate = {};
      for (const [key, value] of properties) {
        propertiesToIterate[key] = value;
      }
    } else {
      // Regular object
      propertiesToIterate = properties;
    }
    
    // Get required fields
    let requiredFields = [];
    if (typeof schema.required === 'function') {
      requiredFields = schema.required() || [];
    } else if (Array.isArray(schema.required)) {
      requiredFields = schema.required;
    }
    
    Object.keys(propertiesToIterate).forEach((propName) => {
      const prop = propertiesToIterate[propName];
      const isRequired = requiredFields.includes(propName);
      
      // Generate property documentation
      const propDocs = generatePropertyDocs(prop);
      if (propDocs) {
        structDef += `\t${propDocs}\n`;
      }
      
      // Generate field
      const goFieldName = toPascalCase(propName);
      const goType = mapJsonTypeToGo(prop, propName, name);
      const jsonTag = getJsonTagOptions(prop, isRequired);
      
      structDef += `\t${goFieldName} ${goType} \`json:"${propName}"${jsonTag}\`\n`;
    });
  }
  
  structDef += '}\n';
  
  if (!isNested) {
    structDef += '\n';
  }
  
  return structDef;
}

/*
 * Generate helper methods for struct (including event-specific methods)
 */
function generateHelperMethods(structName, isEvent = false) {
  let methods = '';
  
  // Standard JSON marshaling methods
  methods += `// String returns string representation of ${structName}\n`;
  methods += `func (s ${structName}) String() string {\n`;
  methods += `\tb, _ := json.Marshal(s)\n`;
  methods += `\treturn string(b)\n`;
  methods += `}\n\n`;
  
  // Event-specific methods
  if (isEvent) {
    methods += `// GetEventType returns the event type for ${structName}\n`;
    methods += `func (s ${structName}) GetEventType() string {\n`;
    methods += `\tif s.Event.E != "" {\n`;
    methods += `\t\treturn s.Event.E\n`;
    methods += `\t}\n`;
    methods += `\treturn "${structName.toLowerCase()}"\n`;
    methods += `}\n\n`;
    
    methods += `// GetEventTime returns the event timestamp for ${structName}\n`;
    methods += `func (s ${structName}) GetEventTime() int64 {\n`;
    methods += `\tif s.Event.E != 0 {\n`;
    methods += `\t\treturn s.Event.E\n`;
    methods += `\t}\n`;
    methods += `\treturn 0\n`;
    methods += `}\n\n`;
  }
  
  return methods;
}

/*
 * Map JSON schema types to Go types with more precision
 */
function mapJsonTypeToGo(property, propName, parentStructName) {
  // Handle both AsyncAPI objects and plain objects
  let propType;
  if (typeof property.type === 'function') {
    propType = property.type();
  } else {
    propType = property.type;
  }
  
  // Handle $ref references
  if (property.$ref) {
    const refName = extractSchemaNameFromRef(property.$ref);
    if (refName && isValidGoIdentifier(refName)) {
      return refName;
    }
  }
  
  switch (propType) {
    case 'string':
      // Handle enums
      let enumValues;
      if (typeof property.enum === 'function') {
        enumValues = property.enum();
      } else {
        enumValues = property.enum;
      }
      if (enumValues && Array.isArray(enumValues)) {
        return 'string'; // Could generate enum types later
      }
      
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
      return 'int64'; // Default to int64 for integers
      
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
      return 'float64'; // Default to float64 for numbers
      
    case 'boolean':
      return 'bool';
      
    case 'object':
      // Handle nested objects
      let propProperties;
      if (typeof property.properties === 'function') {
        propProperties = property.properties();
      } else {
        propProperties = property.properties;
      }
      
      // Check if propProperties has actual content
      let propertyKeys = [];
      if (propProperties) {
        if (typeof propProperties.all === 'function') {
          const allProps = propProperties.all();
          propertyKeys = Object.keys(allProps);
        } else if (propProperties instanceof Map) {
          propertyKeys = Array.from(propProperties.keys());
        } else if (typeof propProperties === 'object') {
          propertyKeys = Object.keys(propProperties);
        }
      }
      
      if (propertyKeys && propertyKeys.length > 0) {
        // Generate nested struct name
        return `${parentStructName}${toPascalCase(propName)}`;
      }
      return 'interface{}';
      
    case 'array':
      let items;
      if (typeof property.items === 'function') {
        items = property.items();
      } else {
        items = property.items;
      }
      
      if (items) {
        const itemType = mapJsonTypeToGo(items, `${propName}Item`, parentStructName);
        return `[]${itemType}`;
      }
      return '[]interface{}';
      
    default:
      return 'interface{}';
  }
}

/*
 * Get JSON tag options based on property characteristics
 */
function getJsonTagOptions(property, isRequired = false) {
  let options = '';
  
  if (!isRequired) {
    options += ',omitempty';
  }
  
  return options;
}

/*
 * Generate property documentation lines
 */
function generatePropertyDocs(prop) {
  let docs = '';
  
  // Handle both AsyncAPI objects and plain objects
  let description;
  if (typeof prop.description === 'function') {
    description = prop.description();
  } else {
    description = prop.description;
  }
  
  if (description) {
    docs += `// ${description}`;
  }
  
  // Add example if available
  let example;
  if (typeof prop.example === 'function') {
    example = prop.example();
  } else {
    example = prop.example;
  }
  
  if (example !== undefined) {
    if (docs) {
      docs += ` (example: ${JSON.stringify(example)})`;
    } else {
      docs += `// Example: ${JSON.stringify(example)}`;
    }
  }
  
  return docs;
}

/*
 * Convert string to PascalCase
 * Remove parentheses and content inside them
 * Handle existing camelCase and PascalCase strings correctly
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
 * Convert string to snake_case
 */
function toSnakeCase(str) {
  if (!str) return '';
  
  return str
    .replace(/([A-Z])/g, '_$1') // Insert underscore before capital letters
    .toLowerCase()
    .replace(/^_/, '') // Remove leading underscore
    .replace(/[^a-z0-9_]/g, '_') // Replace invalid characters with underscore
    .replace(/_+/g, '_') // Replace multiple underscores with single underscore
    .replace(/_$/, ''); // Remove trailing underscore
}

/*
 * Check if the schema has any time-related fields
 */
function hasTimeFields(schema) {
  if (!schema) {
    return false;
  }
  
  // Handle both AsyncAPI objects and plain objects
  let properties;
  if (typeof schema.properties === 'function') {
    properties = schema.properties();
  } else {
    properties = schema.properties;
  }
  
  if (!properties) {
    return false;
  }

  return Object.keys(properties).some(propName => {
    const prop = properties[propName];
    const goType = mapJsonTypeToGo(prop, propName);
    return goType.includes('time.') || (propName && (propName.includes('time') || propName.includes('Time') || propName.includes('timestamp')));
  });
}

/*
 * Generate a oneOf model that can handle multiple types
 */
function generateOneOfModel(typeName, oneOfData, componentSchemas) {
  const structName = toPascalCase(typeName);
  
  let content = `package models

import (
\t"encoding/json"
\t"fmt"
)

`;

  content += `// ${structName} represents a oneOf type that can contain different event types\n`;
  content += `// ${oneOfData.description}\n`;
  content += `type ${structName} struct {\n`;
  content += `\t// Use interface{} to hold any of the possible types\n`;
  content += `\tValue interface{} \`json:"-"\`\n`;
  content += `\t// Type indicates which specific type is stored\n`;
  content += `\tType string \`json:"-"\`\n`;
  content += `}\n\n`;

  // Generate custom JSON marshaling
  content += `// MarshalJSON implements json.Marshaler\n`;
  content += `func (o ${structName}) MarshalJSON() ([]byte, error) {\n`;
  content += `\treturn json.Marshal(o.Value)\n`;
  content += `}\n\n`;

  // Generate custom JSON unmarshaling with type detection
  content += `// UnmarshalJSON implements json.Unmarshaler\n`;
  content += `func (o *${structName}) UnmarshalJSON(data []byte) error {\n`;
  content += `\t// Try to determine the type by checking for distinctive fields\n`;
  content += `\tvar raw map[string]interface{}\n`;
  content += `\tif err := json.Unmarshal(data, &raw); err != nil {\n`;
  content += `\t\treturn err\n`;
  content += `\t}\n\n`;

  // Generate type detection logic based on distinctive fields
  const schemas = oneOfData.schemas;
  schemas.forEach((schemaRef, index) => {
    // Extract schema name from reference
    const schemaName = extractSchemaNameFromRef(schemaRef);
    const schema = componentSchemas.get(schemaName);
    
    if (schema) {
      const distinctiveField = getDistinctiveField(schema);
      const condition = index === 0 ? 'if' : 'else if';
      
      content += `\t// Try ${schemaName}\n`;
      content += `\t${condition} `;
      if (distinctiveField) {
        content += `eventType, exists := raw["${distinctiveField.name}"]; exists && eventType == "${distinctiveField.value}" {\n`;
      } else {
        content += `true { // Fallback for ${schemaName}\n`;
      }
      content += `\t\tvar value ${schemaName}\n`;
      content += `\t\tif err := json.Unmarshal(data, &value); err == nil {\n`;
      content += `\t\t\to.Value = value\n`;
      content += `\t\t\to.Type = "${schemaName}"\n`;
      content += `\t\t\treturn nil\n`;
      content += `\t\t}\n`;
      content += `\t}\n`;
    }
  });

  content += `\n\treturn fmt.Errorf("unable to unmarshal oneOf type")\n`;
  content += `}\n\n`;

  // Generate type-safe getters
  schemas.forEach((schemaRef) => {
    const schemaName = extractSchemaNameFromRef(schemaRef);
    content += `// As${schemaName} returns the value as ${schemaName} if that's the current type\n`;
    content += `func (o ${structName}) As${schemaName}() (*${schemaName}, bool) {\n`;
    content += `\tif o.Type == "${schemaName}" {\n`;
    content += `\t\tif value, ok := o.Value.(${schemaName}); ok {\n`;
    content += `\t\t\treturn &value, true\n`;
    content += `\t\t}\n`;
    content += `\t}\n`;
    content += `\treturn nil, false\n`;
    content += `}\n\n`;
  });

  return content;
}

/*
 * Generate a component schema model file
 */
function generateComponentSchemaFile(schemaName, schema) {
  const structName = toPascalCase(schemaName);
  const needsTime = hasTimeFields(schema);
  
  let content = `package models

import (
\t"encoding/json"`;
  
  if (needsTime) {
    content += `
\t"time"`;
  }
  
  content += `
)

`;

  // Generate nested struct definitions first
  const nestedStructs = generateNestedStructs(schema, structName);
  content += nestedStructs;

  content += `// ${structName} represents ${schema.description || schemaName}\n`;
  content += generateStructDefinition(structName, schema);
  content += generateHelperMethods(structName, schema.isEvent || false);
  
  return content;
}

/*
 * Extract schema name from $ref
 */
function extractSchemaNameFromRef(schemaRef) {
  if (schemaRef.$ref) {
    const parts = schemaRef.$ref.split('/');
    return parts[parts.length - 1];
  }
  return 'UnknownSchema';
}

/*
 * Get a distinctive field that can help identify the schema type
 */
function getDistinctiveField(schema) {
  // Handle both AsyncAPI objects and plain objects
  let properties;
  if (typeof schema.properties === 'function') {
    properties = schema.properties();
  } else {
    properties = schema.properties;
  }
  
  if (!properties) return null;
  
  // Common patterns for event type identification
  const typeFields = ['e', 'event', 'type', 'eventType'];
  
  for (const fieldName of typeFields) {
    if (properties[fieldName]) {
      const field = properties[fieldName];
      if (field.example && field.example) {
        return {
          name: fieldName,
          value: field.example
        };
      }
    }
  }
  
  return null;
}

/*
 * Check if a string is a valid Go identifier
 */
function isValidGoIdentifier(name) {
  if (!name || typeof name !== 'string') return false;
  
  // Go identifiers must start with a letter or underscore
  // and contain only letters, digits, and underscores
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && 
         // Also avoid Go keywords
         !isGoKeyword(name);
}

/*
 * Check if a string is a Go keyword
 */
function isGoKeyword(name) {
  const goKeywords = [
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
    'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
    'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
    'var'
  ];
  return goKeywords.includes(name);
} 