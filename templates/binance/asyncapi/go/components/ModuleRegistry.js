/*
 * Module Registry for organizing module-specific generation logic
 * This allows each module (spot, umfutures, cmfutures, etc.) to have dedicated handlers
 */

// Import the original components (ES modules)
import { WebSocketHandlers } from './WebSocketHandlers.js';
import { IndividualModels } from './IndividualModels.js';
import { MessageStructs } from './MessageStructs.js';

// Import dedicated spot-streams components
import { SpotStreamsWebSocketHandlers } from './SpotStreamsWebSocketHandlers.js';
import { SpotStreamsIndividualModels } from './SpotStreamsIndividualModels.js';

// Import dedicated umfutures-streams components
import { UmfuturesStreamsWebSocketHandlers } from './UmfuturesStreamsWebSocketHandlers.js';

// Import dedicated cmfutures-streams components
import { CmfuturesStreamsWebSocketHandlers } from './CmfuturesStreamsWebSocketHandlers.js';

// Import dedicated options-streams components
import { OptionsStreamsWebSocketHandlers } from './OptionsStreamsWebSocketHandlers.js';

// Import dedicated pmargin components
import { PmarginWebSocketHandlers } from './PmarginWebSocketHandlers.js';

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

registerModule('spot-streams', {
  handlers: {
    webSocketHandlers: spotStreamsWebSocketHandlersGenerator,
    individualModels: spotStreamsIndividualModelsGenerator,
    messageStructs: spotStreamsMessageStructsGenerator
  },
  authentication: {
    supportedTypes: [], // Spot streams are public, no authentication required
    defaultType: null
  },
  specialMethods: {
    // Spot streams use subscription model, not request-response
    subscriptions: {
      requiresAuth: false,
      useStreamFormat: true
    }
  }
});

registerModule('umfutures-streams', {
  handlers: {
    webSocketHandlers: umfuturesStreamsWebSocketHandlersGenerator,
    individualModels: umfuturesStreamsIndividualModelsGenerator,
    messageStructs: umfuturesStreamsMessageStructsGenerator
  },
  authentication: {
    supportedTypes: [], // USD-M Futures streams are public, no authentication required
    defaultType: null
  },
  specialMethods: {
    // USD-M Futures streams use subscription model, not request-response
    subscriptions: {
      requiresAuth: false,
      useStreamFormat: true,
      futuresSpecific: true
    }
  }
});

registerModule('cmfutures-streams', {
  handlers: {
    webSocketHandlers: cmfuturesStreamsWebSocketHandlersGenerator,
    individualModels: cmfuturesStreamsIndividualModelsGenerator,
    messageStructs: cmfuturesStreamsMessageStructsGenerator
  },
  authentication: {
    supportedTypes: [], // COIN-M Futures streams are public, no authentication required
    defaultType: null
  },
  specialMethods: {
    // COIN-M Futures streams use subscription model, not request-response
    subscriptions: {
      requiresAuth: false,
      useStreamFormat: true,
      futuresSpecific: true
    }
  }
});

registerModule('options-streams', {
  handlers: {
    webSocketHandlers: optionsStreamsWebSocketHandlersGenerator,
    individualModels: optionsStreamsIndividualModelsGenerator,
    messageStructs: optionsStreamsMessageStructsGenerator
  },
  authentication: {
    supportedTypes: [], // Options streams are public, no authentication required
    defaultType: null
  },
  specialMethods: {
    // Options streams use subscription model, not request-response
    subscriptions: {
      requiresAuth: false,
      useStreamFormat: true,
      optionsSpecific: true
    }
  }
});

registerModule('pmargin', {
  handlers: {
    webSocketHandlers: pmarginWebSocketHandlersGenerator,
    individualModels: pmarginIndividualModelsGenerator,
    messageStructs: pmarginMessageStructsGenerator
  },
  authentication: {
    supportedTypes: ['HMAC_SHA256', 'RSA', 'ED25519'],
    defaultType: 'HMAC_SHA256'
  },
  specialMethods: {
    // Portfolio margin user data streams require authentication via listen key
    userDataStream: {
      requiresAuth: true,
      useListenKey: true
    }
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

// Spot-Streams module generators (market data streams, no authentication)
function spotStreamsWebSocketHandlersGenerator(asyncapi, moduleConfig) {
  try {
    return SpotStreamsWebSocketHandlers({ asyncapi });
  } catch (error) {
    console.warn('Could not load SpotStreamsWebSocketHandlers for spot-streams:', error.message);
    return '// SpotStreamsWebSocketHandlers component not available for spot-streams\n';
  }
}

function spotStreamsIndividualModelsGenerator(asyncapi, moduleConfig) {
  try {
    return SpotStreamsIndividualModels({ asyncapi });
  } catch (error) {
    console.warn('Could not load SpotStreamsIndividualModels for spot-streams:', error.message);
    return [];
  }
}

function spotStreamsMessageStructsGenerator(asyncapi, moduleConfig) {
  try {
    return MessageStructs({ asyncapi });
  } catch (error) {
    console.warn('Could not load MessageStructs for spot-streams:', error.message);
    return '// MessageStructs component not available for spot-streams\n';
  }
}

// USD-M Futures Streams module generators (market data streams, no authentication)
function umfuturesStreamsWebSocketHandlersGenerator(asyncapi, moduleConfig) {
  try {
    // Use dedicated UmfuturesStreamsWebSocketHandlers for dynamic event type handling
    return UmfuturesStreamsWebSocketHandlers({ asyncapi });
  } catch (error) {
    console.warn('Could not load UmfuturesStreamsWebSocketHandlers for umfutures-streams:', error.message);
    return '// UmfuturesStreamsWebSocketHandlers component not available for umfutures-streams\n';
  }
}

function umfuturesStreamsIndividualModelsGenerator(asyncapi, moduleConfig) {
  try {
    // IMPORTANT: Use SpotStreamsIndividualModels ONLY for streams modules 
    // This avoids generating UserDataStream types since streams modules only handle market data
    let modelFiles = SpotStreamsIndividualModels({ asyncapi });
    
    // Ensure modelFiles is an array
    if (!Array.isArray(modelFiles)) {
      modelFiles = [{
        name: 'models.go',
        content: modelFiles
      }];
    }
    
    // Note: UserDataStream type aliases are NOT added for streams modules
    // as they only handle market data streams, not WebSocket API methods
    
    return modelFiles;
  } catch (error) {
    console.warn('Could not load SpotStreamsIndividualModels for umfutures-streams:', error.message);
    // Fallback to empty array - DO NOT use IndividualModels for streams modules
    return [];
  }
}

function umfuturesStreamsMessageStructsGenerator(asyncapi, moduleConfig) {
  try {
    return MessageStructs({ asyncapi });
  } catch (error) {
    console.warn('Could not load MessageStructs for umfutures-streams:', error.message);
    return '// MessageStructs component not available for umfutures-streams\n';
  }
}

// COIN-M Futures Streams module generators (market data streams, no authentication)
function cmfuturesStreamsWebSocketHandlersGenerator(asyncapi, moduleConfig) {
  try {
    // Use dedicated CmfuturesStreamsWebSocketHandlers for COIN-M futures specific event handling
    return CmfuturesStreamsWebSocketHandlers({ asyncapi });
  } catch (error) {
    console.warn('Could not load WebSocketHandlers for cmfutures-streams:', error.message);
    return '// WebSocketHandlers component not available for cmfutures-streams\n';
  }
}

function cmfuturesStreamsIndividualModelsGenerator(asyncapi, moduleConfig) {
  try {
    // Use SpotStreamsIndividualModels as base since futures streams use similar model structure
    return SpotStreamsIndividualModels({ asyncapi });
  } catch (error) {
    console.warn('Could not load IndividualModels for cmfutures-streams:', error.message);
    return [];
  }
}

function cmfuturesStreamsMessageStructsGenerator(asyncapi, moduleConfig) {
  try {
    return MessageStructs({ asyncapi });
  } catch (error) {
    console.warn('Could not load MessageStructs for cmfutures-streams:', error.message);
    return '// MessageStructs component not available for cmfutures-streams\n';
  }
}

// Options Streams module generators (market data streams, no authentication)
function optionsStreamsWebSocketHandlersGenerator(asyncapi, moduleConfig) {
  try {
    // Use dedicated OptionsStreamsWebSocketHandlers for options-specific event handling
    return OptionsStreamsWebSocketHandlers({ asyncapi });
  } catch (error) {
    console.warn('Could not load OptionsStreamsWebSocketHandlers for options-streams:', error.message);
    return '// OptionsStreamsWebSocketHandlers component not available for options-streams\n';
  }
}

function optionsStreamsIndividualModelsGenerator(asyncapi, moduleConfig) {
  try {
    // Use SpotStreamsIndividualModels as base since options streams use similar model structure
    return SpotStreamsIndividualModels({ asyncapi });
  } catch (error) {
    console.warn('Could not load SpotStreamsIndividualModels for options-streams:', error.message);
    return [];
  }
}

function optionsStreamsMessageStructsGenerator(asyncapi, moduleConfig) {
  try {
    return MessageStructs({ asyncapi });
  } catch (error) {
    console.warn('Could not load MessageStructs for options-streams:', error.message);
    return '// MessageStructs component not available for options-streams\n';
  }
}

// Portfolio Margin module generators
function pmarginWebSocketHandlersGenerator(asyncapi, moduleConfig) {
  try {
    return PmarginWebSocketHandlers({ asyncapi });
  } catch (error) {
    console.warn('Could not load PmarginWebSocketHandlers for pmargin:', error.message);
    return '// PmarginWebSocketHandlers component not available for pmargin\n';
  }
}

function pmarginIndividualModelsGenerator(asyncapi, moduleConfig) {
  try {
    return IndividualModels({ asyncapi });
  } catch (error) {
    console.warn('Could not load IndividualModels for pmargin:', error.message);
    return [];
  }
}

function pmarginMessageStructsGenerator(asyncapi, moduleConfig) {
  try {
    return MessageStructs({ asyncapi });
  } catch (error) {
    console.warn('Could not load MessageStructs for pmargin:', error.message);
    return '// MessageStructs component not available for pmargin\n';
  }
}

/*
 * Utility function to determine module name from AsyncAPI spec or context
 */
export function detectModuleName(asyncapi, context = {}) {
  // Try to detect module name from various sources
  
  // 1. Check context parameters first (but extract just the module name, not full path)
  if (context.moduleName) {
    // Extract just the module name from full path like github.com/openxapi/binance-go/ws/spot-streams
    const parts = context.moduleName.split('/');
    const lastPart = parts[parts.length - 1];
    // If it looks like a known module, return it
    if (['spot', 'umfutures', 'cmfutures', 'pmargin', 'spot-streams', 'umfutures-streams', 'cmfutures-streams', 'options-streams'].includes(lastPart)) {
      return lastPart;
    }
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
      if (titleLower.includes('spot') && (titleLower.includes('stream') || titleLower.includes('streams'))) return 'spot-streams';
      if ((titleLower.includes('umfutures') || titleLower.includes('usd-s') || titleLower.includes('usd-m')) && (titleLower.includes('stream') || titleLower.includes('streams'))) return 'umfutures-streams';
      if ((titleLower.includes('cmfutures') || titleLower.includes('coin-m')) && (titleLower.includes('stream') || titleLower.includes('streams'))) return 'cmfutures-streams';
      if (titleLower.includes('options') && (titleLower.includes('stream') || titleLower.includes('streams'))) return 'options-streams';
      if (titleLower.includes('spot')) return 'spot';
      if (titleLower.includes('umfutures') || titleLower.includes('usd-m') || titleLower.includes('usd-s')) return 'umfutures';
      if (titleLower.includes('cmfutures') || titleLower.includes('coin-m')) return 'cmfutures';
      if (titleLower.includes('pmargin') || titleLower.includes('portfolio margin')) return 'pmargin';
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
      
      if (serverUrls.includes('dstream') && (serverUrls.includes('/stream') || serverUrls.includes('/ws'))) return 'cmfutures-streams';
      if (serverUrls.includes('fstream') && (serverUrls.includes('/stream') || serverUrls.includes('/ws'))) return 'umfutures-streams';
      if (serverUrls.includes('nbstream') && (serverUrls.includes('/stream') || serverUrls.includes('/ws'))) return 'options-streams';
      if (serverUrls.includes('dstream')) return 'cmfutures';
      if (serverUrls.includes('fstream') && serverUrls.includes('/pm/ws')) return 'pmargin';
      if (serverUrls.includes('fstream')) return 'umfutures';
      if (serverUrls.includes('stream.binance') || serverUrls.includes('data-stream.binance')) return 'spot-streams';
      if (serverUrls.includes('ws-api.binance')) return 'spot';
    }
  }
  
  // 5. Default fallback
  return 'spot';
}