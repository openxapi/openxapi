/*
 * Python Modular Individual Models component that generates Pydantic models from AsyncAPI spec
 * Based on the Go template architecture for clean, dynamic model generation
 */

export function PythonModularIndividualModels({ asyncapi }) {
  const messages = new Map();
  const componentSchemas = new Map();
  
  // Extract all messages from channels (following Go template pattern)
  asyncapi.channels().forEach((channel) => {
    const channelName = channel.address().replace(/\./g, '_');
    
    channel.messages().forEach((message) => {
      const messageName = message.name() || message.id();
      const messageId = message.id();
      const payload = message.payload();
      
      if (payload && payload.type() === 'object') {
        // Create unique message names based on message ID or name
        const uniqueMessageName = messageId || `${channelName}_${messageName}`;
        
        // Determine if this is an event message
        const isEventMessage = messageName.includes('Event') || 
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

  // Extract component schemas from AsyncAPI spec (following Go template pattern)
  if (asyncapi.components()) {
    const json = asyncapi.json();
    if (json && json.components && json.components.schemas) {
      Object.entries(json.components.schemas).forEach(([schemaName, schemaData]) => {
        componentSchemas.set(schemaName, {
          type: schemaData.type,
          properties: schemaData.properties,
          required: schemaData.required || [],
          description: schemaData.description,
          isEvent: schemaName.includes('Event')
        });
      });
    }
  }

  // Generate model files array
  const modelFiles = [];
  
  // Build a map of which messages reference which schemas
  const messageToSchemaMap = new Map();
  
  // Generate message models (but skip if they just reference a component schema)
  messages.forEach((messageData, messageName) => {
    // Check if this message's payload is just a $ref to a component schema
    const payload = messageData.payload;
    let referencedSchemaName = null;
    
    // Try to extract the referenced schema name from the payload
    if (payload && payload.json && typeof payload.json === 'function') {
      const payloadJson = payload.json();
      if (payloadJson && payloadJson['$ref']) {
        // Extract schema name from $ref like "#/components/schemas/AggregateTradeEvent"
        const refMatch = payloadJson['$ref'].match(/#\/components\/schemas\/(.+)/);
        if (refMatch && refMatch[1]) {
          referencedSchemaName = refMatch[1];
        }
      }
    }
    
    // If this message just references a component schema, skip generating a model for it
    if (referencedSchemaName && componentSchemas.has(referencedSchemaName)) {
      messageToSchemaMap.set(messageName, referencedSchemaName);
      return; // Skip this message model, use the component schema instead
    }
    
    // Also skip if the message name closely matches a component schema name
    // This handles cases where the message and schema have similar names
    // Normalize names by removing underscores, hyphens, and 'Event' suffix
    const normalizeForComparison = (name) => {
      return name.toLowerCase()
        .replace(/event$/i, '')  // Remove 'Event' suffix
        .replace(/[_-]/g, '')    // Remove underscores and hyphens
        .replace(/aggregate/g, 'agg'); // Normalize 'aggregate' to 'agg'
    };
    
    const messageNameNormalized = normalizeForComparison(messageName);
    let shouldSkip = false;
    
    componentSchemas.forEach((schema, schemaName) => {
      const schemaNameNormalized = normalizeForComparison(schemaName);
      // Check if normalized names match
      if (messageNameNormalized === schemaNameNormalized) {
        shouldSkip = true;
      }
    });
    
    if (shouldSkip) {
      return; // Skip this message model
    }
    
    const modelContent = generatePythonModelFile(messageName, messageData.payload, messageData.message, componentSchemas, messageData.isEvent);
    modelFiles.push({
      name: `${toSnakeCase(messageName)}.py`,
      content: modelContent
    });
  });
  
  // Generate component schema models (these take priority)
  componentSchemas.forEach((schema, schemaName) => {
    const modelContent = generateComponentSchemaFile(schemaName, schema);
    modelFiles.push({
      name: `${toSnakeCase(schemaName)}.py`,
      content: modelContent
    });
  });

  // Generate __init__.py file with all imports
  const initContent = generateModelsInitFile(modelFiles);
  modelFiles.push({
    name: '__init__.py',
    content: initContent
  });

  return modelFiles;
}

/*
 * Generate a complete Python model file with proper imports and classes
 */
function generatePythonModelFile(name, schema, message, componentSchemas, isEvent = false) {
  const className = toPascalCase(name);
  const isRequestMessage = name.toLowerCase().includes('request');
  
  let content = `from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Union, List, Dict, Any, Literal
from datetime import datetime
from decimal import Decimal


`;

  // Generate nested classes first (for rateLimits, result, params, etc.)
  const nestedClasses = generateNestedClasses(schema, className, isRequestMessage);
  content += nestedClasses;

  // Generate main class
  content += generateMainClass(className, schema, message, isEvent, isRequestMessage);
  
  return content;
}

/*
 * Get description from property (handles both AsyncAPI objects and JSON schemas)
 */
function getDescription(property, fallback = 'Property description') {
  if (!property) return fallback;
  
  try {
    let description = null;
    
    // First, let's examine if this is from JSON schema directly
    if (typeof property === 'object' && property.description && typeof property.description === 'string') {
      description = property.description;
    }
    
    // Try AsyncAPI object method
    if (!description && typeof property.description === 'function') {
      const desc = property.description();
      if (desc && typeof desc === 'string') {
        description = desc;
      }
    }
    
    // Try JSON representation
    if (!description && property.json && typeof property.json === 'function') {
      const json = property.json();
      if (json?.description) {
        description = json.description;
      }
    }
    
    // Clean and escape the description for Python string literals
    if (description && typeof description === 'string') {
      return cleanDescriptionForPython(description);
    }
  } catch (e) {
    console.warn('Error accessing property description:', e.message);
  }
  
  return fallback;
}

/*
 * Clean and escape description text for use in Python string literals
 */
function cleanDescriptionForPython(description) {
  if (!description || typeof description !== 'string') {
    return 'Property description';
  }
  
  return description
    // Replace newlines with spaces to avoid multiline string issues
    .replace(/\r?\n/g, ' ')
    // Replace multiple spaces with single spaces
    .replace(/\s+/g, ' ')
    // Escape double quotes
    .replace(/"/g, '\\"')
    // Trim whitespace
    .trim()
    // Fallback if empty after cleaning
    || 'Property description';
}

/*
 * Get properties from schema (handles both AsyncAPI objects and JSON schemas)
 */
function getProperties(schema) {
  if (!schema) return {};
  
  try {
    // Try AsyncAPI object method first
    if (typeof schema.properties === 'function') {
      const props = schema.properties();
      if (props instanceof Map) {
        const result = {};
        for (const [key, value] of props) {
          result[key] = value;
        }
        return result;
      } else if (typeof props === 'object') {
        return props;
      }
    }
    
    // Try direct property access
    if (schema.properties && typeof schema.properties === 'object') {
      return schema.properties;
    }
    
    // Try JSON representation
    if (schema.json && typeof schema.json === 'function') {
      const json = schema.json();
      if (json?.properties) {
        return json.properties;
      }
    }
    
    // Fallback: if schema itself has properties directly
    if (typeof schema === 'object' && schema.properties) {
      return schema.properties;
    }
  } catch (e) {
    console.warn('Error accessing schema properties:', e.message);
  }
  
  return {};
}

/*
 * Generate nested classes based on the actual schema structure
 */
function generateNestedClasses(schema, parentClassName, isRequestMessage) {
  let nestedClasses = '';
  
  // Parse the schema to extract properties
  const properties = getProperties(schema);

  // Generate nested classes for complex properties
  Object.entries(properties).forEach(([fieldName, fieldSchema]) => {
    // Get schema data from AsyncAPI objects
    let schemaData = fieldSchema;
    try {
      if (fieldSchema && typeof fieldSchema.json === 'function') {
        schemaData = fieldSchema.json();
      } else if (fieldSchema && fieldSchema._json) {
        schemaData = fieldSchema._json;
      }
    } catch (e) {
      // Use original schema
    }
    
    if (fieldName === 'rateLimits' && schemaData.type === 'array' && schemaData.items) {
      // Generate RateLimits nested class
      nestedClasses += generateRateLimitsClass(parentClassName, schemaData.items);
    } else if (fieldName === 'result') {
      if (schemaData.type === 'object' && schemaData.properties) {
        // First generate nested classes for array items within the result (must come before Result class)
        nestedClasses += generateArrayItemClasses(schemaData, parentClassName);
        
        // Then generate Result nested class for object results
        nestedClasses += generateResultClass(parentClassName, schemaData);
      } else if (schemaData.type === 'array' && schemaData.items && schemaData.items.type === 'object' && schemaData.items.properties) {
        // Result is directly an array of objects - generate ResultItem class
        const itemClassName = `${parentClassName}ResultItem`;
        nestedClasses += generateArrayItemClass(itemClassName, schemaData.items);
      }
    } else if (fieldName === 'params' && isRequestMessage) {
      // Generate Params nested class for requests - be more flexible about detection
      if (schemaData.type === 'object' || schemaData.properties || schemaData.$ref) {
        nestedClasses += generateParamsClass(parentClassName, schemaData);
      }
    }
  });

  return nestedClasses;
}

/*
 * Generate nested classes for array items within objects
 */
function generateArrayItemClasses(objectSchema, parentClassName) {
  let nestedClasses = '';
  
  if (!objectSchema.properties) return nestedClasses;
  
  Object.entries(objectSchema.properties).forEach(([fieldName, fieldSchema]) => {
    // Get schema data from AsyncAPI objects
    let schemaData = fieldSchema;
    try {
      if (fieldSchema && typeof fieldSchema.json === 'function') {
        schemaData = fieldSchema.json();
      } else if (fieldSchema && fieldSchema._json) {
        schemaData = fieldSchema._json;
      }
    } catch (e) {
      // Use original schema
    }
    
    // Check if this is an array of objects that needs a nested class
    if (schemaData.type === 'array' && schemaData.items && schemaData.items.type === 'object' && schemaData.items.properties) {
      // Generate a nested class for the array items
      const itemClassName = `${parentClassName}${toPascalCase(fieldName)}Item`;
      nestedClasses += generateArrayItemClass(itemClassName, schemaData.items);
    }
  });
  
  return nestedClasses;
}

/*
 * Generate a nested class for array items
 */
function generateArrayItemClass(className, itemSchema) {
  let content = `class ${className}(BaseModel):
    """Array item from AsyncAPI spec"""
`;

  if (itemSchema.properties) {
    Object.entries(itemSchema.properties).forEach(([fieldName, fieldSchema]) => {
      const pythonType = getPythonTypeFromSchema(fieldSchema);
      const description = getDescription(fieldSchema, `${fieldName} field`);
      const alias = getFieldAlias(fieldName);
      
      if (alias) {
        content += `    ${toSnakeCase(fieldName)}: Optional[${pythonType}] = Field(default=None, description="${description}", alias="${alias}")
`;
      } else {
        content += `    ${toSnakeCase(fieldName)}: Optional[${pythonType}] = Field(default=None, description="${description}")
`;
      }
    });
  }

  content += `
    model_config = ConfigDict(
        extra="allow",
        validate_assignment=True,
        use_enum_values=True,
        populate_by_name=True
    )


`;

  return content;
}

/*
 * Generate RateLimits nested class from actual schema
 */
function generateRateLimitsClass(parentClassName, itemsSchema) {
  let content = `class ${parentClassName}RateLimits(BaseModel):
    """Rate limits information from AsyncAPI spec"""
`;

  if (itemsSchema.properties) {
    Object.entries(itemsSchema.properties).forEach(([fieldName, fieldSchema]) => {
      const pythonType = getPythonTypeFromSchema(fieldSchema);
      const description = getDescription(fieldSchema, `${fieldName} field`);
      const alias = getFieldAlias(fieldName);
      
      if (alias) {
        content += `    ${toSnakeCase(fieldName)}: Optional[${pythonType}] = Field(default=None, description="${description}", alias="${alias}")
`;
      } else {
        content += `    ${toSnakeCase(fieldName)}: Optional[${pythonType}] = Field(default=None, description="${description}")
`;
      }
    });
  } else {
    // Fallback rateLimits structure
    content += `    interval: Optional[str] = Field(default=None, description="Time interval")
    interval_num: Optional[int] = Field(default=None, description="Interval number", alias="intervalNum")
    limit: Optional[int] = Field(default=None, description="Request limit")
    count: Optional[int] = Field(default=None, description="Current count")
    rate_limit_type: Optional[str] = Field(default=None, description="Rate limit type", alias="rateLimitType")
`;
  }

  content += `
    model_config = ConfigDict(
        extra="allow",
        validate_assignment=True,
        use_enum_values=True,
        populate_by_name=True
    )


`;

  return content;
}

/*
 * Generate Result nested class for object result types
 */
function generateResultClass(parentClassName, resultSchema) {
  let content = `class ${parentClassName}Result(BaseModel):
    """Result data from AsyncAPI spec"""
`;

  if (resultSchema.properties) {
    Object.entries(resultSchema.properties).forEach(([fieldName, fieldSchema]) => {
      let pythonType = getPythonTypeFromSchema(fieldSchema);
      
      // Get schema data from AsyncAPI objects for better type detection
      let schemaData = fieldSchema;
      try {
        if (fieldSchema && typeof fieldSchema.json === 'function') {
          schemaData = fieldSchema.json();
        } else if (fieldSchema && fieldSchema._json) {
          schemaData = fieldSchema._json;
        }
      } catch (e) {
        // Use original schema
      }
      
      // Check if this is an array of objects that should use a nested class
      if (schemaData.type === 'array' && schemaData.items && schemaData.items.type === 'object' && schemaData.items.properties) {
        // Use proper nested class type instead of Dict[str, Any]
        const itemClassName = `${parentClassName}${toPascalCase(fieldName)}Item`;
        pythonType = `List[${itemClassName}]`;
      }
      
      const description = getDescription(fieldSchema, `${fieldName} field`);
      const alias = getFieldAlias(fieldName);
      
      if (alias) {
        content += `    ${toSnakeCase(fieldName)}: Optional[${pythonType}] = Field(default=None, description="${description}", alias="${alias}")
`;
      } else {
        content += `    ${toSnakeCase(fieldName)}: Optional[${pythonType}] = Field(default=None, description="${description}")
`;
      }
    });
  }

  content += `
    model_config = ConfigDict(
        extra="allow",
        validate_assignment=True,
        use_enum_values=True,
        populate_by_name=True
    )


`;

  return content;
}

/*
 * Generate Params nested class for request messages
 */
function generateParamsClass(parentClassName, paramsSchema) {
  let content = `class ${parentClassName}Params(BaseModel):
    """Request parameters from AsyncAPI spec"""
`;

  // Handle AsyncAPI objects - get the actual schema properties
  const properties = getProperties(paramsSchema);
  const requiredFields = paramsSchema.required || [];
  const requiredSet = new Set(requiredFields);

  if (Object.keys(properties).length > 0) {
    // Generate required fields first
    if (requiredFields.length > 0) {
      content += `    # Required fields from AsyncAPI spec
`;
      requiredFields.forEach(fieldName => {
        const fieldSchema = properties[fieldName];
        if (fieldSchema) {
          const pythonType = getPythonTypeFromSchema(fieldSchema);
          const description = getDescription(fieldSchema, `${fieldName} parameter`);
          const alias = getFieldAlias(fieldName);
          
          if (alias) {
            content += `    ${toSnakeCase(fieldName)}: ${pythonType} = Field(description="${description}", alias="${alias}")
`;
          } else {
            content += `    ${toSnakeCase(fieldName)}: ${pythonType} = Field(description="${description}")
`;
          }
        }
      });
      content += `
`;
    }

    // Generate optional fields
    const optionalFields = Object.keys(properties).filter(field => !requiredSet.has(field));
    if (optionalFields.length > 0) {
      content += `    # Optional fields from AsyncAPI spec
`;
      optionalFields.forEach(fieldName => {
        const fieldSchema = properties[fieldName];
        if (fieldSchema) {
          const pythonType = getPythonTypeFromSchema(fieldSchema);
          const description = getDescription(fieldSchema, `${fieldName} parameter`);
          const alias = getFieldAlias(fieldName);
          
          if (alias) {
            content += `    ${toSnakeCase(fieldName)}: Optional[${pythonType}] = Field(default=None, description="${description}", alias="${alias}")
`;
          } else {
            content += `    ${toSnakeCase(fieldName)}: Optional[${pythonType}] = Field(default=None, description="${description}")
`;
          }
        }
      });
    }
  } else {
    // If no properties found, create a generic params class
    content += `    # Generic parameters - actual structure depends on the request
    pass
`;
  }

  content += `
    model_config = ConfigDict(
        extra="allow",
        validate_assignment=True,
        use_enum_values=True,
        populate_by_name=True
    )


`;

  return content;
}

/*
 * Generate main class based on schema structure
 */
function generateMainClass(className, schema, message, isEvent, isRequestMessage) {
  const description = getDescription(message) || getDescription(schema) || `${className} model`;
  
  let content = `class ${className}(BaseModel):
    """
    ${description}
    """
`;

  // Parse properties from schema
  let properties = getProperties(schema);

  // For event models, check if there's a wrapper 'event' property with the actual fields
  if (isEvent && properties.event) {
    // Check if 'event' is an object with properties inside
    const eventProp = properties.event;
    let eventProperties = null;
    
    try {
      if (eventProp && typeof eventProp.json === 'function') {
        const eventData = eventProp.json();
        if (eventData && eventData.type === 'object' && eventData.properties) {
          eventProperties = eventData.properties;
        }
      } else if (eventProp && eventProp.properties) {
        eventProperties = getProperties(eventProp);
      } else if (eventProp && eventProp._json && eventProp._json.properties) {
        eventProperties = eventProp._json.properties;
      }
    } catch (e) {
      console.warn('Error accessing event properties:', e.message);
    }
    
    // If we found properties inside the event wrapper, use those instead
    if (eventProperties && Object.keys(eventProperties).length > 0) {
      properties = eventProperties;
    }
  }

  // For request messages, flatten the params into the main class
  if (isRequestMessage && properties.params) {
    // Get params schema and flatten its properties into the main class
    const paramsSchema = properties.params;
    let paramsProperties = {};
    
    try {
      if (paramsSchema && typeof paramsSchema.json === 'function') {
        const paramsData = paramsSchema.json();
        if (paramsData.properties) {
          paramsProperties = paramsData.properties;
        }
      } else if (paramsSchema && paramsSchema.properties) {
        paramsProperties = paramsSchema.properties;
      }
      
      // Generate flattened parameters directly in the request class
      const paramsProps = getProperties(paramsSchema);
      if (Object.keys(paramsProps).length > 0) {
        paramsProperties = paramsProps;
      }
    } catch (e) {
      console.warn('Error accessing params properties:', e.message);
    }

    // Generate fields from flattened params properties
    Object.entries(paramsProperties).forEach(([fieldName, fieldSchema]) => {
      const pythonType = getPythonTypeFromSchema(fieldSchema);
      const description = getDescription(fieldSchema, `${fieldName} parameter`);
      const alias = getFieldAlias(fieldName);
      
      // Check if field is required
      const paramsData = paramsSchema.json ? paramsSchema.json() : paramsSchema;
      const requiredFields = paramsData.required || [];
      const isRequired = requiredFields.includes(fieldName);
      
      // Authentication fields should be COMPLETELY EXCLUDED from request models
      // since they're handled entirely by the client's _add_authentication() method
      const authFields = ['apiKey', 'signature', 'timestamp'];
      const isAuthField = authFields.includes(fieldName);
      
      // Skip authentication fields entirely - don't include them in the model
      if (isAuthField) {
        return; // Skip this field completely
      }
      
      if (alias) {
        if (isRequired) {
          content += `    ${toSnakeCase(fieldName)}: ${pythonType} = Field(description="${description}", alias="${alias}")
`;
        } else {
          content += `    ${toSnakeCase(fieldName)}: Optional[${pythonType}] = Field(default=None, description="${description}", alias="${alias}")
`;
        }
      } else {
        if (isRequired) {
          content += `    ${toSnakeCase(fieldName)}: ${pythonType} = Field(description="${description}")
`;
        } else {
          content += `    ${toSnakeCase(fieldName)}: Optional[${pythonType}] = Field(default=None, description="${description}")
`;
        }
      }
    });
  } else {
    // Generate fields from actual schema properties (for non-request or non-nested models)
    // Track used field names to avoid duplicates
    const usedFieldNames = new Set();
    
    Object.entries(properties).forEach(([fieldName, fieldSchema]) => {
      // Skip id, method, and params for request messages since we're flattening
      if (isRequestMessage && (fieldName === 'id' || fieldName === 'method' || fieldName === 'params')) {
        return;
      }
      
      const pythonType = getFieldTypeFromSchema(fieldName, fieldSchema, className);
      const description = getDescription(fieldSchema, `${fieldName} field`);
      
      // Generate Python field name from description (like Go template does)
      let pythonFieldName = generatePythonFieldNameFromDescription(fieldName, fieldSchema, usedFieldNames);
      usedFieldNames.add(pythonFieldName);
      
      // For single-letter fields or fields that differ from Python name, always use alias
      const needsAlias = fieldName !== pythonFieldName || fieldName.length === 1 || 
                        fieldName !== toSnakeCase(fieldName);
      
      if (needsAlias) {
        content += `    ${pythonFieldName}: Optional[${pythonType}] = Field(default=None, description="${description}", alias="${fieldName}")
`;
      } else {
        content += `    ${pythonFieldName}: Optional[${pythonType}] = Field(default=None, description="${description}")
`;
      }
    });
  }

  content += `
    model_config = ConfigDict(
        extra="allow",
        validate_assignment=True,
        use_enum_values=True,
        populate_by_name=True
    )

    def __str__(self) -> str:
        """String representation of the model"""
        return self.model_dump_json()


`;

  return content;
}

/*
 * Get Python type for a field based on schema and context
 */
function getFieldTypeFromSchema(fieldName, fieldSchema, parentClassName) {
  // Handle special field types based on context
  if (fieldName === 'id') {
    return 'Union[int, str]';
  } else if (fieldName === 'status') {
    return 'int';
  } else if (fieldName === 'rateLimits') {
    return `List[${parentClassName}RateLimits]`;
  } else if (fieldName === 'result') {
    return getResultType(fieldSchema, parentClassName);
  } else if (fieldName === 'params' && parentClassName.includes('Request')) {
    return `${parentClassName}Params`;
  } else {
    return getPythonTypeFromSchema(fieldSchema);
  }
}

/*
 * Get result type based on actual schema structure
 */
function getResultType(resultSchema, parentClassName) {
  // Handle AsyncAPI objects - try to get JSON representation
  let schemaData = resultSchema;
  try {
    if (resultSchema && typeof resultSchema.json === 'function') {
      schemaData = resultSchema.json();
    } else if (resultSchema && resultSchema._json) {
      schemaData = resultSchema._json;
    }
  } catch (e) {
    console.warn('Error accessing schema JSON:', e.message);
  }
  
  // Now work with the JSON schema data
  if (schemaData.type === 'array') {
    if (schemaData.items?.type === 'array') {
      // Array of arrays (like klines: [[timestamp, open, high, low, close, volume...]])
      return 'List[List[Any]]';
    } else if (schemaData.items?.type === 'object') {
      // Check if the array items have defined properties
      if (schemaData.items.properties && Object.keys(schemaData.items.properties).length > 0) {
        // Array of objects with defined properties - use nested class
        // For result field, we generate a ResultItem class
        return `List[${parentClassName}ResultItem]`;
      } else {
        // Array of generic objects without defined structure
        return 'List[Dict[str, Any]]';
      }
    } else {
      return 'List[Any]';
    }
  } else if (schemaData.type === 'object' && schemaData.properties) {
    // Object with properties - use nested Result class
    return `${parentClassName}Result`;
  } else if (schemaData.type === 'object') {
    // Generic object
    return 'Dict[str, Any]';
  } else {
    return getPythonTypeFromSchema(schemaData);
  }
}

/*
 * Convert AsyncAPI schema to Python type
 */
function getPythonTypeFromSchema(schema) {
  if (!schema) return 'Any';
  
  // Handle AsyncAPI objects - try to get JSON representation
  let schemaData = schema;
  try {
    if (schema && typeof schema.json === 'function') {
      schemaData = schema.json();
    } else if (schema && schema._json) {
      schemaData = schema._json;
    }
  } catch (e) {
    // Fallback to original schema
  }
  
  const type = schemaData.type;
  const format = schemaData.format;
  
  switch (type) {
    case 'string':
      if (schemaData.enum) {
        return `Literal[${schemaData.enum.map(v => `"${v}"`).join(', ')}]`;
      }
      return 'str';
    case 'integer':
      return 'int';
    case 'number':
      return 'float';
    case 'boolean':
      return 'bool';
    case 'array':
      const itemType = getPythonTypeFromSchema(schemaData.items);
      return `List[${itemType}]`;
    case 'object':
      return 'Dict[str, Any]';
    default:
      return 'Any';
  }
}

/*
 * Get field alias for camelCase to snake_case conversion
 * Automatically creates aliases for any camelCase field name
 */
function getFieldAlias(fieldName) {
  // Check if the field name is in camelCase (contains lowercase followed by uppercase)
  const isCamelCase = /[a-z][A-Z]/.test(fieldName);
  
  if (isCamelCase) {
    // Field is already in camelCase, so it should use itself as alias
    // This means snake_case Python field names will map back to camelCase for API
    return fieldName;
  }
  
  // For snake_case field names, check if they should have camelCase aliases
  // Convert snake_case to camelCase for the alias
  const snakeCasePattern = /_[a-z]/g;
  if (snakeCasePattern.test(fieldName)) {
    // Convert snake_case to camelCase
    const camelCaseAlias = fieldName.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
    return camelCaseAlias;
  }
  
  // Special case mappings for fields that don't follow standard patterns
  const specialMappings = {
    'apiKey': 'apiKey',  // Already camelCase, keep as is
    'recv_window': 'recvWindow',
    'time_zone': 'timeZone'
  };
  
  return specialMappings[fieldName] || null;
}

/*
 * Generate component schema file for event schemas
 */
function generateComponentSchemaFile(schemaName, schema) {
  const className = toPascalCase(schemaName);
  
  let content = `from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Union, List, Dict, Any, Literal
from datetime import datetime
from decimal import Decimal


class ${className}(BaseModel):
    """
    ${schema.description || `${className} model from component schemas`}
    """
`;

  // Check if this is an event schema with wrapped structure
  let propertiesToGenerate = schema.properties;
  
  // For event schemas, check if there's a single 'event' property that contains the actual fields
  if (schema.isEvent && schema.properties && schema.properties.event && 
      schema.properties.event.type === 'object' && schema.properties.event.properties) {
    // Use the properties from inside the 'event' wrapper
    propertiesToGenerate = schema.properties.event.properties;
  }

  if (propertiesToGenerate) {
    // Track used field names to avoid duplicates
    const usedFieldNames = new Set();
    
    Object.entries(propertiesToGenerate).forEach(([fieldName, fieldSchema]) => {
      const pythonType = getPythonTypeFromSchema(fieldSchema);
      const description = getDescription(fieldSchema, `${fieldName} field`);
      
      // Generate Python field name from description (like Go template does)
      let pythonFieldName = generatePythonFieldNameFromDescription(fieldName, fieldSchema, usedFieldNames);
      usedFieldNames.add(pythonFieldName);
      
      // For single-letter fields or fields that differ from Python name, always use alias
      const needsAlias = fieldName !== pythonFieldName || fieldName.length === 1 || 
                        fieldName !== toSnakeCase(fieldName);
      
      if (needsAlias) {
        content += `    ${pythonFieldName}: Optional[${pythonType}] = Field(default=None, description="${description}", alias="${fieldName}")
`;
      } else {
        content += `    ${pythonFieldName}: Optional[${pythonType}] = Field(default=None, description="${description}")
`;
      }
    });
  }

  content += `
    model_config = ConfigDict(
        extra="allow",
        validate_assignment=True,
        use_enum_values=True,
        populate_by_name=True
    )

    def __str__(self) -> str:
        """String representation of the model"""
        return self.model_dump_json()


`;

  return content;
}

/*
 * Utility functions
 */
function toPascalCase(str) {
  // If the string is already in camelCase or PascalCase, preserve internal capitalization
  if (!/[_\-\.]/.test(str)) {
    // Just ensure first letter is uppercase
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  // For strings with delimiters, convert each word
  return str.split(/[_\-\.]/).map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join('');
}

/*
 * Generate Python field name from description (similar to Go template approach)
 * Converts descriptions to readable snake_case field names
 */
function generatePythonFieldNameFromDescription(originalFieldName, fieldSchema, usedFieldNames) {
  // First try to generate from description
  const description = getDescription(fieldSchema, '');
  
  // Check if description is just "{fieldName} property" or similar generic patterns
  const genericPatterns = [
    `${originalFieldName} property`,
    `${originalFieldName} field`,
    `${originalFieldName} parameter`,
    'Property description'
  ];
  
  const isGenericDescription = genericPatterns.some(pattern => 
    description.toLowerCase() === pattern.toLowerCase()
  );
  
  if (description && !isGenericDescription && description !== `${originalFieldName} field`) {
    // Clean and convert description to Python snake_case field name
    let fieldName = description
      .replace(/\s*\([^)]*\)\s*/g, '') // Remove (xxx) patterns
      .replace(/\bproperty\b/gi, '') // Remove the word "property"
      .replace(/\bfield\b/gi, '') // Remove the word "field"
      .replace(/\bparameter\b/gi, '') // Remove the word "parameter"
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .trim()
      .split(/\s+/) // Split on whitespace
      .filter(word => word.length > 0) // Remove empty strings
      .map(word => word.toLowerCase()) // All lowercase for Python
      .join('_'); // Join with underscores for snake_case
    
    // Ensure it's a valid Python identifier and not empty
    if (fieldName && /^[a-z][a-z0-9_]*$/.test(fieldName)) {
      // Handle collisions
      let finalFieldName = fieldName;
      let counter = 2;
      while (usedFieldNames.has(finalFieldName)) {
        finalFieldName = fieldName + '_' + counter.toString();
        counter++;
      }
      return finalFieldName;
    }
  }
  
  // Fallback to original field name handling for single letters
  if (originalFieldName.length === 1) {
    if (originalFieldName === originalFieldName.toUpperCase()) {
      // Single uppercase letter: E -> e_upper (fallback if no good description)
      return originalFieldName.toLowerCase() + '_upper';
    } else {
      // Single lowercase letter: e -> e
      return originalFieldName.toLowerCase();
    }
  }
  
  // Multi-character field names: use standard snake_case conversion
  return toSnakeCase(originalFieldName);
}

function toSnakeCase(str) {
  // For single letter fields, preserve case distinction
  if (str.length === 1) {
    return str.toLowerCase();
  }
  
  // For fields that are already lowercase, return as-is
  if (str === str.toLowerCase()) {
    return str;
  }
  
  // Convert camelCase/PascalCase to snake_case
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/*
 * Generate the models/__init__.py file with all necessary imports
 */
function generateModelsInitFile(modelFiles) {
  const imports = [];
  const exports = [];
  
  modelFiles.forEach(modelFile => {
    if (modelFile.name.endsWith('.py') && modelFile.name !== '__init__.py') {
      const moduleName = modelFile.name.replace('.py', '');
      
      // Extract class names from the model file content
      const classMatches = modelFile.content.match(/^class (\w+)\(BaseModel\):/gm);
      if (classMatches) {
        classMatches.forEach(match => {
          const className = match.match(/class (\w+)\(/)[1];
          imports.push(`from .${moduleName} import ${className}`);
          exports.push(`    "${className}",`);
        });
      }
    }
  });

  return `"""
Models package for Binance WebSocket API

This package contains all the Pydantic models for requests, responses, and events.
Generated from AsyncAPI specification.
"""

# Import all model classes
${imports.join('\n')}

# Export all classes for easy import
__all__ = [
${exports.join('\n')}
]
`;
}