/*
 * Modular Message Structs component that delegates to module-specific implementations
 * This allows each module to have its own message struct generation logic
 */

import { getModuleConfig, detectModuleName } from './ModuleRegistry.js';

export function ModularMessageStructs({ asyncapi, context = {} }) {
  // Detect which module we're generating for
  const moduleName = detectModuleName(asyncapi, context);
  
  // Get the module-specific configuration
  const moduleConfig = getModuleConfig(moduleName);
  
  // Use the module-specific message structs generator
  return moduleConfig.handlers.messageStructs(asyncapi, moduleConfig);
}

/*
 * Enhanced MessageStructs with module-specific awareness
 * This extends the original MessageStructs with module-specific customizations
 */
export function EnhancedMessageStructs({ asyncapi, moduleName = null }) {
  const detectedModule = moduleName || detectModuleName(asyncapi, {});
  const moduleConfig = getModuleConfig(detectedModule);
  
  // Generate standard message structs using the original logic
  let structs;
  try {
    const { MessageStructs } = require('./MessageStructs');
    structs = MessageStructs({ asyncapi });
  } catch (error) {
    console.warn('Could not load MessageStructs component:', error.message);
    structs = '// MessageStructs component not available\n';
  }
  
  // Add module-specific struct customizations
  structs += generateModuleSpecificStructs(asyncapi, detectedModule, moduleConfig);
  
  return structs;
}

/*
 * Generate module-specific message structs
 */
function generateModuleSpecificStructs(asyncapi, moduleName, moduleConfig) {
  let moduleSpecificStructs = '';
  
  moduleSpecificStructs += `// Module-specific message structs for ${moduleName}\n`;
  moduleSpecificStructs += `// Generated with module configuration: ${JSON.stringify(moduleConfig.name)}\n\n`;
  
  switch (moduleName) {
    case 'spot':
      moduleSpecificStructs += generateSpotSpecificStructs(asyncapi, moduleConfig);
      break;
    case 'umfutures':
      moduleSpecificStructs += generateUmfuturesSpecificStructs(asyncapi, moduleConfig);
      break;
    case 'cmfutures':
      moduleSpecificStructs += generateCmfuturesSpecificStructs(asyncapi, moduleConfig);
      break;
    default:
      moduleSpecificStructs += generateDefaultModuleStructs(asyncapi, moduleConfig);
  }
  
  return moduleSpecificStructs;
}

/*
 * Generate spot-specific message structs
 */
function generateSpotSpecificStructs(asyncapi, moduleConfig) {
  let structs = '';
  
  structs += `// SpotMarketDataRequest represents a spot market data request\n`;
  structs += `type SpotMarketDataRequest struct {\n`;
  structs += `\tSymbol string \`json:"symbol"\`\n`;
  structs += `\tDepth  int    \`json:"depth,omitempty"\`\n`;
  structs += `}\n\n`;
  
  structs += `// SpotMarketDataResponse represents a spot market data response\n`;
  structs += `type SpotMarketDataResponse struct {\n`;
  structs += `\tSymbol   string    \`json:"symbol"\`\n`;
  structs += `\tBids     [][]string \`json:"bids"\`\n`;
  structs += `\tAsks     [][]string \`json:"asks"\`\n`;
  structs += `\tUpdateId int64     \`json:"lastUpdateId"\`\n`;
  structs += `}\n\n`;
  
  return structs;
}

/*
 * Generate USD-M futures specific message structs
 */
function generateUmfuturesSpecificStructs(asyncapi, moduleConfig) {
  let structs = '';
  
  structs += `// FuturesPositionRequest represents a futures position request\n`;
  structs += `type FuturesPositionRequest struct {\n`;
  structs += `\tSymbol string \`json:"symbol,omitempty"\`\n`;
  structs += `}\n\n`;
  
  structs += `// FuturesPositionResponse represents a futures position response\n`;
  structs += `type FuturesPositionResponse struct {\n`;
  structs += `\tSymbol           string \`json:"symbol"\`\n`;
  structs += `\tPositionAmt      string \`json:"positionAmt"\`\n`;
  structs += `\tEntryPrice       string \`json:"entryPrice"\`\n`;
  structs += `\tMarkPrice        string \`json:"markPrice"\`\n`;
  structs += `\tUnrealizedProfit string \`json:"unrealizedProfit"\`\n`;
  structs += `\tLeverage         string \`json:"leverage"\`\n`;
  structs += `}\n\n`;
  
  structs += `// LeverageChangeRequest represents a leverage change request\n`;
  structs += `type LeverageChangeRequest struct {\n`;
  structs += `\tSymbol   string \`json:"symbol"\`\n`;
  structs += `\tLeverage int    \`json:"leverage"\`\n`;
  structs += `}\n\n`;
  
  return structs;
}

/*
 * Generate COIN-M futures specific message structs
 */
function generateCmfuturesSpecificStructs(asyncapi, moduleConfig) {
  let structs = '';
  
  structs += `// CoinMPositionRequest represents a COIN-M futures position request\n`;
  structs += `type CoinMPositionRequest struct {\n`;
  structs += `\tSymbol string \`json:"symbol,omitempty"\`\n`;
  structs += `\tPair   string \`json:"pair,omitempty"\`\n`;
  structs += `}\n\n`;
  
  structs += `// CoinMPositionResponse represents a COIN-M futures position response\n`;
  structs += `type CoinMPositionResponse struct {\n`;
  structs += `\tSymbol           string \`json:"symbol"\`\n`;
  structs += `\tPair             string \`json:"pair"\`\n`;
  structs += `\tPositionAmt      string \`json:"positionAmt"\`\n`;
  structs += `\tEntryPrice       string \`json:"entryPrice"\`\n`;
  structs += `\tMarkPrice        string \`json:"markPrice"\`\n`;
  structs += `\tUnrealizedProfit string \`json:"unrealizedProfit"\`\n`;
  structs += `\tMarginType       string \`json:"marginType"\`\n`;
  structs += `}\n\n`;
  
  structs += `// MarginTypeChangeRequest represents a margin type change request\n`;
  structs += `type MarginTypeChangeRequest struct {\n`;
  structs += `\tSymbol     string \`json:"symbol"\`\n`;
  structs += `\tMarginType string \`json:"marginType"\`\n`;
  structs += `}\n\n`;
  
  return structs;
}

/*
 * Generate default module message structs (fallback)
 */
function generateDefaultModuleStructs(asyncapi, moduleConfig) {
  let structs = '';
  
  structs += `// GenericModuleRequest represents a generic module request\n`;
  structs += `type GenericModuleRequest struct {\n`;
  structs += `\tModule    string      \`json:"module"\`\n`;
  structs += `\tOperation string      \`json:"operation"\`\n`;
  structs += `\tParams    interface{} \`json:"params,omitempty"\`\n`;
  structs += `}\n\n`;
  
  structs += `// GenericModuleResponse represents a generic module response\n`;
  structs += `type GenericModuleResponse struct {\n`;
  structs += `\tModule string      \`json:"module"\`\n`;
  structs += `\tResult interface{} \`json:"result"\`\n`;
  structs += `\tError  string      \`json:"error,omitempty"\`\n`;
  structs += `}\n\n`;
  
  return structs;
}

/*
 * Utility functions for message struct generation
 */

/*
 * Generate validation methods for request structs
 */
export function generateValidationMethods(structName, fields, moduleConfig) {
  let methods = '';
  
  methods += `// Validate validates the ${structName} fields\n`;
  methods += `func (r *${structName}) Validate() error {\n`;
  
  fields.forEach(field => {
    if (field.required) {
      methods += `\tif r.${field.name} == "" {\n`;
      methods += `\t\treturn fmt.Errorf("${field.jsonName} is required")\n`;
      methods += `\t}\n`;
    }
  });
  
  methods += `\treturn nil\n`;
  methods += `}\n\n`;
  
  return methods;
}

/*
 * Generate serialization helpers for response structs
 */
export function generateSerializationHelpers(structName, moduleConfig) {
  let helpers = '';
  
  helpers += `// ToJSON converts ${structName} to JSON string\n`;
  helpers += `func (r *${structName}) ToJSON() (string, error) {\n`;
  helpers += `\tb, err := json.Marshal(r)\n`;
  helpers += `\tif err != nil {\n`;
  helpers += `\t\treturn "", err\n`;
  helpers += `\t}\n`;
  helpers += `\treturn string(b), nil\n`;
  helpers += `}\n\n`;
  
  helpers += `// FromJSON creates ${structName} from JSON string\n`;
  helpers += `func (r *${structName}) FromJSON(jsonStr string) error {\n`;
  helpers += `\treturn json.Unmarshal([]byte(jsonStr), r)\n`;
  helpers += `}\n\n`;
  
  return helpers;
}