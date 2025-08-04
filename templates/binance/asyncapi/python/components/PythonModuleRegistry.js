/*
 * Python Module Registry for organizing module-specific generation logic
 * This allows each module (spot, umfutures, cmfutures, etc.) to have dedicated configurations
 * Based on the Go SDK ModuleRegistry pattern
 */

// Registry of module-specific configurations
const moduleRegistry = new Map();

/*
 * Register a module with its specific configuration
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
    authentication: {
      supportedTypes: ['HMAC_SHA256'],
      defaultType: 'HMAC_SHA256'
    },
    specialMethods: {
      userDataStream: {
        requiresAuth: true,
        skipParamsCreation: true
      }
    },
    serverConfig: {
      mainnetUrlPattern: 'wss://stream.binance.com:9443/ws',
      testnetUrlPattern: 'wss://testnet.dex.binance.org/api/ws'
    }
  };
}

/*
 * Extract complete server information from AsyncAPI spec (similar to Go SDK)
 */
export function extractServerInfo(asyncapi) {
  const servers = asyncapi.servers();
  const serverList = servers.all();
  
  const serverInfo = [];
  
  serverList.forEach(server => {
    const rawName = server.id();
    // Always append '1' to server names if they don't already end with a number (like Go SDK)
    const name = rawName.match(/\d+$/) ? rawName : rawName + '1';
    const protocol = server.protocol();
    const host = server.host();
    // Handle server variables for pathname
    let pathname = server.pathname() || '';
    let url;
    
    // Handle server variables (streamPath, listenKey, etc.)
    const serverJson = server.json ? server.json() : (server._json || {});
    if (serverJson.variables) {
      // Handle streamPath variable - keep as template for options-streams and other stream modules
      if (serverJson.variables.streamPath) {
        // For stream modules, keep {streamPath} as template for runtime replacement
        // This allows dynamic path selection (/ws, /stream, etc.)
        // Note: streamPath variables are resolved at connection time, not initialization time
      }
      
      // Handle listenKey variable - leave as template for runtime replacement
      if (pathname.includes('{listenKey}')) {
        // Keep {listenKey} as template - it will be replaced at runtime
        // This is intentional for user data stream URLs
      }
    }
    
    url = `${protocol}://${host}${pathname}`;
    const title = server.title() || `${rawName.charAt(0).toUpperCase() + rawName.slice(1)} Server`;
    const summary = server.summary() || `WebSocket API Server (${rawName})`;
    const description = (server.description() || `WebSocket server for ${rawName} environment`).replace(/"/g, '\\"').replace(/\n/g, '\\n');
    
    serverInfo.push({
      name: name,
      url: url,
      host: host,
      pathname: pathname,
      protocol: protocol,
      title: title,
      summary: summary,
      description: description,
      active: false // Will be set by ServerManager
    });
  });
  
  return serverInfo;
}

/*
 * Utility function to determine module name from AsyncAPI spec or context
 * Based on the Go SDK detectModuleName function
 */
export function detectModuleName(asyncapi, context = {}) {
  // Try to detect module name from various sources
  
  // 1. Check context parameters first
  if (context.moduleName) {
    // Extract just the module name from full path
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

// Pre-register known modules with their specific configurations
registerModule('spot', {
  authentication: {
    supportedTypes: ['HMAC_SHA256', 'RSA', 'ED25519'],
    defaultType: 'HMAC_SHA256'
  },
  specialMethods: {
    userDataStream: {
      requiresAuth: true,
      skipParamsCreation: true
    }
  },
  serverConfig: {
    mainnetUrlPattern: 'wss://ws-api.binance.com:443/ws-api/v3',
    testnetUrlPattern: 'wss://testnet.binance.vision/ws-api/v3'
  }
});

registerModule('umfutures', {
  authentication: {
    supportedTypes: ['HMAC_SHA256', 'RSA', 'ED25519'],
    defaultType: 'HMAC_SHA256'
  },
  specialMethods: {
    // umfutures might have different special method handling
  },
  serverConfig: {
    mainnetUrlPattern: 'wss://fstream.binance.com/ws-fapi/v1',
    testnetUrlPattern: 'wss://stream.binancefuture.com/ws-fapi/v1'
  }
});

registerModule('cmfutures', {
  authentication: {
    supportedTypes: ['HMAC_SHA256', 'RSA', 'ED25519'],
    defaultType: 'HMAC_SHA256'
  },
  specialMethods: {
    // cmfutures might have different special method handling
  },
  serverConfig: {
    mainnetUrlPattern: 'wss://dstream.binance.com/ws-dapi/v1',
    testnetUrlPattern: 'wss://testnet.binancefuture.com/ws-dapi/v1'
  }
});

registerModule('spot-streams', {
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
  },
  serverConfig: {
    mainnetUrlPattern: 'wss://stream.binance.com:9443/ws',
    testnetUrlPattern: 'wss://testnet.binance.vision/ws'
  }
});

registerModule('umfutures-streams', {
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
  },
  serverConfig: {
    mainnetUrlPattern: 'wss://fstream.binance.com/ws',
    testnetUrlPattern: 'wss://stream.binancefuture.com/ws'
  }
});

registerModule('cmfutures-streams', {
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
  },
  serverConfig: {
    mainnetUrlPattern: 'wss://dstream.binance.com/ws',
    testnetUrlPattern: 'wss://testnet.binancefuture.com/ws'
  }
});

registerModule('options-streams', {
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
  },
  serverConfig: {
    mainnetUrlPattern: 'wss://nbstream.binance.com:9443/ws',
    testnetUrlPattern: 'wss://testnet.binance.vision/ws'
  }
});

registerModule('pmargin', {
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
  },
  serverConfig: {
    mainnetUrlPattern: 'wss://fstream.binance.com/pm/ws',
    testnetUrlPattern: 'wss://stream.binancefuture.com/pm/ws'
  }
});