/*
 * This component generates individual Go model files for each message type
 * It creates separate .go files in a models package for better organization
 * Now supports oneOf structures for flexible message handling
 */
export function IndividualModels({ asyncapi }) {
  const messages = new Map();
  const oneOfTypes = new Map(); // Track oneOf types for special handling
  
  // Extract all messages from channels with more specific naming
  asyncapi.channels().forEach((channel) => {
    const channelName = channel.address().replace(/\./g, '_');
    
    channel.messages().forEach((message) => {
      const messageName = message.name() || message.id();
      const payload = message.payload();
      
      if (payload && payload.type() === 'object') {
        // Create unique message names based on channel and message type
        const uniqueMessageName = `${channelName}_${messageName}`;
        
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
        
        messages.set(uniqueMessageName, {
          message,
          payload,
          channel: channel.address(),
          originalName: messageName
        });
      }
    });
  });

  // Extract schemas from components for oneOf references
  const componentSchemas = new Map();
  
  // Access component schemas via JSON structure (most reliable method)
  if (asyncapi.components()) {
    const json = asyncapi.json();
    if (json && json.components && json.components.schemas) {
      Object.entries(json.components.schemas).forEach(([schemaName, schemaData]) => {
        componentSchemas.set(schemaName, {
          type: schemaData.type,
          properties: schemaData.properties,
          description: schemaData.description
        });
      });
    }
  }

  // Generate model files array
  const modelFiles = [];
  
  // Generate regular message models
  messages.forEach((messageData, messageName) => {
    const modelContent = generateModelFile(messageName, messageData.payload, messageData.message, oneOfTypes, componentSchemas);
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

  // Generate component schema models
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
function generateModelFile(name, schema, message, oneOfTypes, componentSchemas) {
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

  content += generateStructWithDocs(structName, schema, message);
  content += generateHelperMethods(structName);
  
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
          
          // Recursively generate nested structs for deeper levels
          nestedStructs += generateNestedStructs(prop, nestedStructName);
        }
      } else if (propType === 'array') {
        // Handle AsyncAPI objects - items might be a function
        const items = (typeof prop.items === 'function') ? prop.items() : prop.items;
        if (items) {
          // Get the items type properly
          const itemsType = (typeof items.type === 'function') ? items.type() : items.type;
          
          let itemsProperties;
          if (itemsType === 'object') {
            if (typeof items.properties === 'function') {
              itemsProperties = items.properties();
            } else {
              itemsProperties = items.properties;
            }
            
            // Check if itemsProperties has content using same logic as above
            let itemsPropertyKeys = [];
            if (itemsProperties) {
              if (typeof itemsProperties.all === 'function') {
                const allProps = itemsProperties.all();
                itemsPropertyKeys = Object.keys(allProps);
              } else if (itemsProperties instanceof Map) {
                itemsPropertyKeys = Array.from(itemsProperties.keys());
              } else if (typeof itemsProperties === 'object') {
                itemsPropertyKeys = Object.keys(itemsProperties);
              }
            }
            
            if (itemsPropertyKeys && itemsPropertyKeys.length > 0) {
              const nestedStructName = `${parentName}${toPascalCase(propName)}`;
              nestedStructs += generateStructWithDocs(nestedStructName, items, null, true);
              nestedStructs += '\n';
              
              // Recursively generate nested structs for array item objects
              nestedStructs += generateNestedStructs(items, nestedStructName);
            }
          }
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
function generateStructWithDocs(name, schema, message, isNested = false) {
  let structDef = '';
  
  if (!isNested && message) {
    const title = (typeof message.title === 'function') ? message.title() : (message.title || name);
    const description = (typeof message.description === 'function') ? message.description() : message.description;
    
    structDef += `// ${name} represents the ${title} message\n`;
    if (description && typeof description === 'string') {
      structDef += `// ${description}\n`;
    }
  } else {
    structDef += `// ${name} represents a ${isNested ? 'nested object' : 'message structure'}\n`;
  }
  
  structDef += `type ${name} struct {\n`;

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
      
      // Handle property description - AsyncAPI objects might have description as function
      const propDescription = (typeof prop.description === 'function') ? prop.description() : prop.description;
      if (propDescription) {
        if (typeof propDescription === 'string') {
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
      
      // Handle examples - AsyncAPI objects might have examples as function
      const propExamples = (typeof prop.examples === 'function') ? prop.examples() : prop.examples;
      if (propExamples && Array.isArray(propExamples) && propExamples.length > 0) {
        structDef += `\t// Example: ${propExamples[0]}\n`;
      }
      structDef += `\t${fieldName} ${goType} ${jsonTag}\n`;
    });
  }

  structDef += '}\n\n';
  return structDef;
}

/*
 * Generate helper methods for the struct
 */
function generateHelperMethods(structName) {
  return `// ToJSON converts ${structName} to JSON bytes
func (m *${structName}) ToJSON() ([]byte, error) {
\treturn json.Marshal(m)
}

// FromJSON populates ${structName} from JSON bytes
func (m *${structName}) FromJSON(data []byte) error {
\treturn json.Unmarshal(data, m)
}

// String returns a string representation of ${structName}
func (m *${structName}) String() string {
\tdata, _ := m.ToJSON()
\treturn string(data)
}

`;
}

/*
 * Map JSON schema types to Go types with more precision
 */
function mapJsonTypeToGo(property, propName, parentStructName) {
  // Handle AsyncAPI objects - type is a function
  const type = (typeof property.type === 'function') ? property.type() : property.type;
  
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
      // Handle both AsyncAPI objects and plain objects for properties
      let objProperties;
      if (typeof property.properties === 'function') {
        objProperties = property.properties();
      } else {
        objProperties = property.properties;
      }
      
      // For AsyncAPI objects, objProperties might be a Map or have .all() method
      let propertyKeys = [];
      if (objProperties) {
        if (typeof objProperties.all === 'function') {
          // AsyncAPI Map-like object
          const allProps = objProperties.all();
          propertyKeys = Object.keys(allProps);
        } else if (objProperties instanceof Map) {
          // Map object
          propertyKeys = Array.from(objProperties.keys());
        } else if (typeof objProperties === 'object') {
          // Regular object
          propertyKeys = Object.keys(objProperties);
        }
      }
      
      if (propertyKeys && propertyKeys.length > 0) {
        // Generate a specific struct type for nested objects
        return `${parentStructName}${toPascalCase(propName)}`;
      }
      return 'interface{}';
    case 'array':
      // Handle AsyncAPI objects - items might be a function
      const items = (typeof property.items === 'function') ? property.items() : property.items;
      if (items) {
        // Get the items type properly
        const itemsType = (typeof items.type === 'function') ? items.type() : items.type;
        
        // Handle both AsyncAPI objects and plain objects for array items
        let itemsProperties;
        if (itemsType === 'object') {
          if (typeof items.properties === 'function') {
            itemsProperties = items.properties();
          } else {
            itemsProperties = items.properties;
          }
          
          // Check if itemsProperties has content using same logic as above
          let itemsPropertyKeys = [];
          if (itemsProperties) {
            if (typeof itemsProperties.all === 'function') {
              const allProps = itemsProperties.all();
              itemsPropertyKeys = Object.keys(allProps);
            } else if (itemsProperties instanceof Map) {
              itemsPropertyKeys = Array.from(itemsProperties.keys());
            } else if (typeof itemsProperties === 'object') {
              itemsPropertyKeys = Object.keys(itemsProperties);
            }
          }
          
          if (itemsPropertyKeys && itemsPropertyKeys.length > 0) {
            // For array of objects, use the nested struct name
            return `[]${parentStructName}${toPascalCase(propName)}`;
          } else {
            return '[]interface{}';
          }
        } else {
          return `[]${mapJsonTypeToGo(items, propName, parentStructName)}`;
        }
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
  return isRequired ? '' : ',omitempty';
}

/*
 * Generate property documentation lines
 */
function generatePropertyDocs(prop) {
  let docs = '';
  
  // Handle property description
  const propDescription = (typeof prop.description === 'function') ? prop.description() : prop.description;
  if (propDescription && typeof propDescription === 'string') {
    // Handle multi-line descriptions by splitting and prefixing each line with //
    const description = propDescription.trim();
    const lines = description.split('\n');
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        docs += `\t// ${trimmedLine}\n`;
      }
    });
  }
  
  // Handle property examples
  const propExamples = (typeof prop.examples === 'function') ? prop.examples() : prop.examples;
  if (propExamples && Array.isArray(propExamples) && propExamples.length > 0) {
    docs += `\t// Example: ${propExamples[0]}\n`;
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
  
  // Remove parentheses and their content
  const cleanStr = str.replace(/\([^)]*\)/g, '');
  
  // If it's already in PascalCase or camelCase, preserve it
  if (/^[A-Z][a-zA-Z0-9]*$/.test(cleanStr)) {
    return cleanStr;
  }
  
  // Split on word boundaries (spaces, hyphens, underscores, dots)
  // but also split on camelCase boundaries
  const words = cleanStr
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
    .split(/[\s\-_\.]+/)
    .filter(word => word.length > 0);
  
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/*
 * Convert string to snake_case
 */
function toSnakeCase(str) {
  if (!str) return '';
  
  // Remove parentheses and their content
  const cleanStr = str.replace(/\([^)]*\)/g, '');
  
  return cleanStr
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[\s\-\.]+/g, '_')
    .replace(/__+/g, '_'); // Replace multiple underscores with single underscore
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
  content += generateHelperMethods(structName);
  
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