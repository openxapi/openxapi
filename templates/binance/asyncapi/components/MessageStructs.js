/*
 * This component generates Go structs for message payloads
 * As input it requires the AsyncAPI document
 */
export function MessageStructs({ asyncapi }) {
  const messages = asyncapi.components().messages();
  let structs = '';

  messages.forEach((message) => {
    const messageName = message.id();
    const payload = message.payload();
    
    if (payload && payload.type() === 'object') {
      structs += generateStruct(messageName, payload);
      structs += '\n';
    }
  });

  return structs;
}

/*
 * Generate a Go struct from a JSON schema
 */
function generateStruct(name, schema) {
  const structName = capitalizeFirst(name);
  let structDef = `// ${structName} represents the ${name} message payload\n`;
  structDef += `type ${structName} struct {\n`;

  const properties = schema.properties();
  const usedFieldNames = new Set();
  
  if (properties) {
    Object.keys(properties).forEach((propName) => {
      const prop = properties[propName];
      const goType = mapJsonTypeToGo(prop);
      let fieldName = capitalizeFirst(propName);
      
      // Handle duplicate field names by appending the original case
      if (usedFieldNames.has(fieldName)) {
        fieldName = fieldName + propName.toUpperCase();
      }
      usedFieldNames.add(fieldName);
      
      const jsonTag = `\`json:"${propName}"\``;
      
      if (prop.description()) {
        structDef += `\t// ${prop.description()}\n`;
      }
      structDef += `\t${fieldName} ${goType} ${jsonTag}\n`;
    });
  }

  structDef += '}\n';
  return structDef;
}

/*
 * Map JSON schema types to Go types
 */
function mapJsonTypeToGo(property) {
  const type = property.type();
  
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
      return 'interface{}';
    case 'array':
      const items = property.items();
      if (items) {
        return `[]${mapJsonTypeToGo(items)}`;
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