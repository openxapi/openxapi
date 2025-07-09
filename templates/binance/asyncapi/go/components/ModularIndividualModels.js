/*
 * Modular Individual Models component that delegates to module-specific implementations
 * This allows each module to have its own model generation logic while keeping others intact
 */

import { getModuleConfig, detectModuleName } from './ModuleRegistry.js';
import { IndividualModels } from './IndividualModels.js';

export function ModularIndividualModels({ asyncapi, context = {} }) {
  // Detect which module we're generating for
  const moduleName = detectModuleName(asyncapi, context);
  
  // Get the module-specific configuration
  const moduleConfig = getModuleConfig(moduleName);
  
  // Use the module-specific individual models generator
  return moduleConfig.handlers.individualModels(asyncapi, moduleConfig);
}

/*
 * Enhanced IndividualModels with module-specific awareness
 * This extends the original IndividualModels with module-specific customizations
 */
export function EnhancedIndividualModels({ asyncapi, moduleName = null }) {
  const detectedModule = moduleName || detectModuleName(asyncapi, {});
  const moduleConfig = getModuleConfig(detectedModule);
  
  // Generate standard models using the original logic
  let modelFiles;
  try {
    modelFiles = IndividualModels({ asyncapi });
  } catch (error) {
    console.warn('Could not load IndividualModels component:', error.message);
    modelFiles = [];
  }
  
  // Add module-specific model customizations
  const moduleSpecificModels = generateModuleSpecificModels(asyncapi, detectedModule, moduleConfig);
  
  // Merge module-specific models with the standard ones
  if (Array.isArray(modelFiles)) {
    modelFiles = modelFiles.concat(moduleSpecificModels);
  } else {
    // If IndividualModels returns a string, convert to array format
    const standardModels = [{
      name: 'models.go',
      content: modelFiles
    }];
    modelFiles = standardModels.concat(moduleSpecificModels);
  }
  
  return modelFiles;
}

/*
 * Generate module-specific model files
 */
function generateModuleSpecificModels(asyncapi, moduleName, moduleConfig) {
  const moduleSpecificModels = [];
  
  switch (moduleName) {
    case 'spot':
      moduleSpecificModels.push(...generateSpotSpecificModels(asyncapi, moduleConfig));
      break;
    case 'umfutures':
      moduleSpecificModels.push(...generateUmfuturesSpecificModels(asyncapi, moduleConfig));
      break;
    case 'cmfutures':
      moduleSpecificModels.push(...generateCmfuturesSpecificModels(asyncapi, moduleConfig));
      break;
    default:
      moduleSpecificModels.push(...generateDefaultModuleModels(asyncapi, moduleConfig));
  }
  
  return moduleSpecificModels;
}

/*
 * Generate spot-specific model files
 */
function generateSpotSpecificModels(asyncapi, moduleConfig) {
  const models = [];
  
  // Add spot-specific utility models
  models.push({
    name: 'spot_utils.go',
    content: generateSpotUtilsModel(moduleConfig)
  });
  
  // Add spot-specific trading models
  models.push({
    name: 'spot_trading.go',
    content: generateSpotTradingModel(moduleConfig)
  });
  
  return models;
}

/*
 * Generate USD-M futures specific model files
 */
function generateUmfuturesSpecificModels(asyncapi, moduleConfig) {
  const models = [];
  
  // Add futures-specific models
  models.push({
    name: 'futures_utils.go',
    content: generateFuturesUtilsModel(moduleConfig)
  });
  
  models.push({
    name: 'futures_positions.go',
    content: generateFuturesPositionsModel(moduleConfig)
  });
  
  return models;
}

/*
 * Generate COIN-M futures specific model files
 */
function generateCmfuturesSpecificModels(asyncapi, moduleConfig) {
  const models = [];
  
  // Add COIN-M futures specific models
  models.push({
    name: 'coinm_utils.go',
    content: generateCoinMUtilsModel(moduleConfig)
  });
  
  models.push({
    name: 'coinm_positions.go',
    content: generateCoinMPositionsModel(moduleConfig)
  });
  
  return models;
}

/*
 * Generate default module model files (fallback)
 */
function generateDefaultModuleModels(asyncapi, moduleConfig) {
  const models = [];
  
  models.push({
    name: 'module_info.go',
    content: generateModuleInfoModel(moduleConfig)
  });
  
  return models;
}

/*
 * Individual model content generators
 */

function generateSpotUtilsModel(moduleConfig) {
  return `package models

import (
\t"encoding/json"
)

// SpotUtils provides utility functions for spot trading
type SpotUtils struct {
\tModule string \`json:"module"\`
}

// NewSpotUtils creates a new SpotUtils instance
func NewSpotUtils() *SpotUtils {
\treturn &SpotUtils{
\t\tModule: "${moduleConfig.name}",
\t}
}

// String returns string representation of SpotUtils
func (s SpotUtils) String() string {
\tb, _ := json.Marshal(s)
\treturn string(b)
}
`;
}

function generateSpotTradingModel(moduleConfig) {
  return `package models

import (
\t"encoding/json"
)

// SpotTradingInfo contains spot trading specific information
type SpotTradingInfo struct {
\tSymbol    string  \`json:"symbol"\`
\tPrice     float64 \`json:"price,omitempty"\`
\tQuantity  float64 \`json:"quantity,omitempty"\`
\tSide      string  \`json:"side,omitempty"\`
\tOrderType string  \`json:"orderType,omitempty"\`
}

// String returns string representation of SpotTradingInfo
func (s SpotTradingInfo) String() string {
\tb, _ := json.Marshal(s)
\treturn string(b)
}
`;
}

function generateFuturesUtilsModel(moduleConfig) {
  return `package models

import (
\t"encoding/json"
)

// FuturesUtils provides utility functions for USD-M futures trading
type FuturesUtils struct {
\tModule   string \`json:"module"\`
\tLeverage int    \`json:"leverage,omitempty"\`
}

// NewFuturesUtils creates a new FuturesUtils instance
func NewFuturesUtils() *FuturesUtils {
\treturn &FuturesUtils{
\t\tModule: "${moduleConfig.name}",
\t}
}

// String returns string representation of FuturesUtils
func (s FuturesUtils) String() string {
\tb, _ := json.Marshal(s)
\treturn string(b)
}
`;
}

function generateFuturesPositionsModel(moduleConfig) {
  return `package models

import (
\t"encoding/json"
)

// FuturesPosition contains futures position information
type FuturesPosition struct {
\tSymbol           string  \`json:"symbol"\`
\tPositionAmt      float64 \`json:"positionAmt,omitempty"\`
\tEntryPrice       float64 \`json:"entryPrice,omitempty"\`
\tMarkPrice        float64 \`json:"markPrice,omitempty"\`
\tUnrealizedProfit float64 \`json:"unrealizedProfit,omitempty"\`
\tLeverage         int     \`json:"leverage,omitempty"\`
}

// String returns string representation of FuturesPosition
func (s FuturesPosition) String() string {
\tb, _ := json.Marshal(s)
\treturn string(b)
}
`;
}

function generateCoinMUtilsModel(moduleConfig) {
  return `package models

import (
\t"encoding/json"
)

// CoinMUtils provides utility functions for COIN-M futures trading
type CoinMUtils struct {
\tModule     string \`json:"module"\`
\tMarginType string \`json:"marginType,omitempty"\`
}

// NewCoinMUtils creates a new CoinMUtils instance
func NewCoinMUtils() *CoinMUtils {
\treturn &CoinMUtils{
\t\tModule: "${moduleConfig.name}",
\t}
}

// String returns string representation of CoinMUtils
func (s CoinMUtils) String() string {
\tb, _ := json.Marshal(s)
\treturn string(b)
}
`;
}

function generateCoinMPositionsModel(moduleConfig) {
  return `package models

import (
\t"encoding/json"
)

// CoinMPosition contains COIN-M futures position information
type CoinMPosition struct {
\tSymbol           string  \`json:"symbol"\`
\tPositionAmt      float64 \`json:"positionAmt,omitempty"\`
\tEntryPrice       float64 \`json:"entryPrice,omitempty"\`
\tMarkPrice        float64 \`json:"markPrice,omitempty"\`
\tUnrealizedProfit float64 \`json:"unrealizedProfit,omitempty"\`
\tMarginType       string  \`json:"marginType,omitempty"\`
}

// String returns string representation of CoinMPosition
func (s CoinMPosition) String() string {
\tb, _ := json.Marshal(s)
\treturn string(b)
}
`;
}

function generateModuleInfoModel(moduleConfig) {
  return `package models

import (
\t"encoding/json"
)

// ModuleInfo contains general module information
type ModuleInfo struct {
\tName    string \`json:"name"\`
\tVersion string \`json:"version,omitempty"\`
}

// NewModuleInfo creates a new ModuleInfo instance
func NewModuleInfo() *ModuleInfo {
\treturn &ModuleInfo{
\t\tName: "${moduleConfig.name}",
\t}
}

// String returns string representation of ModuleInfo
func (s ModuleInfo) String() string {
\tb, _ := json.Marshal(s)
\treturn string(b)
}
`;
}