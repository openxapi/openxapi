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
 * Generate individual Python Pydantic model files from AsyncAPI schemas
 * @param {Object} params - Parameters object
 * @param {Object} params.asyncapi - AsyncAPI document
 * @param {Object} params.context - Generation context
 * @returns {Array} Array of model file objects
 */
export function PythonIndividualModels({ asyncapi, context }) {
  console.log("🐍 PythonIndividualModels called - IMPROVED VERSION WITH PROPER TYPES!");
  const { packageName, moduleName } = context;
  const detectedModule = detectModuleName(asyncapi, context);
  
  // Safe schema access using the same pattern as Go template
  let allSchemas = [];
  
  try {
    const components = asyncapi.components();
    if (components) {
      const schemas = components.schemas();
      if (schemas) {
        // Try AsyncAPI 3.0 method first
        if (typeof schemas.all === 'function') {
          const schemasAll = schemas.all();
          if (schemasAll && Array.isArray(schemasAll)) {
            allSchemas = schemasAll;
          }
        }
        // Fallback to direct access if available
        else if (schemas instanceof Map) {
          allSchemas = Array.from(schemas.values());
        }
        // Another fallback for object-like schemas
        else if (typeof schemas === 'object' && schemas !== null) {
          allSchemas = Object.values(schemas);
        }
      }
    }
    
    // Also check for schemas via JSON access (like Go template does)
    if (allSchemas.length === 0) {
      const json = asyncapi.json();
      if (json && json.components && json.components.schemas) {
        // Convert JSON schemas to schema-like objects
        allSchemas = Object.entries(json.components.schemas).map(([name, schema]) => ({
          id: () => name,
          properties: () => schema.properties || {},
          type: () => schema.type || 'object',
          description: () => schema.description || `${name} model`,
          required: () => schema.required || []
        }));
      }
    }
  } catch (error) {
    console.warn('Error accessing schemas:', error.message);
    allSchemas = [];
  }

  // Return empty models structure if no schemas found
  if (allSchemas.length === 0) {
    return [{
      name: '__init__.py',
      content: generateEmptyInitFile()
    }];
  }

  const modelFiles = [];

  // Generate individual model files
  allSchemas.forEach(schema => {
    try {
      const schemaName = (typeof schema.id === 'function') ? schema.id() : schema.id || 'UnknownSchema';
      const modelContent = generatePythonModelFile(schema, schemaName, allSchemas, detectedModule);
      
      if (modelContent) {
        const filename = schemaNameToFilename(schemaName);
        modelFiles.push({
          name: filename,
          content: modelContent
        });
      }
    } catch (error) {
      console.warn('Error generating model file for schema:', error.message);
    }
  });

  // Generate __init__.py with all exports
  const initContent = generateInitFile(allSchemas);
  modelFiles.push({
    name: '__init__.py',
    content: initContent
  });

  return modelFiles;
}

function generatePythonModelFile(schema, schemaName, allSchemas, module) {
  const description = schema.description() || `${schemaName} model`;
  
  let imports = new Set([
    'from pydantic import BaseModel, Field',
    'from typing import Optional, Union, List, Dict, Any, Literal',
    'from datetime import datetime',
    'from decimal import Decimal'
  ]);
  
  let content = [];
  
  // Generate nested classes first
  const nestedClasses = generateNestedClasses(schema, schemaName, allSchemas, imports);
  
  // Generate main model class
  const mainClass = generateMainModelClass(schema, schemaName, allSchemas, imports);
  
  // Combine imports and content
  const importsArray = Array.from(imports).sort();
  content.push(importsArray.join('\n'));
  content.push('');
  
  if (nestedClasses) {
    content.push(nestedClasses);
    content.push('');
  }
  
  content.push(mainClass);
  
  return content.join('\n') + '\n';
}

function generateNestedClasses(schema, schemaName, allSchemas, imports) {
  // Safe property access with defensive programming
  let properties;
  try {
    if (typeof schema.properties === 'function') {
      properties = schema.properties();
    } else {
      properties = schema.properties;
    }
  } catch (error) {
    console.warn('Error accessing schema properties in generateNestedClasses:', error.message);
    return '';
  }

  if (!properties) {
    return '';
  }

  let nestedClasses = [];
  
  // Convert Map or other object types to plain object for iteration
  let propertiesToIterate;
  if (properties instanceof Map) {
    propertiesToIterate = {};
    for (const [key, value] of properties) {
      propertiesToIterate[key] = value;
    }
  } else if (typeof properties === 'object') {
    propertiesToIterate = properties;
  } else {
    return '';
  }
  
  Object.entries(propertiesToIterate).forEach(([fieldName, fieldSchema]) => {
    if (!fieldSchema) return;
    
    try {
      const fieldType = (typeof fieldSchema.type === 'function') ? fieldSchema.type() : fieldSchema.type;
      
      if (fieldType === 'object') {
        const nestedClassName = `${schemaName}${capitalize(fieldName)}`;
        const nestedClass = generateNestedClass(fieldSchema, nestedClassName, allSchemas, imports);
        if (nestedClass) {
          nestedClasses.push(nestedClass);
        }
      } else if (fieldType === 'array') {
        let items;
        try {
          items = (typeof fieldSchema.items === 'function') ? fieldSchema.items() : fieldSchema.items;
        } catch (e) {
          items = null;
        }
        
        if (items) {
          const itemType = (typeof items.type === 'function') ? items.type() : items.type;
          if (itemType === 'object') {
            const nestedClassName = `${schemaName}${capitalize(fieldName)}Item`;
            const nestedClass = generateNestedClass(items, nestedClassName, allSchemas, imports);
            if (nestedClass) {
              nestedClasses.push(nestedClass);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Error processing field ${fieldName}:`, error.message);
    }
  });
  
  return nestedClasses.join('\n\n');
}

function generateNestedClass(schema, className, allSchemas, imports) {
  // Safe property access
  let properties;
  try {
    if (typeof schema.properties === 'function') {
      properties = schema.properties();
    } else {
      properties = schema.properties;
    }
  } catch (error) {
    console.warn(`Error accessing properties for ${className}:`, error.message);
    return `class ${className}(BaseModel):
    """Nested object structure"""
    pass`;
  }

  if (!properties) {
    return `class ${className}(BaseModel):
    """Nested object structure"""
    pass`;
  }

  let classContent = [];
  classContent.push(`class ${className}(BaseModel):`);
  classContent.push(`    """Nested object structure"""`);
  
  // Convert Map or other object types to plain object for iteration
  let propertiesToIterate;
  if (properties instanceof Map) {
    propertiesToIterate = {};
    for (const [key, value] of properties) {
      propertiesToIterate[key] = value;
    }
  } else if (typeof properties === 'object') {
    propertiesToIterate = properties;
  } else {
    classContent.push(`    pass`);
    return classContent.join('\n');
  }
  
  const propEntries = Object.entries(propertiesToIterate);
  if (propEntries.length === 0) {
    classContent.push(`    pass`);
  } else {
    propEntries.forEach(([fieldName, fieldSchema]) => {
      if (fieldSchema) {
        try {
          const field = generatePythonField(fieldName, fieldSchema, allSchemas, imports);
          classContent.push(`    ${field}`);
        } catch (error) {
          console.warn(`Error generating field ${fieldName}:`, error.message);
        }
      }
    });
  }
  
  return classContent.join('\n');
}

/**
 * Generate explicit parameter fields for request models like Go SDK
 * Extracts fields from params property and generates them as individual model attributes
 */
function generateRequestModelFields(propertiesToIterate, classContent, allSchemas, imports, schemaName) {
  // First add the basic WebSocket request fields
  classContent.push(`    id: Optional[Union[int, str]] = Field(default=None, description="Request ID - can be int or string")`);
  classContent.push(`    method: Optional[str] = Field(default=None, description="WebSocket method name - auto-set by client")`);
  
  // Check if there's a params property with sub-properties
  const paramsProperty = propertiesToIterate.params;
  if (paramsProperty && paramsProperty.properties) {
    let paramsProperties;
    try {
      if (typeof paramsProperty.properties === 'function') {
        paramsProperties = paramsProperty.properties();
      } else {
        paramsProperties = paramsProperty.properties;
      }
    } catch (error) {
      paramsProperties = null;
    }
    
    if (paramsProperties) {
      // Convert Map or other object types to plain object
      let paramsToIterate;
      if (paramsProperties instanceof Map) {
        paramsToIterate = {};
        for (const [key, value] of paramsProperties) {
          paramsToIterate[key] = value;
        }
      } else if (typeof paramsProperties === 'object') {
        paramsToIterate = paramsProperties;
      } else {
        paramsToIterate = {};
      }
      
      // Get required fields from params schema
      let requiredParams = [];
      try {
        if (paramsProperty.required) {
          if (typeof paramsProperty.required === 'function') {
            requiredParams = paramsProperty.required() || [];
          } else if (Array.isArray(paramsProperty.required)) {
            requiredParams = paramsProperty.required;
          }
        }
      } catch (error) {
        requiredParams = [];
      }
      
      // Generate individual parameter fields
      Object.entries(paramsToIterate).forEach(([paramName, paramSchema]) => {
        if (paramSchema) {
          try {
            const isRequired = requiredParams.includes(paramName);
            const field = generateExplicitParameterField(paramName, paramSchema, allSchemas, imports, isRequired);
            classContent.push(`    ${field}`);
          } catch (error) {
            // Silently skip field generation errors
          }
        }
      });
    }
  }
  
  // Also add a params field for backward compatibility and flexibility
  classContent.push(`    params: Optional[Dict[str, Any]] = Field(default=None, description="Additional parameters - for backward compatibility")`);
}

/**
 * Generate explicit parameter field with proper types and validation
 */
function generateExplicitParameterField(paramName, paramSchema, allSchemas, imports, isRequired = false) {
  const pythonFieldName = toPythonFieldName(paramName);
  const fieldType = getPythonFieldType(paramSchema, allSchemas, imports, '', paramName);
  
  // Safe access to description
  let description;
  try {
    description = (typeof paramSchema.description === 'function') ? paramSchema.description() : paramSchema.description;
  } catch (error) {
    description = null;
  }
  description = description || getDescriptionFromExamples(paramSchema) || `${paramName} parameter`;
  
  let fieldDef = `${pythonFieldName}: `;
  
  // Add Optional wrapper if field is not required
  if (!isRequired) {
    if (!fieldType.startsWith('Optional[')) {
      fieldDef += `Optional[${fieldType}] = Field(default=None`;
    } else {
      fieldDef += `${fieldType} = Field(default=None`;
    }
  } else {
    fieldDef += `${fieldType} = Field(`;
  }
  
  // Add field description and constraints
  fieldDef += `, description="${description}"`;
  
  // Add validation constraints with safe access
  try {
    const minimum = (typeof paramSchema.minimum === 'function') ? paramSchema.minimum() : paramSchema.minimum;
    if (minimum !== undefined) {
      fieldDef += `, ge=${minimum}`;
    }
  } catch (error) {
    // Minimum constraint not available
  }
  
  try {
    const maximum = (typeof paramSchema.maximum === 'function') ? paramSchema.maximum() : paramSchema.maximum;
    if (maximum !== undefined) {
      fieldDef += `, le=${maximum}`;
    }
  } catch (error) {
    // Maximum constraint not available
  }
  
  try {
    const minLength = (typeof paramSchema.minLength === 'function') ? paramSchema.minLength() : paramSchema.minLength;
    if (minLength !== undefined) {
      fieldDef += `, min_length=${minLength}`;
    }
  } catch (error) {
    // MinLength constraint not available
  }
  
  try {
    const maxLength = (typeof paramSchema.maxLength === 'function') ? paramSchema.maxLength() : paramSchema.maxLength;
    if (maxLength !== undefined) {
      fieldDef += `, max_length=${maxLength}`;
    }
  } catch (error) {
    // MaxLength constraint not available
  }
  
  // Add JSON field alias if different from Python field name
  if (paramName !== pythonFieldName) {
    fieldDef += `, alias="${paramName}"`;
  }
  
  fieldDef += ')';
  
  return fieldDef;
}

function generateMainModelClass(schema, schemaName, allSchemas, imports) {
  // Safe access to description
  let description;
  try {
    description = (typeof schema.description === 'function') ? schema.description() : schema.description;
  } catch (error) {
    description = `${schemaName} model`;
  }
  description = description || `${schemaName} model`;
  
  // Safe property access
  let properties;
  try {
    if (typeof schema.properties === 'function') {
      properties = schema.properties();
    } else {
      properties = schema.properties;
    }
  } catch (error) {
    console.warn(`Error accessing properties for ${schemaName}:`, error.message);
    properties = null;
  }
  
  let classContent = [];
  classContent.push(`class ${schemaName}(BaseModel):`);
  classContent.push(`    """`);
  classContent.push(`    ${description}`);
  classContent.push(`    """`);
  
  const isRequestModel = schemaName.toLowerCase().includes('request');
  
  if (!properties) {
    // For request models without properties, add basic WebSocket fields  
    if (isRequestModel) {
      classContent.push(`    id: Optional[Union[int, str]] = Field(default=None, description="Request ID - can be int or string")`);
      classContent.push(`    method: Optional[str] = Field(default=None, description="WebSocket method name - auto-set by client")`);
    } else {
      classContent.push(`    pass`);
    }
  } else {
    // Convert Map or other object types to plain object for iteration
    let propertiesToIterate;
    if (properties instanceof Map) {
      propertiesToIterate = {};
      for (const [key, value] of properties) {
        propertiesToIterate[key] = value;
      }
    } else if (typeof properties === 'object') {
      propertiesToIterate = properties;
    } else {
      // For request models without valid properties, add basic WebSocket fields
      if (isRequestModel) {
        classContent.push(`    id: Optional[Union[int, str]] = Field(default=None, description="Request ID - can be int or string")`);
        classContent.push(`    method: Optional[str] = Field(default=None, description="WebSocket method name - auto-set by client")`);
      } else {
        classContent.push(`    pass`);
      }
      return classContent.join('\n');
    }
    
    const propEntries = Object.entries(propertiesToIterate);
    if (propEntries.length === 0) {
      // For request models with empty properties, add basic WebSocket fields
      if (isRequestModel) {
        classContent.push(`    id: Optional[Union[int, str]] = Field(default=None, description="Request ID - can be int or string")`);
        classContent.push(`    method: Optional[str] = Field(default=None, description="WebSocket method name - auto-set by client")`);
      } else {
        classContent.push(`    pass`);
      }
    } else {
      // For request models, generate explicit parameter fields from params schema
      if (isRequestModel) {
        generateRequestModelFields(propertiesToIterate, classContent, allSchemas, imports, schemaName);
      } else {
        // For response models and other types, use standard field generation
        propEntries.forEach(([fieldName, fieldSchema]) => {
          if (fieldSchema) {
            try {
              console.log(`Generating field ${fieldName} for ${schemaName} with schema:`, JSON.stringify(fieldSchema, null, 2));
              const field = generatePythonField(fieldName, fieldSchema, allSchemas, imports, schemaName);
              classContent.push(`    ${field}`);
            } catch (error) {
              console.warn(`Error generating field ${fieldName}:`, error.message);
            }
          }
        });
      }
    }
  }
  
  // Add utility methods like Go models
  classContent.push('');
  classContent.push('    class Config:');
  classContent.push('        """Pydantic model configuration"""');
  // Allow extra parameters for request models to support flexible parameter passing
  if (isRequestModel) {
    classContent.push('        extra = "allow"  # Allow additional parameters for WebSocket requests');
  } else {
    classContent.push('        extra = "allow"  # Allow additional fields from API responses - FIXED');
  }
  classContent.push('        validate_assignment = True');
  classContent.push('        use_enum_values = True');
  
  // Add helper methods for request models
  if (isRequestModel) {
    classContent.push('');
    classContent.push('    def to_params_dict(self) -> Dict[str, Any]:');
    classContent.push('        """Convert all non-None explicit fields to a params dictionary"""');
    classContent.push('        params = {}');
    classContent.push('        # Get all field values excluding id, method, and params');
    classContent.push('        for field_name, field_info in self.model_fields.items():');
    classContent.push('            if field_name not in [\"id\", \"method\", \"params\"]:');
    classContent.push('                value = getattr(self, field_name)');
    classContent.push('                if value is not None:');
    classContent.push('                    # Use field alias if defined, otherwise use field name');
    classContent.push('                    key = field_info.alias if field_info.alias else field_name');
    classContent.push('                    params[key] = value');
    classContent.push('        ');
    classContent.push('        # Also include any additional params from the params field');
    classContent.push('        if self.params and isinstance(self.params, dict):');
    classContent.push('            params.update(self.params)');
    classContent.push('        ');
    classContent.push('        return params');
    
    classContent.push('');
    classContent.push('    def set_param(self, key: str, value: Any) -> None:');
    classContent.push('        """Set a parameter - tries explicit field first, then params dict"""');
    classContent.push('        # Try to find explicit field with this key or alias');
    classContent.push('        field_found = False');
    classContent.push('        for field_name, field_info in self.model_fields.items():');
    classContent.push('            if field_name not in [\"id\", \"method\", \"params\"]:');
    classContent.push('                if field_name == key or (field_info.alias and field_info.alias == key):');
    classContent.push('                    setattr(self, field_name, value)');
    classContent.push('                    field_found = True');
    classContent.push('                    break');
    classContent.push('        ');
    classContent.push('        # If no explicit field found, add to params dict');
    classContent.push('        if not field_found:');
    classContent.push('            if self.params is None:');
    classContent.push('                self.params = {}');
    classContent.push('            self.params[key] = value');
    
    classContent.push('');
    classContent.push('    def get_param(self, key: str, default: Any = None) -> Any:');
    classContent.push('        """Get a parameter - checks explicit fields first, then params dict"""');
    classContent.push('        # Try to find explicit field with this key or alias');
    classContent.push('        for field_name, field_info in self.model_fields.items():');
    classContent.push('            if field_name not in [\"id\", \"method\", \"params\"]:');
    classContent.push('                if field_name == key or (field_info.alias and field_info.alias == key):');
    classContent.push('                    value = getattr(self, field_name)');
    classContent.push('                    return value if value is not None else default');
    classContent.push('        ');
    classContent.push('        # Check params dict');
    classContent.push('        if self.params and isinstance(self.params, dict):');
    classContent.push('            return self.params.get(key, default)');
    classContent.push('        ');
    classContent.push('        return default');
  }
  
  // Add __str__ method
  classContent.push('');
  classContent.push('    def __str__(self) -> str:');
  classContent.push('        """String representation of the model"""');
  classContent.push('        return self.model_dump_json()');
  
  // Add event-specific methods for event models
  if (schemaName.toLowerCase().includes('event')) {
    classContent.push('');
    classContent.push('    def get_event_type(self) -> str:');
    classContent.push('        """Get the event type"""');
    classContent.push(`        return "${schemaName.toLowerCase().replace('event', '')}"`);
    
    classContent.push('');
    classContent.push('    def get_event_time(self) -> Optional[int]:');
    classContent.push('        """Get the event timestamp"""');
    classContent.push('        if hasattr(self, "event") and hasattr(self.event, "event_time"):');
    classContent.push('            return self.event.event_time');
    classContent.push('        return None');
  }
  
  return classContent.join('\n');
}

function generatePythonField(fieldName, fieldSchema, allSchemas, imports, parentClassName = '') {
  // Special handling for params field in request models - generate explicit parameter fields
  if (fieldName === 'params' && parentClassName && parentClassName.toLowerCase().includes('request')) {
    return generateExplicitParamsFields(fieldSchema, allSchemas, imports, parentClassName);
  }
  
  const pythonFieldName = toPythonFieldName(fieldName);
  
  // FORCE PROPER TYPES BASED ON FIELD NAMES AND COMMON PATTERNS
  let fieldType;
  
  // Use smart field name-based type inference for common WebSocket API fields
  if (fieldName === 'id') {
    fieldType = 'Union[int, str]';
  } else if (fieldName === 'status') {
    fieldType = 'int';
  } else if (fieldName === 'method') {
    fieldType = 'str';
  } else if (fieldName.includes('time') || fieldName.includes('Time')) {
    fieldType = 'int';
  } else if (fieldName.includes('count') || fieldName.includes('Count') || 
             fieldName.includes('limit') || fieldName.includes('Limit') ||
             fieldName.includes('id') || fieldName.includes('Id')) {
    fieldType = 'int';
  } else if (fieldName.includes('symbol') || fieldName.includes('Symbol') ||
             fieldName.includes('interval') || fieldName.includes('Interval') ||
             fieldName.includes('type') || fieldName.includes('Type')) {
    fieldType = 'str';
  } else if (fieldName === 'rateLimits' || fieldName === 'rate_limits') {
    // Handle rateLimits as array of objects
    const itemClassName = `${parentClassName}RateLimits`;
    fieldType = `List[${itemClassName}]`;
  } else if (fieldName === 'result') {
    // Handle result as nested object
    const nestedClassName = `${parentClassName}Result`;
    fieldType = `${nestedClassName}`;
  } else {
    // Try the enhanced type mapping function as fallback
    fieldType = getPythonFieldType(fieldSchema, allSchemas, imports, parentClassName, fieldName);
  }
  
  // Safe access to description
  let description;
  try {
    description = (typeof fieldSchema.description === 'function') ? fieldSchema.description() : fieldSchema.description;
  } catch (error) {
    description = null;
  }
  description = description || getDescriptionFromExamples(fieldSchema) || `${fieldName} field`;
  
  const isOptional = !isRequiredField(fieldSchema);
  
  let fieldDef = `${pythonFieldName}: `;
  
  // Add Optional wrapper if field is optional
  if (isOptional) {
    if (!fieldType.startsWith('Optional[') && !fieldType.startsWith('Union[')) {
      fieldDef += `Optional[${fieldType}] = Field(default=None`;
    } else {
      fieldDef += `${fieldType} = Field(default=None`;
    }
  } else {
    fieldDef += `${fieldType} = Field(`;
  }
  
  // Add field description and constraints
  fieldDef += `, description="${description}"`;
  
  // Add validation constraints with safe access
  try {
    const minimum = (typeof fieldSchema.minimum === 'function') ? fieldSchema.minimum() : fieldSchema.minimum;
    if (minimum !== undefined) {
      fieldDef += `, ge=${minimum}`;
    }
  } catch (error) {
    // Minimum constraint not available
  }
  
  try {
    const maximum = (typeof fieldSchema.maximum === 'function') ? fieldSchema.maximum() : fieldSchema.maximum;
    if (maximum !== undefined) {
      fieldDef += `, le=${maximum}`;
    }
  } catch (error) {
    // Maximum constraint not available
  }
  
  try {
    const minLength = (typeof fieldSchema.minLength === 'function') ? fieldSchema.minLength() : fieldSchema.minLength;
    if (minLength !== undefined) {
      fieldDef += `, min_length=${minLength}`;
    }
  } catch (error) {
    // MinLength constraint not available
  }
  
  try {
    const maxLength = (typeof fieldSchema.maxLength === 'function') ? fieldSchema.maxLength() : fieldSchema.maxLength;
    if (maxLength !== undefined) {
      fieldDef += `, max_length=${maxLength}`;
    }
  } catch (error) {
    // MaxLength constraint not available
  }
  
  // Add JSON field alias if different from Python field name
  if (fieldName !== pythonFieldName) {
    fieldDef += `, alias="${fieldName}"`;
  }
  
  fieldDef += ')';
  
  return fieldDef;
}

/**
 * Generate explicit parameter fields from params schema instead of a generic params field
 */
function generateExplicitParamsFields(paramsSchema, allSchemas, imports, parentClassName) {
  let fieldDefinitions = [];
  
  // Get params properties
  let paramsProperties;
  try {
    if (typeof paramsSchema.properties === 'function') {
      paramsProperties = paramsSchema.properties();
    } else {
      paramsProperties = paramsSchema.properties;
    }
  } catch (error) {
    paramsProperties = null;
  }
  
  if (paramsProperties) {
    // Convert Map or other object types to plain object
    let paramsToIterate;
    if (paramsProperties instanceof Map) {
      paramsToIterate = {};
      for (const [key, value] of paramsProperties) {
        paramsToIterate[key] = value;
      }
    } else if (typeof paramsProperties === 'object') {
      paramsToIterate = paramsProperties;
    } else {
      paramsToIterate = {};
    }
    
    // Get required fields from params schema
    let requiredParams = [];
    try {
      if (paramsSchema.required) {
        if (typeof paramsSchema.required === 'function') {
          requiredParams = paramsSchema.required() || [];
        } else if (Array.isArray(paramsSchema.required)) {
          requiredParams = paramsSchema.required;
        }
      }
    } catch (error) {
      requiredParams = [];
    }
    
    // Generate individual parameter fields
    Object.entries(paramsToIterate).forEach(([paramName, paramSchema]) => {
      if (paramSchema) {
        try {
          const isRequired = requiredParams.includes(paramName);
          const field = generateExplicitParameterField(paramName, paramSchema, allSchemas, imports, isRequired);
          fieldDefinitions.push(field);
        } catch (error) {
          // Skip fields that can't be generated
        }
      }
    });
  }
  
  // Also add a params field for backward compatibility
  fieldDefinitions.push(`params: Optional[Dict[str, Any]] = Field(default=None, description="Additional parameters - for backward compatibility")`);
  
  return fieldDefinitions.join('\n    ');
}

function getPythonFieldType(schema, allSchemas, imports, parentClassName, fieldName) {
  // Safe access to type and format
  let schemaType, format;
  try {
    schemaType = (typeof schema.type === 'function') ? schema.type() : schema.type;
  } catch (error) {
    schemaType = null;
  }
  
  try {
    format = (typeof schema.format === 'function') ? schema.format() : schema.format;
  } catch (error) {
    format = null;
  }
  
  // Handle oneOf types (union types)
  let oneOf;
  try {
    oneOf = (typeof schema.oneOf === 'function') ? schema.oneOf() : schema.oneOf;
  } catch (error) {
    oneOf = null;
  }
  
  if (oneOf && Array.isArray(oneOf)) {
    // Handle oneOf (union) types by creating a Union
    const unionTypes = oneOf.map(item => {
      return getPythonFieldType(item, allSchemas, imports, parentClassName, fieldName);
    }).filter(type => type !== 'Any');
    
    if (unionTypes.length > 1) {
      return `Union[${unionTypes.join(', ')}]`;
    } else if (unionTypes.length === 1) {
      return unionTypes[0];
    }
  }
  
  switch (schemaType) {
    case 'string':
      // Handle enums
      let enumValues;
      try {
        enumValues = (typeof schema.enum === 'function') ? schema.enum() : schema.enum;
      } catch (error) {
        enumValues = null;
      }
      
      if (enumValues && Array.isArray(enumValues)) {
        // For enums, we could generate Literal types or just use str
        imports.add('from typing import Literal');
        const enumLiterals = enumValues.map(v => `"${v}"`).join(', ');
        return `Literal[${enumLiterals}]`;
      }
      
      if (format === 'date-time') {
        imports.add('from datetime import datetime');
        return 'datetime';
      }
      return 'str';
      
    case 'integer':
      // Handle int64 specifically for large numbers
      if (format === 'int64') {
        return 'int';  // Python int can handle int64 values
      }
      return 'int';
      
    case 'number':
      if (format === 'double' || format === 'float') {
        return 'float';
      }
      // For financial data, use Decimal for precision
      if (fieldName && (fieldName.toLowerCase().includes('price') || 
                       fieldName.toLowerCase().includes('quantity') || 
                       fieldName.toLowerCase().includes('amount'))) {
        imports.add('from decimal import Decimal');
        return 'Decimal';
      }
      return 'float';
      
    case 'boolean':
      return 'bool';
      
    case 'array':
      let items;
      try {
        items = (typeof schema.items === 'function') ? schema.items() : schema.items;
      } catch (error) {
        items = null;
      }
      
      if (items) {
        const itemType = getPythonFieldType(items, allSchemas, imports, parentClassName, fieldName);
        return `List[${itemType}]`;
      }
      return 'List[Any]';
      
    case 'object':
      // Check if this has properties and should generate a nested class
      let properties;
      try {
        properties = (typeof schema.properties === 'function') ? schema.properties() : schema.properties;
      } catch (error) {
        properties = null;
      }
      
      if (properties && Object.keys(properties).length > 0 && parentClassName && fieldName) {
        // Generate nested class name
        const nestedClassName = `${parentClassName}${capitalize(fieldName)}`;
        return nestedClassName;
      }
      
      return 'Dict[str, Any]';
      
    case 'null':
      return 'None';
      
    default:
      // Check if it's a reference to another schema
      if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        try {
          const referencedSchema = allSchemas.find(s => {
            const schemaId = (typeof s.id === 'function') ? s.id() : s.id;
            return schemaId === refName;
          });
          if (referencedSchema) {
            return refName;
          }
        } catch (error) {
          console.warn('Error finding referenced schema:', error.message);
        }
      }
      
      // Smart type inference based on field names and patterns
      if (fieldName && typeof fieldName === 'string') {
        const fieldLower = fieldName.toLowerCase();
        
        // WebSocket-specific fields
        if (fieldName === 'id') {
          return 'Union[int, str]'; // WebSocket IDs can be int or string
        }
        if (fieldName === 'method') {
          return 'str'; // WebSocket method names are strings
        }
        if (fieldName === 'status') {
          return 'int'; // HTTP-like status codes
        }
        
        // Time-related fields
        if (fieldLower.includes('time') || fieldLower.includes('timestamp')) {
          return 'int'; // Timestamps are usually milliseconds since epoch
        }
        
        // Financial fields - use string to preserve precision
        if (fieldLower.includes('price') || fieldLower.includes('quantity') || 
            fieldLower.includes('amount') || fieldLower.includes('volume')) {
          return 'str';
        }
        
        // ID fields
        if (fieldLower.includes('id') && fieldName !== 'id') {
          return 'int'; // Most IDs are integers
        }
        
        // Symbol, side, type fields
        if (fieldLower.includes('symbol') || fieldLower.includes('side') || 
            fieldLower.includes('type') || fieldLower.includes('interval')) {
          return 'str';
        }
        
        // Count, limit, number fields
        if (fieldLower.includes('count') || fieldLower.includes('limit') || 
            fieldLower.includes('num') || fieldLower.includes('level')) {
          return 'int';
        }
      }
      
      // Default fallback - avoid Any when possible
      console.warn(`Unknown schema type for field ${fieldName}:`, schemaType, 'schema:', JSON.stringify(schema, null, 2));
      return 'Any';
  }
}

function getDescriptionFromExamples(schema) {
  try {
    let examples;
    if (typeof schema.examples === 'function') {
      examples = schema.examples();
    } else {
      examples = schema.examples;
    }
    
    if (examples && Array.isArray(examples) && examples.length > 0) {
      const example = examples[0];
      return `Example: ${JSON.stringify(example)}`;
    }
  } catch (error) {
    // Silently handle - examples are optional
  }
  return null;
}

function isRequiredField(schema) {
  // In AsyncAPI, fields are generally optional unless explicitly marked as required
  return schema.required !== false && schema.required !== undefined;
}

function toPythonFieldName(fieldName) {
  // Convert camelCase to snake_case for Python conventions
  return fieldName
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function schemaNameToFilename(schemaName) {
  // Convert PascalCase to snake_case for Python file naming
  return schemaName
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase() + '.py';
}

function generateInitFile(allSchemas) {
  const modelNames = allSchemas.map(schema => {
    try {
      return (typeof schema.id === 'function') ? schema.id() : schema.id;
    } catch (error) {
      return 'UnknownSchema';
    }
  }).filter(name => name && name !== 'UnknownSchema').sort();
  
  let content = [];
  content.push('"""');
  content.push('Generated Pydantic models for Binance WebSocket API');
  content.push('');
  content.push('This package contains all the data models used by the WebSocket client.');
  content.push('Each model is defined in its own file for better organization.');
  content.push('"""');
  content.push('');
  
  // Import all models
  modelNames.forEach(schemaName => {
    const filename = schemaNameToFilename(schemaName);
    const moduleName = filename.replace('.py', '');
    content.push(`from .${moduleName} import ${schemaName}`);
  });
  
  content.push('');
  content.push('__all__ = [');
  modelNames.forEach((schemaName, index) => {
    const comma = index < modelNames.length - 1 ? ',' : '';
    content.push(`    "${schemaName}"${comma}`);
  });
  content.push(']');
  
  return content.join('\n') + '\n';
}

function generateEmptyInitFile() {
  return `"""
Generated Pydantic models for Binance WebSocket API

No models were found in the AsyncAPI specification.
"""

__all__ = []
`;
}

export default PythonIndividualModels;