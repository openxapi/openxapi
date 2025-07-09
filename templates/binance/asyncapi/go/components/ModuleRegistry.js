/*
 * Module Registry for organizing module-specific generation logic
 * This allows each module (spot, umfutures, cmfutures, etc.) to have dedicated handlers
 */

// Import the original components (ES modules)
import { WebSocketHandlers } from './WebSocketHandlers.js';
import { IndividualModels } from './IndividualModels.js';
import { MessageStructs } from './MessageStructs.js';

// Registry of module-specific configurations and handlers
const moduleRegistry = new Map();

/*
 * Register a module with its specific configuration and handlers
 */
export function registerModule(moduleName, config) {
  moduleRegistry.set(moduleName, {
    name: moduleName,
    ...config
  });
}

/*
 * Get module configuration by name
 */
export function getModuleConfig(moduleName) {
  return moduleRegistry.get(moduleName) || getDefaultModuleConfig();
}

/*
 * Get all registered modules
 */
export function getAllModules() {
  return Array.from(moduleRegistry.keys());
}

/*
 * Check if a module is registered
 */
export function isModuleRegistered(moduleName) {
  return moduleRegistry.has(moduleName);
}

/*
 * Get default module configuration for unregistered modules
 */
function getDefaultModuleConfig() {
  return {
    name: 'default',
    handlers: {
      webSocketHandlers: defaultWebSocketHandlersGenerator,
      individualModels: defaultIndividualModelsGenerator,
      messageStructs: defaultMessageStructsGenerator
    },
    authentication: {
      supportedTypes: ['HMAC_SHA256', 'RSA', 'ED25519'],
      defaultType: 'HMAC_SHA256'
    },
    specialMethods: {
      userDataStream: {
        requiresAuth: true,
        skipParamsCreation: true
      }
    }
  };
}


/*
 * Default generators (fallback for modules without specific implementations)
 */
function defaultWebSocketHandlersGenerator(asyncapi, moduleConfig) {
  try {
    return WebSocketHandlers({ asyncapi });
  } catch (error) {
    console.warn('Could not load WebSocketHandlers component:', error.message);
    return '// WebSocketHandlers component not available\n';
  }
}

function defaultIndividualModelsGenerator(asyncapi, moduleConfig) {
  try {
    return IndividualModels({ asyncapi });
  } catch (error) {
    console.warn('Could not load IndividualModels component:', error.message);
    return [];
  }
}

function defaultMessageStructsGenerator(asyncapi, moduleConfig) {
  try {
    return MessageStructs({ asyncapi });
  } catch (error) {
    console.warn('Could not load MessageStructs component:', error.message);
    return '// MessageStructs component not available\n';
  }
}

// Pre-register known modules with their specific configurations
registerModule('spot', {
  handlers: {
    webSocketHandlers: spotWebSocketHandlersGenerator,
    individualModels: spotIndividualModelsGenerator,
    messageStructs: spotMessageStructsGenerator
  },
  authentication: {
    supportedTypes: ['HMAC_SHA256', 'RSA', 'ED25519'],
    defaultType: 'HMAC_SHA256'
  },
  specialMethods: {
    userDataStream: {
      requiresAuth: true,
      skipParamsCreation: true
    }
  }
});

registerModule('umfutures', {
  handlers: {
    webSocketHandlers: umfuturesWebSocketHandlersGenerator,
    individualModels: umfuturesIndividualModelsGenerator,
    messageStructs: umfuturesMessageStructsGenerator
  },
  authentication: {
    supportedTypes: ['HMAC_SHA256', 'RSA', 'ED25519'],
    defaultType: 'HMAC_SHA256'
  },
  specialMethods: {
    // umfutures might have different special method handling
  }
});

registerModule('cmfutures', {
  handlers: {
    webSocketHandlers: cmfuturesWebSocketHandlersGenerator,
    individualModels: cmfuturesIndividualModelsGenerator,
    messageStructs: cmfuturesMessageStructsGenerator
  },
  authentication: {
    supportedTypes: ['HMAC_SHA256', 'RSA', 'ED25519'],
    defaultType: 'HMAC_SHA256'
  },
  specialMethods: {
    // cmfutures might have different special method handling
  }
});

/*
 * Module-specific generator functions
 * These can be customized for each module's specific needs
 */

// Spot module generators (uses current logic as baseline)
function spotWebSocketHandlersGenerator(asyncapi, moduleConfig) {
  try {
    return WebSocketHandlers({ asyncapi });
  } catch (error) {
    console.warn('Could not load WebSocketHandlers for spot:', error.message);
    return '// WebSocketHandlers component not available for spot\n';
  }
}

function spotIndividualModelsGenerator(asyncapi, moduleConfig) {
  try {
    return IndividualModels({ asyncapi });
  } catch (error) {
    console.warn('Could not load IndividualModels for spot:', error.message);
    return [];
  }
}

function spotMessageStructsGenerator(asyncapi, moduleConfig) {
  try {
    return MessageStructs({ asyncapi });
  } catch (error) {
    console.warn('Could not load MessageStructs for spot:', error.message);
    return '// MessageStructs component not available for spot\n';
  }
}

// USD-M Futures module generators
function umfuturesWebSocketHandlersGenerator(asyncapi, moduleConfig) {
  // For now, use the same logic as spot, but this can be customized
  try {
    return WebSocketHandlers({ asyncapi });
  } catch (error) {
    console.warn('Could not load WebSocketHandlers for umfutures:', error.message);
    return '// WebSocketHandlers component not available for umfutures\n';
  }
}

function umfuturesIndividualModelsGenerator(asyncapi, moduleConfig) {
  try {
    return IndividualModels({ asyncapi });
  } catch (error) {
    console.warn('Could not load IndividualModels for umfutures:', error.message);
    return [];
  }
}

function umfuturesMessageStructsGenerator(asyncapi, moduleConfig) {
  try {
    return MessageStructs({ asyncapi });
  } catch (error) {
    console.warn('Could not load MessageStructs for umfutures:', error.message);
    return '// MessageStructs component not available for umfutures\n';
  }
}

// COIN-M Futures module generators
function cmfuturesWebSocketHandlersGenerator(asyncapi, moduleConfig) {
  // For now, use the same logic as spot, but this can be customized
  try {
    return WebSocketHandlers({ asyncapi });
  } catch (error) {
    console.warn('Could not load WebSocketHandlers for cmfutures:', error.message);
    return '// WebSocketHandlers component not available for cmfutures\n';
  }
}

function cmfuturesIndividualModelsGenerator(asyncapi, moduleConfig) {
  try {
    return IndividualModels({ asyncapi });
  } catch (error) {
    console.warn('Could not load IndividualModels for cmfutures:', error.message);
    return [];
  }
}

function cmfuturesMessageStructsGenerator(asyncapi, moduleConfig) {
  try {
    return MessageStructs({ asyncapi });
  } catch (error) {
    console.warn('Could not load MessageStructs for cmfutures:', error.message);
    return '// MessageStructs component not available for cmfutures\n';
  }
}

/*
 * Utility function to determine module name from AsyncAPI spec or context
 */
export function detectModuleName(asyncapi, context = {}) {
  // Try to detect module name from various sources
  
  // 1. Check context parameters first
  if (context.moduleName) {
    return context.moduleName;
  }
  
  // 2. Check package name
  if (context.packageName) {
    return context.packageName;
  }
  
  // 3. Check AsyncAPI info title
  if (asyncapi && asyncapi.info && asyncapi.info()) {
    const info = asyncapi.info();
    const title = typeof info.title === 'function' ? info.title() : info.title;
    if (title) {
      const titleLower = title.toLowerCase();
      if (titleLower.includes('spot')) return 'spot';
      if (titleLower.includes('umfutures') || titleLower.includes('usd-m')) return 'umfutures';
      if (titleLower.includes('cmfutures') || titleLower.includes('coin-m')) return 'cmfutures';
    }
  }
  
  // 4. Check servers for hints
  if (asyncapi && asyncapi.servers) {
    const servers = asyncapi.servers();
    if (servers) {
      const serverMap = typeof servers.all === 'function' ? servers.all() : servers;
      const serverUrls = Object.values(serverMap).map(server => {
        const url = typeof server.url === 'function' ? server.url() : server.url;
        return url || '';
      }).join(' ');
      
      if (serverUrls.includes('dstream')) return 'cmfutures';
      if (serverUrls.includes('fstream')) return 'umfutures';
      if (serverUrls.includes('stream.binance')) return 'spot';
    }
  }
  
  // 5. Default fallback
  return 'spot';
}