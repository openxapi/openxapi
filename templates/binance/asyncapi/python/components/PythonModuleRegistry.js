/*
 * Python Module Registry - Simplified version
 * Only handles module name detection from x-module-name extension
 * All other configuration is handled by module-specific generators
 */

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
    
    // Extract server variables with their metadata
    const serverJson = server.json ? server.json() : (server._json || {});
    const variables = {};
    let hasListenKey = false;
    
    if (serverJson.variables) {
      // Extract all variables with their metadata (enum, default, description)
      Object.entries(serverJson.variables).forEach(([varName, varConfig]) => {
        variables[varName] = {
          description: varConfig.description || '',
          enum: varConfig.enum || [],
          default: varConfig.default || '',
          examples: varConfig.examples || []
        };
        
        // Detect if this server uses listen key authentication
        if (varName.toLowerCase() === 'listenkey') {
          hasListenKey = true;
        }
      });
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
      variables: variables,  // Include the extracted variables
      hasListenKey: hasListenKey,  // Indicate if listen key auth is used
      active: false // Will be set by ServerManager
    });
  });
  
  return serverInfo;
}


/*
 * Utility function to determine module name from context
 * 
 * Priority order:
 * 1. Context packageName (corresponds to the spec file name)
 * 2. Context moduleName (fallback)
 * 3. Auto-detection from title (fallback)
 * 4. Default fallback
 */
export function detectModuleName(asyncapi, context = {}) {
  // 1. Use packageName from context (this matches the spec file name)
  if (context.packageName) {
    return context.packageName;
  }
  
  // 2. Check moduleName as fallback
  if (context.moduleName) {
    // Extract just the module name from full path
    const parts = context.moduleName.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart;
  }
  
  // 4. Check AsyncAPI info title (generic detection)
  if (asyncapi && asyncapi.info && asyncapi.info()) {
    const info = asyncapi.info();
    const title = typeof info.title === 'function' ? info.title() : info.title;
    if (title) {
      const titleLower = title.toLowerCase();
      
      // Generic patterns for module detection
      // Look for common patterns like "spot streams", "futures streams", etc.
      const hasStreams = titleLower.includes('stream') || titleLower.includes('streams');
      
      // Check for market type indicators
      if (titleLower.includes('spot') && hasStreams) return 'spot-streams';
      if (titleLower.includes('spot')) return 'spot';
      
      // Futures detection (generic)
      if ((titleLower.includes('futures') || titleLower.includes('usd-m') || titleLower.includes('linear')) && hasStreams) {
        return 'futures-streams';
      }
      if (titleLower.includes('futures') || titleLower.includes('usd-m') || titleLower.includes('linear')) {
        return 'futures';
      }
      
      // Coin-margined futures detection
      if ((titleLower.includes('coin-m') || titleLower.includes('inverse')) && hasStreams) {
        return 'coin-futures-streams';
      }
      if (titleLower.includes('coin-m') || titleLower.includes('inverse')) {
        return 'coin-futures';
      }
      
      // Options detection
      if (titleLower.includes('options') && hasStreams) return 'options-streams';
      if (titleLower.includes('options')) return 'options';
      
      // Portfolio/Cross margin detection
      if (titleLower.includes('portfolio') || titleLower.includes('cross')) {
        return 'portfolio-margin';
      }
      
      // Exchange-specific patterns (kept for backward compatibility)
      if (titleLower.includes('umfutures') && hasStreams) return 'umfutures-streams';
      if (titleLower.includes('umfutures')) return 'umfutures';
      if (titleLower.includes('cmfutures') && hasStreams) return 'cmfutures-streams';
      if (titleLower.includes('cmfutures')) return 'cmfutures';
      if (titleLower.includes('pmargin')) return 'pmargin';
    }
  }
  
  // 5. Check servers for hints (using generic patterns)
  if (asyncapi && asyncapi.servers) {
    const servers = asyncapi.servers();
    if (servers) {
      const serverMap = typeof servers.all === 'function' ? servers.all() : servers;
      const serverUrls = Object.values(serverMap).map(server => {
        const url = typeof server.url === 'function' ? server.url() : server.url;
        const host = typeof server.host === 'function' ? server.host() : server.host;
        return `${url || ''} ${host || ''}`;
      }).join(' ').toLowerCase();
      
      // Generic patterns for WebSocket servers
      const hasStream = serverUrls.includes('stream');
      const hasWs = serverUrls.includes('/ws') || serverUrls.includes('websocket');
      
      // Look for market type indicators in URLs
      if (serverUrls.includes('spot') && hasStream) return 'spot-streams';
      if (serverUrls.includes('spot') && hasWs) return 'spot';
      
      if ((serverUrls.includes('futures') || serverUrls.includes('linear')) && hasStream) return 'futures-streams';
      if ((serverUrls.includes('futures') || serverUrls.includes('linear')) && hasWs) return 'futures';
      
      if ((serverUrls.includes('coin') || serverUrls.includes('inverse')) && hasStream) return 'coin-futures-streams';
      if ((serverUrls.includes('coin') || serverUrls.includes('inverse')) && hasWs) return 'coin-futures';
      
      if (serverUrls.includes('options') && hasStream) return 'options-streams';
      if (serverUrls.includes('options') && hasWs) return 'options';
      
      // Keep exchange-specific patterns for backward compatibility
      if (serverUrls.includes('dstream') && hasStream) return 'cmfutures-streams';
      if (serverUrls.includes('fstream') && hasStream) return 'umfutures-streams';
      if (serverUrls.includes('nbstream') && hasStream) return 'options-streams';
      if (serverUrls.includes('nbstream') && serverUrls.includes('/eoptions/ws')) return 'options';
      if (serverUrls.includes('dstream')) return 'cmfutures';
      if (serverUrls.includes('fstream') && serverUrls.includes('/pm/ws')) return 'pmargin';
      if (serverUrls.includes('fstream')) return 'umfutures';
      if (serverUrls.includes('stream.binance') || serverUrls.includes('data-stream.binance')) return 'spot-streams';
      if (serverUrls.includes('ws-api.binance')) return 'spot';
    }
  }
  
  // 6. Default fallback
  return 'spot';
}

// NOTE: Module configurations are now primarily extracted from AsyncAPI specs
// These pre-registered modules are kept for backwards compatibility only
// New modules will automatically get their configuration from the spec

// The module registry can be used to override spec-based configuration if needed
// For example, if an exchange has special requirements not captured in the spec

// Example of how to register a module with custom configuration:
// registerModule('custom-module', {
//   authentication: {
//     supportedTypes: ['CUSTOM_AUTH'],
//     defaultType: 'CUSTOM_AUTH'
//   },
//   specialMethods: {
//     customMethod: {
//       requiresAuth: true,
//       customParam: 'value'
//     }
//   }
// });