// import { detectModuleName } from '../../go/components/ModuleRegistry.js'; // Removed to fix import issue

/**
 * Detect module name from AsyncAPI specification
 */
function detectModuleName(asyncapi, context = {}) {
  try {
    // Method 1: Check asyncapi info title
    const info = asyncapi.info();
    if (info && typeof info.title === 'function') {
      const title = info.title();
      if (title) {
        const titleLower = title.toLowerCase();
        if (titleLower.includes('spot')) return 'spot';
        if (titleLower.includes('umfutures') || titleLower.includes('usd-m')) return 'umfutures';
        if (titleLower.includes('cmfutures') || titleLower.includes('coin-m')) return 'cmfutures';
        if (titleLower.includes('options')) return 'options';
        if (titleLower.includes('pmargin') || titleLower.includes('portfolio')) return 'pmargin';
      }
    }
    
    // Method 2: Check context for module information
    if (context.moduleName) {
      const moduleName = context.moduleName.toLowerCase();
      if (moduleName.includes('spot')) return 'spot';
      if (moduleName.includes('umfutures') || moduleName.includes('usd-m')) return 'umfutures';
      if (moduleName.includes('cmfutures') || moduleName.includes('coin-m')) return 'cmfutures';
      if (moduleName.includes('options')) return 'options';
      if (moduleName.includes('pmargin') || moduleName.includes('portfolio')) return 'pmargin';
    }
    
    // Method 3: Fallback to default
    return 'spot';
  } catch (error) {
    console.warn('Error detecting module name:', error.message);
    return 'spot';
  }
}

/**
 * Generate Python Pydantic models from AsyncAPI schemas in a single file
 * @param {Object} params - Parameters object
 * @param {Object} params.asyncapi - AsyncAPI document
 * @param {Object} params.context - Generation context
 * @returns {string} Generated Python models content
 */
export function PythonModels({ asyncapi, context }) {
  const { packageName, moduleName } = context;
  const detectedModule = detectModuleName(asyncapi, context);
  
  const schemas = asyncapi.components()?.schemas();
  if (!schemas || !schemas.all || schemas.all().length === 0) {
    return generateEmptyModels();
  }

  const allSchemas = schemas.all();
  let content = [];
  
  // Add imports
  content.push('"""');
  content.push(`Generated Pydantic models for Binance ${packageName.toUpperCase()} WebSocket API`);
  content.push('');
  content.push('This module contains all the data models used by the WebSocket client.');
  content.push('"""');
  content.push('');
  content.push('from pydantic import BaseModel, Field');
  content.push('from typing import Optional, Union, List, Dict, Any');
  content.push('from datetime import datetime');
  content.push('from decimal import Decimal');
  content.push('from enum import Enum');
  content.push('');
  content.push('');

  // Generate models
  allSchemas.forEach(schema => {
    const schemaName = schema.id();
    const modelContent = generatePythonModel(schema, schemaName);
    content.push(modelContent);
    content.push('');
  });

  // Add __all__ export
  const modelNames = allSchemas.map(schema => schema.id()).sort();
  content.push('__all__ = [');
  modelNames.forEach((name, index) => {
    const comma = index < modelNames.length - 1 ? ',' : '';
    content.push(`    "${name}"${comma}`);
  });
  content.push(']');

  return content.join('\n');
}

function generatePythonModel(schema, schemaName) {
  const properties = schema.properties();
  const description = schema.description() || `${schemaName} model`;
  
  let modelContent = [];
  
  // Add class definition with docstring
  modelContent.push(`class ${schemaName}(BaseModel):`);
  modelContent.push(`    """`);
  modelContent.push(`    ${description}`);
  modelContent.push(`    """`);
  
  if (!properties || Object.keys(properties).length === 0) {
    modelContent.push(`    pass`);
  } else {
    // Generate fields
    Object.entries(properties).forEach(([fieldName, fieldSchema]) => {
      const field = generatePythonField(fieldName, fieldSchema);
      modelContent.push(`    ${field}`);
    });
  }
  
  // Add model configuration
  modelContent.push('');
  modelContent.push('    class Config:');
  modelContent.push('        """Pydantic model configuration"""');
  // Check if this is a request or response model
  const isRequestModel = schemaName.toLowerCase().includes('request');
  if (isRequestModel) {
    modelContent.push('        extra = "allow"  # Allow additional parameters for WebSocket requests');
  } else {
    modelContent.push('        extra = "allow"  # Allow additional fields from API responses');
  }
  modelContent.push('        validate_assignment = True  # Validate on assignment');
  modelContent.push('        use_enum_values = True  # Use enum values in serialization');

  return modelContent.join('\n');
}

function generatePythonField(fieldName, fieldSchema) {
  const fieldType = getPythonType(fieldSchema);
  const description = fieldSchema.description() || `${fieldName} field`;
  const isOptional = fieldSchema.required === false || fieldSchema.required === undefined;
  
  let fieldDef = `${fieldName}: `;
  
  if (isOptional) {
    fieldDef += `Optional[${fieldType}] = Field(default=None, description="${description}")`;
  } else {
    fieldDef += `${fieldType} = Field(description="${description}")`;
  }
  
  return fieldDef;
}

function getPythonType(schema) {
  const schemaType = schema.type && schema.type();
  const format = schema.format && schema.format();
  
  switch (schemaType) {
    case 'string':
      if (format === 'date-time') return 'datetime';
      if (format === 'date') return 'datetime';
      return 'str';
      
    case 'integer':
      return 'int';
      
    case 'number':
      if (format === 'double' || format === 'float') return 'float';
      return 'Decimal';  // Use Decimal for precision in financial data
      
    case 'boolean':
      return 'bool';
      
    case 'array':
      const items = schema.items && schema.items();
      if (items) {
        const itemType = getPythonType(items);
        return `List[${itemType}]`;
      }
      return 'List[Any]';
      
    case 'object':
      return 'Dict[str, Any]';
      
    default:
      // Check if it's a reference to another schema
      if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        return refName;
      }
      return 'Any';
  }
}

function generateEmptyModels() {
  return `"""
Generated Pydantic models for Binance WebSocket API

No models were found in the AsyncAPI specification.
"""

from pydantic import BaseModel

class EmptyModel(BaseModel):
    """Empty model placeholder"""
    pass

__all__ = ['EmptyModel']
`;
}

export default PythonModels;