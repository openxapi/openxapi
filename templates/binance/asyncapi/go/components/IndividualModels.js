/*
 * This component generates individual Go model files for each message type
 * It creates separate .go files in a models package for better organization
 * Now supports AsyncAPI 3.0 with event messages and request/response pairs
 */

// Global compatibility variable for templates that might reference isRequestMessage
const isRequestMessage = false;

export function IndividualModels({ asyncapi }) {
  // Reset nested struct tracking for each model generation
  generatedNestedStructs.clear();
  
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
          required: schemaData.required,
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
  // But skip ones that are already generated as channel messages
  const generatedTypeNames = new Set();
  messages.forEach((messageData, messageName) => {
    const structName = toPascalCase(messageName);
    generatedTypeNames.add(structName);
    
    // Also track event types that might be referenced
    if (messageData.isEvent) {
      const eventTypeName = structName.replace(/Send$|Receive$/, '') + 'Event';
      generatedTypeNames.add(eventTypeName);
    }
  });
  
  componentSchemas.forEach((schema, schemaName) => {
    // Skip if schema name is just a number or invalid identifier
    if (/^\d+$/.test(schemaName) || !isValidGoIdentifier(schemaName)) {
      console.warn(`Skipping invalid schema name: ${schemaName}`);
      return;
    }
    
    // Skip if we already generated this type from channel messages
    const componentTypeName = toPascalCase(schemaName);
    if (generatedTypeNames.has(componentTypeName)) {
      // Skip duplicate - already generated as ${componentTypeName}
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
  const isRequestMessage = isRequestMessage_func(name, message);
  
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
  const nestedStructs = generateNestedStructs(schema, structName, isEvent);
  content += nestedStructs;

  content += generateStructWithDocs(structName, schema, message, false, isEvent, isRequestMessage);
  content += generateHelperMethods(structName, isEvent, isRequestMessage, schema);
  
  // Generate SetXxx methods for request messages
  if (isRequestMessage) {
    content += generateSetterMethods(structName, schema);
  }
  
  return content;
}

/*
 * Track generated nested struct names to avoid duplicates
 */
let generatedNestedStructs = new Set();

/*
 * Generate nested struct definitions for object properties
 */
function generateNestedStructs(schema, parentName, isEvent = false) {
  let nestedStructs = '';
  
  // Check if this is a request message to determine if we need special params handling
  const isRequestMessage = parentName.toLowerCase().includes('request');
  
  // Handle both AsyncAPI objects and plain objects
  let properties;
  try {
    if (typeof schema.properties === 'function') {
      properties = schema.properties();
    } else {
      properties = schema.properties;
    }
  } catch (e) {
    console.warn('Error accessing schema properties in generateNestedStructs:', e.message);
    return nestedStructs;
  }
  
  
  if (properties) {
    // Handle AsyncAPI Map-like objects
    let propertiesToIterate;
    try {
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
    } catch (e) {
      console.warn('Error processing properties in generateNestedStructs:', e.message);
      return nestedStructs;
    }
    
    if (!propertiesToIterate || typeof propertiesToIterate !== 'object') {
      return nestedStructs;
    }
    
    Object.keys(propertiesToIterate).forEach((propName) => {
      const prop = propertiesToIterate[propName];
      if (!prop) return;
      
      let propType;
      try {
        if (typeof prop.type === 'function') {
          propType = prop.type();
        } else {
          propType = prop.type;
        }
      } catch (e) {
        console.warn(`Error accessing property type for ${propName}:`, e.message);
        return;
      }
      
      // Enhanced condition checking for nested objects
      const hasProperties = prop.properties && 
        ((typeof prop.properties === 'object' && Object.keys(prop.properties).length > 0) ||
         (typeof prop.properties === 'function'));
      
      // Force nested struct generation for known object properties that should have structs
      const propDescription = (typeof prop.description === 'function') ? prop.description() : prop.description;
      const shouldForceNestedStruct = (propType === 'object' && 
        (propName === 'o' || propName === 'k' || propName === 'c' || 
         (propDescription && typeof propDescription === 'string' && propDescription.toLowerCase().includes('data'))));
      
      if ((propType === 'object' && hasProperties) || shouldForceNestedStruct) {
        // Special handling for params object in request messages
        if (isRequestMessage && propName === 'params') {
          nestedStructs += generateParamsStruct(parentName, prop);
        } else {
          // Generate regular nested struct using field name
          const fieldName = generateGoFieldName(propName, prop, isEvent);
          const nestedStructName = `${parentName}${fieldName}`;
          nestedStructs += generateNestedStructDefinition(nestedStructName, prop, isEvent);
          
          // Recursively generate nested structs for this object's properties
          nestedStructs += generateNestedStructs(prop, nestedStructName, isEvent);
        }
      } else if (propType === 'array' && prop.items) {
        // Handle array items that might be objects
        let items = prop.items;
        let itemType;
        let itemProperties;
        let itemDescription = 'Array item';
        
        try {
          // Try to get items schema via JSON representation
          let itemsJson = null;
          if (typeof items.json === 'function') {
            itemsJson = items.json();
          } else if (typeof prop.json === 'function') {
            const propJson = prop.json();
            itemsJson = propJson.items;
          }
          
          // Get the item type and properties from JSON
          if (itemsJson) {
            itemType = itemsJson.type;
            itemProperties = itemsJson.properties;
            itemDescription = itemsJson.description || 'Array item';
          } else {
            // Fallback to original method
            if (typeof items.type === 'function') {
              itemType = items.type();
            } else {
              itemType = items.type;
            }
            
            if (typeof items.properties === 'function') {
              itemProperties = items.properties();
            } else {
              itemProperties = items.properties;
            }
          }
        } catch (e) {
          console.warn(`Error accessing array items type/properties for ${propName}:`, e.message);
          return nestedStructs;
        }
        
        if (itemType === 'object' && itemProperties) {
          // Use the property name to create unique array item types
          const propertyFieldName = generateGoFieldName(propName, null, isEvent);
          const itemStructName = `${parentName}${propertyFieldName}Item`;
          
          // Create a schema-like object for generateNestedStructDefinition
          const itemSchema = {
            type: itemType,
            properties: itemProperties,
            description: itemDescription
          };
          
          nestedStructs += generateNestedStructDefinition(itemStructName, itemSchema, isEvent);
          
          // Recursively generate nested structs for array item's properties
          nestedStructs += generateNestedStructs(itemSchema, itemStructName, isEvent);
        }
      }
    });
  }
  
  return nestedStructs;
}

/*
 * Generate params struct for request messages with proper pointer handling
 */
function generateParamsStruct(parentName, paramsProperty) {
  const structName = `${parentName}Params`;
  let structDef = `// ${structName} contains the parameters for ${parentName}\n`;
  structDef += `type ${structName} struct {\n`;
  
  // Handle both AsyncAPI objects and plain objects
  let properties;
  try {
    if (typeof paramsProperty.properties === 'function') {
      properties = paramsProperty.properties();
    } else {
      properties = paramsProperty.properties;
    }
  } catch (e) {
    console.warn('Error accessing params properties in generateParamsStruct:', e.message);
    structDef += '}\n\n';
    return structDef;
  }
  
  if (properties) {
    // Handle AsyncAPI Map-like objects
    let propertiesToIterate;
    try {
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
    } catch (e) {
      console.warn('Error processing params properties:', e.message);
      structDef += '}\n\n';
      return structDef;
    }
    
    // Get required fields with safer access pattern
    let requiredFields = [];
    if (paramsProperty) {
      try {
        // Try different ways to access required fields safely
        let required = null;
        
        // Method 1: Direct property access
        if (paramsProperty.required !== undefined) {
          required = typeof paramsProperty.required === 'function' ? paramsProperty.required() : paramsProperty.required;
        }
        
        // Method 2: Check if it's an AsyncAPI object with schema method
        if (!required && typeof paramsProperty.schema === 'function') {
          const schema = paramsProperty.schema();
          if (schema && schema.required !== undefined) {
            required = typeof schema.required === 'function' ? schema.required() : schema.required;
          }
        }
        
        // Method 3: Check JSON representation
        if (!required && typeof paramsProperty.json === 'function') {
          const json = paramsProperty.json();
          if (json && json.required) {
            required = json.required;
          }
        }
        
        if (required && Array.isArray(required)) {
          requiredFields = required;
        }
      } catch (e) {
        // Don't log this as an error since it's expected for many schemas
        // Just continue with empty required fields
      }
    }
    
    if (propertiesToIterate && typeof propertiesToIterate === 'object') {
      Object.keys(propertiesToIterate).forEach((propName) => {
        const prop = propertiesToIterate[propName];
        if (!prop) return;
        
        const isRequired = requiredFields.includes(propName);
        const goFieldName = generateGoFieldName(propName, prop, parentName.includes('Event'));
        
        // Generate property documentation
        const propDocs = generatePropertyDocs(prop);
        if (propDocs) {
          structDef += `\t${propDocs}\n`;
        }
        
        // For params, use pointers for optional fields
        const goType = mapJsonTypeToGo(prop, propName, structName, true, isRequired, [], false);
        const jsonTag = getJsonTagOptions(prop, isRequired);
        
        structDef += `\t${goFieldName} ${goType} \`json:"${propName}${jsonTag}"\`\n`;
      });
    }
  }
  
  structDef += '}\n\n';
  return structDef;
}

/*
 * Generate nested struct definition for object properties
 */
function generateNestedStructDefinition(structName, schema, isEvent = false) {
  if (!schema) {
    return '';
  }
  
  // Check if this struct has already been generated
  if (generatedNestedStructs.has(structName)) {
    return '';
  }
  
  // Mark as generated to avoid duplicates
  generatedNestedStructs.add(structName);
  
  let structDef = `// ${structName} represents a nested object structure\n`;
  structDef += `type ${structName} struct {\n`;
  
  // Handle both AsyncAPI objects and plain objects
  let properties;
  try {
    if (typeof schema.properties === 'function') {
      properties = schema.properties();
    } else {
      properties = schema.properties;
    }
  } catch (e) {
    console.warn(`Error accessing properties for ${structName}:`, e.message);
    structDef += '}\n\n';
    return structDef;
  }
  
  if (properties) {
    // Handle AsyncAPI Map-like objects
    let propertiesToIterate;
    try {
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
    } catch (e) {
      console.warn(`Error processing properties for ${structName}:`, e.message);
      structDef += '}\n\n';
      return structDef;
    }
    
    // Get required fields with safer access pattern
    let requiredFields = [];
    if (schema) {
      try {
        // Try different ways to access required fields safely
        let required = null;
        
        // Method 1: Direct property access
        if (schema.required !== undefined) {
          required = typeof schema.required === 'function' ? schema.required() : schema.required;
        }
        
        // Method 2: Check if it's an AsyncAPI object with schema method
        if (!required && typeof schema.schema === 'function') {
          const schemaObj = schema.schema();
          if (schemaObj && schemaObj.required !== undefined) {
            required = typeof schemaObj.required === 'function' ? schemaObj.required() : schemaObj.required;
          }
        }
        
        // Method 3: Check JSON representation
        if (!required && typeof schema.json === 'function') {
          const json = schema.json();
          if (json && json.required) {
            required = json.required;
          }
        }
        
        if (required && Array.isArray(required)) {
          requiredFields = required;
        }
      } catch (e) {
        // Don't log this as an error since it's expected for many schemas
        // Just continue with empty required fields
      }
    }
    
    // For request messages, look for required fields in the params property
    let paramsRequiredFields = [];
    if (isRequestMessage && propertiesToIterate && propertiesToIterate.params) {
      const paramsProperty = propertiesToIterate.params;
      if (paramsProperty && paramsProperty.properties) {
        let paramsProps;
        try {
          if (typeof paramsProperty.properties === 'function') {
            paramsProps = paramsProperty.properties();
          } else {
            paramsProps = paramsProperty.properties;
          }
        } catch (e) {
          console.warn('Error accessing params properties for required fields:', e.message);
        }
        
        if (paramsProps && paramsProperty) {
          try {
            // Try different ways to access required fields safely
            let required = null;
            
            // Method 1: Direct property access
            if (paramsProperty.required !== undefined) {
              required = typeof paramsProperty.required === 'function' ? paramsProperty.required() : paramsProperty.required;
            }
            
            // Method 2: Check if it's an AsyncAPI object with schema method
            if (!required && typeof paramsProperty.schema === 'function') {
              const schema = paramsProperty.schema();
              if (schema && schema.required !== undefined) {
                required = typeof schema.required === 'function' ? schema.required() : schema.required;
              }
            }
            
            // Method 3: Check JSON representation
            if (!required && typeof paramsProperty.json === 'function') {
              const json = paramsProperty.json();
              if (json && json.required) {
                required = json.required;
              }
            }
            
            if (required && Array.isArray(required)) {
              paramsRequiredFields = required;
            }
          } catch (e) {
            // Don't log this as an error since it's expected for many schemas
            // Just continue with empty required fields
          }
        }
      }
    }
    
    // Track used field names to prevent collisions
    const usedFieldNames = new Set();
    
    if (propertiesToIterate && typeof propertiesToIterate === 'object') {
      Object.keys(propertiesToIterate).forEach((propName) => {
        const prop = propertiesToIterate[propName];
        if (!prop) return;
        
        const isRequired = requiredFields.includes(propName);
        
        // Generate property documentation
        const propDocs = generatePropertyDocs(prop);
        if (propDocs) {
          structDef += `\t${propDocs}\n`;
        }
        
        // Generate field name and handle collisions
        // Use the inherited isEvent flag from parent
        let goFieldName = generateGoFieldName(propName, prop, isEvent);
        
        // Handle field name collisions
        if (usedFieldNames.has(goFieldName)) {
          // Create a unique field name by preserving case information from original property
          if (propName.toLowerCase() !== propName) {
            // If property has uppercase letters, use them
            goFieldName = propName.replace(/[^a-zA-Z0-9]/g, '');
            goFieldName = goFieldName.charAt(0).toUpperCase() + goFieldName.slice(1);
          } else {
            // If still collision, add numeric suffix
            let counter = 2;
            const baseName = goFieldName;
            while (usedFieldNames.has(goFieldName)) {
              goFieldName = baseName + counter.toString();
              counter++;
            }
          }
        }
        usedFieldNames.add(goFieldName);
        
        // For nested structs, don't use pointers for request message logic
        // as these are typically internal structures
        const goType = mapJsonTypeToGo(prop, propName, structName, false, isRequired, [], isEvent);
        const jsonTag = getJsonTagOptions(prop, isRequired);
        
        structDef += `\t${goFieldName} ${goType} \`json:"${propName}${jsonTag}"\`\n`;
      });
    }
  }
  
  structDef += '}\n\n';
  return structDef;
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
        // Special handling for known nested object properties based on the AsyncAPI spec
        if (prop.type === 'object' && prop.properties) {
          const fieldName = generateGoFieldName(propName, prop, name.includes('Event'));
          goType = `${name}${fieldName}`;
        } else {
          goType = mapJsonTypeToGo(prop, propName, name, false, false, [], name.includes('Event'));
        }
      }
      
      let fieldName = generateGoFieldName(propName, prop, name.includes('Event'));
      
      // Handle duplicate field names
      if (usedFieldNames.has(fieldName)) {
        fieldName = fieldName + toPascalCase(propName);
      }
      usedFieldNames.add(fieldName);
      
      const isRequired = requiredFields.includes(propName);
      const jsonTag = getJsonTagOptions(prop, isRequired);
      
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
      structDef += `\t${fieldName} ${goType} \`json:"${propName}${jsonTag}"\`\n`;
    });
  }

  structDef += '}\n\n';
  return structDef;
}

/*
 * Generate a Go struct with comprehensive documentation
 */
function generateStructWithDocs(name, schema, message, isNested = false, isEvent = false, isRequestMessage = false) {
  let structDef = '';
  
  // Add documentation
  if (!isNested) {
    if (message && message.description()) {
      structDef += `// ${name} - ${message.description()}\n`;
    } else if (isEvent) {
      structDef += `// ${name} - Event message structure\n`;
    } else if (isRequestMessage) {
      structDef += `// ${name} - Request message structure\n`;
      structDef += `// Use SetXxx methods to set optional parameters and enable method chaining\n`;
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
  try {
    if (typeof schema.properties === 'function') {
      properties = schema.properties();
    } else {
      properties = schema.properties;
    }
  } catch (e) {
    console.warn('Error accessing schema properties in generateStructWithDocs:', e.message);
    structDef += '}\n';
    if (!isNested) {
      structDef += '\n';
    }
    return structDef;
  }
  
  if (properties) {
    // Handle AsyncAPI Map-like objects
    let propertiesToIterate;
    try {
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
    } catch (e) {
      console.warn('Error processing properties in generateStructWithDocs:', e.message);
      structDef += '}\n';
      if (!isNested) {
        structDef += '\n';
      }
      return structDef;
    }
    
    // Get required fields with safer access pattern
    let requiredFields = [];
    if (schema) {
      try {
        // Try different ways to access required fields safely
        let required = null;
        
        // Method 1: Direct property access
        if (schema.required !== undefined) {
          required = typeof schema.required === 'function' ? schema.required() : schema.required;
        }
        
        // Method 2: Check if it's an AsyncAPI object with schema method
        if (!required && typeof schema.schema === 'function') {
          const schemaObj = schema.schema();
          if (schemaObj && schemaObj.required !== undefined) {
            required = typeof schemaObj.required === 'function' ? schemaObj.required() : schemaObj.required;
          }
        }
        
        // Method 3: Check JSON representation
        if (!required && typeof schema.json === 'function') {
          const json = schema.json();
          if (json && json.required) {
            required = json.required;
          }
        }
        
        if (required && Array.isArray(required)) {
          requiredFields = required;
        }
      } catch (e) {
        // Don't log this as an error since it's expected for many schemas
        // Just continue with empty required fields
      }
    }
    
    // For request messages, look for required fields in the params property
    let paramsRequiredFields = [];
    if (isRequestMessage && propertiesToIterate && propertiesToIterate.params) {
      const paramsProperty = propertiesToIterate.params;
      if (paramsProperty && paramsProperty.properties) {
        let paramsProps;
        try {
          if (typeof paramsProperty.properties === 'function') {
            paramsProps = paramsProperty.properties();
          } else {
            paramsProps = paramsProperty.properties;
          }
        } catch (e) {
          console.warn('Error accessing params properties for required fields:', e.message);
        }
        
        if (paramsProps && paramsProperty) {
          try {
            // Try different ways to access required fields safely
            let required = null;
            
            // Method 1: Direct property access
            if (paramsProperty.required !== undefined) {
              required = typeof paramsProperty.required === 'function' ? paramsProperty.required() : paramsProperty.required;
            }
            
            // Method 2: Check if it's an AsyncAPI object with schema method
            if (!required && typeof paramsProperty.schema === 'function') {
              const schema = paramsProperty.schema();
              if (schema && schema.required !== undefined) {
                required = typeof schema.required === 'function' ? schema.required() : schema.required;
              }
            }
            
            // Method 3: Check JSON representation
            if (!required && typeof paramsProperty.json === 'function') {
              const json = paramsProperty.json();
              if (json && json.required) {
                required = json.required;
              }
            }
            
            if (required && Array.isArray(required)) {
              paramsRequiredFields = required;
            }
          } catch (e) {
            // Don't log this as an error since it's expected for many schemas
            // Just continue with empty required fields
          }
        }
      }
    }
    
    // Track used field names to prevent collisions
    const usedFieldNames = new Set();
    
    if (propertiesToIterate && typeof propertiesToIterate === 'object') {
      Object.keys(propertiesToIterate).forEach((propName) => {
        const prop = propertiesToIterate[propName];
        if (!prop) return;
        
        const isRequired = requiredFields.includes(propName);
        
        // For params property in request messages, check individual param requirements
        let isParamFieldOptional = false;
        if (isRequestMessage && propName === 'params') {
          isParamFieldOptional = true; // The params object itself might be optional, but we'll handle individual params
        }
        
        // Generate property documentation
        const propDocs = generatePropertyDocs(prop);
        if (propDocs) {
          structDef += `\t${propDocs}\n`;
        }
        
        // Generate field name and handle collisions
        let goFieldName = generateGoFieldName(propName, prop, isEvent);
        
        // Handle field name collisions
        if (usedFieldNames.has(goFieldName)) {
          // Create a unique field name by preserving case information from original property
          if (propName.toLowerCase() !== propName) {
            // If property has uppercase letters, use them
            goFieldName = propName.replace(/[^a-zA-Z0-9]/g, '');
            goFieldName = goFieldName.charAt(0).toUpperCase() + goFieldName.slice(1);
          } else {
            // If still collision, add numeric suffix
            let counter = 2;
            const baseName = goFieldName;
            while (usedFieldNames.has(goFieldName)) {
              goFieldName = baseName + counter.toString();
              counter++;
            }
          }
        }
        usedFieldNames.add(goFieldName);
        
        const goType = mapJsonTypeToGo(prop, propName, name, isRequestMessage, isRequired, paramsRequiredFields, isEvent);
        const jsonTag = getJsonTagOptions(prop, isRequired);
        
        structDef += `\t${goFieldName} ${goType} \`json:"${propName}${jsonTag}"\`\n`;
      });
    }
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
function generateHelperMethods(structName, isEvent = false, isRequestMessage = false, schema = null) {
  let methods = '';
  
  // Generate constructor for request messages
  if (isRequestMessage) {
    methods += `// New${structName} creates a new ${structName} instance\n`;
    methods += `func New${structName}() *${structName} {\n`;
    methods += `\treturn &${structName}{}\n`;
    methods += `}\n\n`;
  }
  
  // Standard JSON marshaling methods
  methods += `// String returns string representation of ${structName}\n`;
  methods += `func (s ${structName}) String() string {\n`;
  methods += `\tb, _ := json.Marshal(s)\n`;
  methods += `\treturn string(b)\n`;
  methods += `}\n\n`;
  
  // Event-specific methods
  if (isEvent) {
    // Detect whether the struct has direct event fields or nested event object
    let hasDirectEventFields = false;
    let hasNestedEventObject = false;
    
    if (schema) {
      try {
        let properties;
        if (typeof schema.properties === 'function') {
          properties = schema.properties();
        } else {
          properties = schema.properties;
        }
        
        if (properties) {
          // Check for direct event fields (e for EventType, E for EventTime)
          if (properties.e || properties.E) {
            hasDirectEventFields = true;
          }
          
          // Check for nested event object
          if (properties.event || properties.Event) {
            hasNestedEventObject = true;
          }
        }
      } catch (e) {
        console.warn(`Error inspecting schema for ${structName}:`, e.message);
      }
    }
    
    // Determine field access pattern
    const eventTypeAccess = hasNestedEventObject ? 's.Event.EventType' : 's.EventType';
    const eventTimeAccess = hasNestedEventObject ? 's.Event.EventTime' : 's.EventTime';
    
    methods += `// GetEventType returns the event type for ${structName}\n`;
    methods += `func (s ${structName}) GetEventType() string {\n`;
    methods += `\tif ${eventTypeAccess} != "" {\n`;
    methods += `\t\treturn ${eventTypeAccess}\n`;
    methods += `\t}\n`;
    methods += `\treturn "${structName.toLowerCase()}"\n`;
    methods += `}\n\n`;
    
    methods += `// GetEventTime returns the event timestamp for ${structName}\n`;
    methods += `func (s ${structName}) GetEventTime() int64 {\n`;
    methods += `\tif ${eventTimeAccess} != 0 {\n`;
    methods += `\t\treturn ${eventTimeAccess}\n`;
    methods += `\t}\n`;
    methods += `\treturn 0\n`;
    methods += `}\n\n`;
  }
  
  return methods;
}

/*
 * Map JSON schema types to Go types with more precision
 */
function mapJsonTypeToGo(property, propName, parentStructName, isRequestMessage = false, isRequired = false, paramsRequiredFields = [], isEvent = false) {
  if (!property) {
    return 'interface{}';
  }
  
  // Handle oneOf with simple types first (before processing type)
  let propertyOneOf;
  try {
    if (typeof property.oneOf === 'function') {
      propertyOneOf = property.oneOf();
    } else {
      propertyOneOf = property.oneOf;
    }
  } catch (e) {
    // Property might not have oneOf
    propertyOneOf = null;
  }
  
  if (propertyOneOf && Array.isArray(propertyOneOf)) {
    // Check if this is a oneOf with simple types (int, string, null)
    const simpleTypes = propertyOneOf.filter(item => {
      if (typeof item === 'object' && item.type) {
        return ['integer', 'string', 'null'].includes(item.type);
      }
      return false;
    });
    
    // If all oneOf items are simple types, use interface{} for flexibility
    if (simpleTypes.length === propertyOneOf.length && simpleTypes.length > 1) {
      const shouldUsePointer = (isRequestMessage && !isRequired && propName !== 'id' && propName !== 'method') ||
                              (!isRequired && propName !== 'id' && propName !== 'method');
      return shouldUsePointer ? '*interface{}' : 'interface{}';
    }
  }
  
  // Handle both AsyncAPI objects and plain objects
  let propType;
  try {
    if (typeof property.type === 'function') {
      propType = property.type();
    } else {
      propType = property.type;
    }
  } catch (e) {
    console.warn(`Error accessing property type for ${propName}:`, e.message);
    propType = 'object'; // Default fallback
  }
  
  
  // Handle $ref references
  if (property.$ref) {
    const refName = extractSchemaNameFromRef(property.$ref);
    if (refName && isValidGoIdentifier(refName)) {
      return refName;
    }
  }

  // Determine if this should be a pointer type
  // Use pointers for:
  // 1. Optional fields in request messages (original logic)
  // 2. Optional nested objects in any message (for nil checking)
  const shouldUsePointer = (isRequestMessage && !isRequired && propName !== 'id' && propName !== 'method') ||
                          (!isRequired && propType === 'object');

  // Handle object type (including params object in requests)
  if (propType === 'object') {
    // Handle nested objects
    let propProperties;
    try {
      if (typeof property.properties === 'function') {
        propProperties = property.properties();
      } else {
        propProperties = property.properties;
      }
    } catch (e) {
      console.warn(`Error accessing nested properties for ${propName}:`, e.message);
      propProperties = null;
    }
    
    // Check if propProperties has actual content
    let propertyKeys = [];
    if (propProperties) {
      try {
        if (typeof propProperties.all === 'function') {
          const allProps = propProperties.all();
          propertyKeys = allProps ? Object.keys(allProps) : [];
        } else if (propProperties instanceof Map) {
          propertyKeys = Array.from(propProperties.keys());
        } else if (typeof propProperties === 'object') {
          propertyKeys = Object.keys(propProperties);
        }
      } catch (e) {
        console.warn(`Error processing nested properties for ${propName}:`, e.message);
        propertyKeys = [];
      }
    }
    
    
    // Enhanced nested struct type detection with forced generation for known properties
    const propertyDescription = (typeof property.description === 'function') ? property.description() : property.description;
    const shouldForceNestedStruct = (propName === 'o' || propName === 'k' || propName === 'c' || 
      (propertyDescription && typeof propertyDescription === 'string' && propertyDescription.toLowerCase().includes('data')));
    
    if ((propertyKeys && propertyKeys.length > 0) || 
        (propProperties && typeof propProperties === 'object' && Object.keys(propProperties).length > 0) ||
        shouldForceNestedStruct) {
      // For params object in request messages, generate special params struct
      if (isRequestMessage && propName === 'params') {
        const structName = `${parentStructName}Params`;
        return shouldUsePointer ? `*${structName}` : structName;
      }
      
      // Generate nested struct name using field name
      const fieldName = generateGoFieldName(propName, property, isEvent);
      const structName = `${parentStructName}${fieldName}`;
      return shouldUsePointer ? `*${structName}` : structName;
    }
    
    return shouldUsePointer ? '*interface{}' : 'interface{}';
  }

  let baseType = '';
  
  switch (propType) {
    case 'string':
      // Handle enums
      let enumValues;
      try {
        if (typeof property.enum === 'function') {
          enumValues = property.enum();
        } else {
          enumValues = property.enum;
        }
      } catch (e) {
        console.warn(`Error accessing enum for ${propName}:`, e.message);
        enumValues = null;
      }
      if (enumValues && Array.isArray(enumValues)) {
        baseType = 'string'; // Could generate enum types later
      }
      
      // Handle format-specific types
      let format;
      try {
        if (typeof property.format === 'function') {
          format = property.format();
        } else {
          format = property.format;
        }
      } catch (e) {
        console.warn(`Error accessing format for ${propName}:`, e.message);
        format = null;
      }
      
      if (format === 'date-time') {
        baseType = 'time.Time';
      } else {
        baseType = 'string';
      }
      break;
      
    case 'integer':
      let intFormat;
      try {
        if (typeof property.format === 'function') {
          intFormat = property.format();
        } else {
          intFormat = property.format;
        }
      } catch (e) {
        console.warn(`Error accessing integer format for ${propName}:`, e.message);
        intFormat = null;
      }
      
      if (intFormat === 'int32') {
        baseType = 'int32';
      } else if (intFormat === 'int64') {
        baseType = 'int64';
      } else {
        baseType = 'int64'; // Default to int64 for integers
      }
      break;
      
    case 'number':
      let numFormat;
      try {
        if (typeof property.format === 'function') {
          numFormat = property.format();
        } else {
          numFormat = property.format;
        }
      } catch (e) {
        console.warn(`Error accessing number format for ${propName}:`, e.message);
        numFormat = null;
      }
      
      if (numFormat === 'float') {
        baseType = 'float32';
      } else if (numFormat === 'double') {
        baseType = 'float64';
      } else {
        baseType = 'float64'; // Default to float64 for numbers
      }
      break;
      
    case 'boolean':
      baseType = 'bool';
      break;
      
    case 'array':
      let items;
      try {
        if (typeof property.items === 'function') {
          items = property.items();
        } else {
          items = property.items;
        }
      } catch (e) {
        console.warn(`Error accessing array items for ${propName}:`, e.message);
        items = null;
      }
      
      if (items) {
        // Check if array items are objects that need nested struct generation
        let itemType;
        let itemsType;
        try {
          itemsType = (typeof items.type === 'function') ? items.type() : items.type;
        } catch (e) {
          itemsType = 'unknown';
        }
        
        if (itemsType === 'object' && parentStructName) {
          // Check if the object has properties defined
          let itemProperties;
          try {
            itemProperties = (typeof items.properties === 'function') ? items.properties() : items.properties;
          } catch (e) {
            itemProperties = null;
          }
          
          if (itemProperties && (typeof itemProperties === 'object' && Object.keys(itemProperties).length > 0)) {
            // For arrays of objects with properties, use the same naming convention as nested struct generation
            // Use the property name to create unique array item types
            const propertyFieldName = generateGoFieldName(propName, null, parentStructName.includes('Event'));
            itemType = `${parentStructName}${propertyFieldName}Item`;
          } else {
            // For arrays of objects without defined properties, use interface{}
            itemType = 'interface{}';
          }
        } else {
          // Use recursive logic for non-object array items
          const itemPropName = `${propName}Item`;
          itemType = mapJsonTypeToGo(items, itemPropName, parentStructName, isRequestMessage, true, paramsRequiredFields);
        }
        
        baseType = `[]${itemType}`;
      } else {
        baseType = '[]interface{}';
      }
      break;
      
    default:
      baseType = 'interface{}';
  }
  
  // Return with pointer if needed
  return shouldUsePointer ? `*${baseType}` : baseType;
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
  if (!prop) return '';
  
  let docs = '';
  
  // Handle both AsyncAPI objects and plain objects
  let description;
  try {
    if (typeof prop.description === 'function') {
      description = prop.description();
    } else {
      description = prop.description;
    }
  } catch (e) {
    console.warn('Error accessing property description:', e.message);
    description = null;
  }
  
  if (description) {
    // Handle multi-line descriptions properly by ensuring each line is commented
    const descriptionLines = description.split('\n');
    docs += descriptionLines.map(line => `// ${line.trim()}`).join('\n\t');
  }
  
  // Add example if available
  let example;
  try {
    if (typeof prop.example === 'function') {
      example = prop.example();
    } else {
      example = prop.example;
    }
  } catch (e) {
    console.warn('Error accessing property example:', e.message);
    example = undefined;
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
 * Generate Go field name based on property name and description for event schemas
 */
function generateGoFieldName(propName, property, isEvent = false) {
  // For event schemas, try to use the description to generate a more meaningful field name
  if (isEvent && property) {
    let description;
    try {
      if (typeof property.description === 'function') {
        description = property.description();
      } else {
        description = property.description;
      }
    } catch (e) {
      console.warn(`Error accessing description for ${propName}:`, e.message);
      description = null;
    }
    
    if (description && typeof description === 'string') {
      // Clean the description by removing (xxx) patterns and extra whitespace
      const cleanedDescription = description
        .replace(/\s*\([^)]*\)\s*/g, '') // Remove (xxx) patterns
        .trim();
      
      if (cleanedDescription) {
        // Convert cleaned description to PascalCase, ensuring spaces are handled
        return toPascalCase(cleanedDescription);
      }
    }
  }
  
  // Fallback to using property name, ensure it's properly formatted
  return toPascalCase(propName);
}

/*
 * Convert string to PascalCase
 * Remove parentheses and content inside them
 * Handle existing camelCase and PascalCase strings correctly
 */
function toPascalCase(str) {
  if (!str) return '';
  
  // Only preserve the string if it's already in valid PascalCase without spaces/separators
  // Valid PascalCase: starts with uppercase, no spaces/dots/underscores/dashes/special chars, may contain uppercase letters
  if (/^[A-Z][a-zA-Z0-9]*$/.test(str) && !/[\s._\-\?\!\(\)\[\]\{\}\<\>\,\:\;\"\'\`\~\@\#\$\%\^\&\*\+\=\|\\\/]/.test(str)) {
    return str;
  }
  
  // Handle camelCase strings by preserving internal capital letters
  // Split on dots, underscores, dashes, spaces, and special characters first
  return str
    .split(/[._\-\s\?\!\(\)\[\]\{\}\<\>\,\:\;\"\'\`\~\@\#\$\%\^\&\*\+\=\|\\\/]+/)
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
    .join('');
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
    const goType = mapJsonTypeToGo(prop, propName, 'HasTimeCheck', false, false, [], false);
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
  const isRequestMessage = structName.toLowerCase().includes('request');
  
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
  const isEventStruct = structName.includes('Event');
  const nestedStructs = generateNestedStructs(schema, structName, isEventStruct);
  content += nestedStructs;
  
  // Force generation of nested structs for all object properties
  if (schema.properties) {
    Object.keys(schema.properties).forEach(propName => {
      const prop = schema.properties[propName];
      if (prop.type === 'object' && prop.properties) {
        const fieldName = generateGoFieldName(propName, prop, structName.includes('Event'));
        const nestedStructName = `${structName}${fieldName}`;
        content += generateNestedStructDefinition(nestedStructName, prop, structName.includes('Event'));
      }
    });
  }

  content += `// ${structName} represents ${schema.description || schemaName}\n`;
  content += generateStructDefinition(structName, schema);
  content += generateHelperMethods(structName, schema.isEvent || false, isRequestMessage, schema);
  
  // Generate SetXxx methods for request messages in component schemas
  if (isRequestMessage) {
    content += generateSetterMethods(structName, schema);
  }
  
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

/*
 * Check if this is a request message that should have pointer parameters
 */
function isRequestMessage_func(name, message) {
  if (!name) return false;
  
  // Check if name contains "Request" or message indicates it's a request
  const isRequestByName = name.toLowerCase().includes('request');
  
  // Check if message indicates it's a send operation
  let isRequestByMessage = false;
  if (message) {
    try {
      if (typeof message.name === 'function') {
        const messageName = message.name();
        isRequestByMessage = messageName && messageName.toLowerCase().includes('request');
      } else if (message.name) {
        isRequestByMessage = message.name.toLowerCase().includes('request');
      }
    } catch (e) {
      console.warn('Error accessing message name in isRequestMessage_func:', e.message);
    }
  }
  
  return isRequestByName || isRequestByMessage;
}

/*
 * Generate SetXxx methods for request messages to support method chaining
 */
function generateSetterMethods(structName, schema) {
  let methods = '';
  
  if (!schema) {
    return methods;
  }
  
  // Handle both AsyncAPI objects and plain objects
  let properties;
  try {
    if (typeof schema.properties === 'function') {
      properties = schema.properties();
    } else {
      properties = schema.properties;
    }
  } catch (e) {
    console.warn('Error accessing schema properties in generateSetterMethods:', e.message);
    return methods;
  }
  
  if (!properties) {
    return methods;
  }
  
  // Handle AsyncAPI Map-like objects
  let propertiesToIterate;
  try {
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
  } catch (e) {
    console.warn('Error processing properties in generateSetterMethods:', e.message);
    return methods;
  }
  
  if (!propertiesToIterate || typeof propertiesToIterate !== 'object') {
    return methods;
  }
  
  // Get required fields with safer access pattern  
  let requiredFields = [];
  if (schema) {
    try {
      // Try different ways to access required fields safely
      let required = null;
      
      // Method 1: Direct property access
      if (schema.required !== undefined) {
        required = typeof schema.required === 'function' ? schema.required() : schema.required;
      }
      
      // Method 2: Check if it's an AsyncAPI object with schema method
      if (!required && typeof schema.schema === 'function') {
        const schemaObj = schema.schema();
        if (schemaObj && schemaObj.required !== undefined) {
          required = typeof schemaObj.required === 'function' ? schemaObj.required() : schemaObj.required;
        }
      }
      
      // Method 3: Check JSON representation
      if (!required && typeof schema.json === 'function') {
        const json = schema.json();
        if (json && json.required) {
          required = json.required;
        }
      }
      
      if (required && Array.isArray(required)) {
        requiredFields = required;
      }
    } catch (e) {
      // Don't log this as an error since it's expected for many schemas
      // Just continue with empty required fields
    }
  }

  // Generate setter methods for the params object and its properties
  Object.keys(propertiesToIterate).forEach((propName) => {
    const prop = propertiesToIterate[propName];
    if (!prop) return;
    
    const isRequired = requiredFields.includes(propName);
    const goFieldName = generateGoFieldName(propName, prop, structName.includes('Event'));
    
    // Skip id and method fields as they are typically managed internally
    if (propName === 'id' || propName === 'method') {
      return;
    }
    
    // Generate setter for the property itself
    if (!isRequired) {
      const goType = mapJsonTypeToGo(prop, propName, structName, true, isRequired, [], false);
      // Remove pointer for the parameter type in setter
      const paramType = goType.startsWith('*') ? goType.substring(1) : goType;
      
      methods += `// Set${goFieldName} sets the ${propName} field and returns the struct for method chaining\n`;
      methods += `func (r *${structName}) Set${goFieldName}(value ${paramType}) *${structName} {\n`;
      methods += `\tr.${goFieldName} = &value\n`;
      methods += `\treturn r\n`;
      methods += `}\n\n`;
    }
    
    // Special handling for params object - generate setters for individual param fields
    if (propName === 'params' && prop.properties) {
      let paramsProps;
      try {
        if (typeof prop.properties === 'function') {
          paramsProps = prop.properties();
        } else {
          paramsProps = prop.properties;
        }
      } catch (e) {
        console.warn('Error accessing params properties in generateSetterMethods:', e.message);
        return;
      }
      
      if (!paramsProps) return;
      
      // Get required fields from params with safer access pattern
      let paramsRequiredFields = [];
      if (prop) {
        try {
          // Try different ways to access required fields safely
          let required = null;
          
          // Method 1: Direct property access
          if (prop.required !== undefined) {
            required = typeof prop.required === 'function' ? prop.required() : prop.required;
          }
          
          // Method 2: Check if it's an AsyncAPI object with schema method
          if (!required && typeof prop.schema === 'function') {
            const schema = prop.schema();
            if (schema && schema.required !== undefined) {
              required = typeof schema.required === 'function' ? schema.required() : schema.required;
            }
          }
          
          // Method 3: Check JSON representation
          if (!required && typeof prop.json === 'function') {
            const json = prop.json();
            if (json && json.required) {
              required = json.required;
            }
          }
          
          if (required && Array.isArray(required)) {
            paramsRequiredFields = required;
          }
        } catch (e) {
          // Don't log this as an error since it's expected for many schemas
          // Just continue with empty required fields
        }
      }
      
      // Handle AsyncAPI Map-like objects for params properties
      let paramsPropsToIterate;
      try {
        if (typeof paramsProps.all === 'function') {
          paramsPropsToIterate = paramsProps.all();
        } else if (paramsProps instanceof Map) {
          paramsPropsToIterate = {};
          for (const [key, value] of paramsProps) {
            paramsPropsToIterate[key] = value;
          }
        } else {
          paramsPropsToIterate = paramsProps;
        }
      } catch (e) {
        console.warn('Error processing params properties in generateSetterMethods:', e.message);
        return;
      }
      
      if (!paramsPropsToIterate || typeof paramsPropsToIterate !== 'object') {
        return;
      }
      
      Object.keys(paramsPropsToIterate).forEach((paramName) => {
        const paramProp = paramsPropsToIterate[paramName];
        if (!paramProp) return;
        
        const isParamRequired = paramsRequiredFields.includes(paramName);
        const paramGoFieldName = generateGoFieldName(paramName, paramProp, structName.includes('Event'));
        const paramGoType = mapJsonTypeToGo(paramProp, paramName, `${structName}Params`, true, isParamRequired, []);
        
        // Remove pointer for the parameter type in setter
        const paramType = paramGoType.startsWith('*') ? paramGoType.substring(1) : paramGoType;
        
        methods += `// Set${paramGoFieldName} sets the ${paramName} parameter and returns the struct for method chaining\n`;
        methods += `func (r *${structName}) Set${paramGoFieldName}(value ${paramType}) *${structName} {\n`;
        methods += `\tif r.Params == nil {\n`;
        methods += `\t\tr.Params = &${structName}Params{}\n`;
        methods += `\t}\n`;
        if (isParamRequired) {
          methods += `\tr.Params.${paramGoFieldName} = value\n`;
        } else {
          methods += `\tr.Params.${paramGoFieldName} = &value\n`;
        }
        methods += `\treturn r\n`;
        methods += `}\n\n`;
      });
    }
  });
  
  return methods;
}