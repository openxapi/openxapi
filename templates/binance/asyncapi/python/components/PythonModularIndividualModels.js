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
  
  // Generate regular message models
  messages.forEach((messageData, messageName) => {
    const modelContent = generatePythonModelFile(messageName, messageData.payload, messageData.message, componentSchemas, messageData.isEvent);
    modelFiles.push({
      name: `${toSnakeCase(messageName)}.py`,
      content: modelContent
    });
  });

  // Generate component schema models (for event schemas)
  const generatedTypeNames = new Set();
  messages.forEach((messageData, messageName) => {
    const className = toPascalCase(messageName);
    generatedTypeNames.add(className);
  });
  
  componentSchemas.forEach((schema, schemaName) => {
    // Skip if we already generated this type from channel messages
    const componentTypeName = toPascalCase(schemaName);
    if (generatedTypeNames.has(componentTypeName)) {
      return;
    }
    
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
  
  let content = `from pydantic import BaseModel, Field, validator
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
    } else if (fieldName === 'result' && schemaData.type === 'object' && schemaData.properties) {
      // Generate Result nested class for object results
      nestedClasses += generateResultClass(parentClassName, schemaData);
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
    class Config:
        """Pydantic model configuration"""
        extra = "allow"
        validate_assignment = True
        use_enum_values = True


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
    class Config:
        """Pydantic model configuration"""
        extra = "allow"
        validate_assignment = True
        use_enum_values = True


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
    class Config:
        """Pydantic model configuration"""
        extra = "allow"
        validate_assignment = True
        use_enum_values = True


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
  const properties = getProperties(schema);

  // Generate fields from actual schema properties
  Object.entries(properties).forEach(([fieldName, fieldSchema]) => {
    const pythonType = getFieldTypeFromSchema(fieldName, fieldSchema, className);
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

  content += `
    class Config:
        """Pydantic model configuration"""
        extra = "allow"
        validate_assignment = True
        use_enum_values = True

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
      // Array of objects (like trades: [{id: 1, price: "1.00", qty: "1.00"}, ...])
      return 'List[Dict[str, Any]]';
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
 */
function getFieldAlias(fieldName) {
  const camelCaseFields = {
    'timeInForce': 'timeInForce',
    'newClientOrderId': 'newClientOrderId',
    'icebergQty': 'icebergQty',
    'stopPrice': 'stopPrice',
    'trailingDelta': 'trailingDelta',
    'recvWindow': 'recvWindow',
    'startTime': 'startTime',
    'endTime': 'endTime',
    'orderId': 'orderId',
    'origClientOrderId': 'origClientOrderId',
    'clientOrderId': 'clientOrderId',
    'apiKey': 'apiKey',
    'origQty': 'origQty',
    'executedQty': 'executedQty',
    'transactTime': 'transactTime',
    'intervalNum': 'intervalNum',
    'rateLimitType': 'rateLimitType'
  };
  
  return camelCaseFields[fieldName] || null;
}

/*
 * Generate component schema file for event schemas
 */
function generateComponentSchemaFile(schemaName, schema) {
  const className = toPascalCase(schemaName);
  
  let content = `from pydantic import BaseModel, Field
from typing import Optional, Union, List, Dict, Any, Literal
from datetime import datetime
from decimal import Decimal


class ${className}(BaseModel):
    """
    ${schema.description || `${className} model from component schemas`}
    """
`;

  if (schema.properties) {
    Object.entries(schema.properties).forEach(([fieldName, fieldSchema]) => {
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
    class Config:
        """Pydantic model configuration"""
        extra = "allow"
        validate_assignment = True
        use_enum_values = True

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

function toSnakeCase(str) {
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