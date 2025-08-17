import { File, Text } from '@asyncapi/generator-react-sdk';
import { PythonGeneralWebSocketHandlers } from '../components/PythonGeneralWebSocketHandlers.js';
import { extractServerInfo } from '../components/PythonModuleRegistry.js';
import yaml from 'js-yaml';

/**
 * Extract event type mappings from AsyncAPI spec
 * Maps schema names to their x-event-type values
 */
function extractEventTypeMappings(asyncapi) {
  const mappings = {};
  
  try {
    // Get the raw JSON spec which has the x-event-type extensions
    const rawSpec = asyncapi.json();
    
    // Check channels for messages with x-event-type
    if (rawSpec && rawSpec.channels) {
      Object.keys(rawSpec.channels).forEach(channelKey => {
        const channel = rawSpec.channels[channelKey];
        if (channel && channel.messages) {
          Object.keys(channel.messages).forEach(msgKey => {
            const message = channel.messages[msgKey];
            
            // Check if message is a reference
            if (message && message['$ref']) {
              // Resolve the reference
              const refPath = message['$ref'];
              const refParts = refPath.split('/').slice(1); // Remove '#'
              let referencedMessage = rawSpec;
              for (const part of refParts) {
                if (referencedMessage) {
                  referencedMessage = referencedMessage[part];
                }
              }
              if (referencedMessage && referencedMessage['x-event-type']) {
                // Get schema name from payload $ref
                if (referencedMessage.payload && referencedMessage.payload.$ref) {
                  const schemaRefParts = referencedMessage.payload.$ref.split('/');
                  const schemaName = schemaRefParts[schemaRefParts.length - 1];
                  if (schemaName) {
                    mappings[schemaName] = referencedMessage['x-event-type'];
                  }
                }
              }
            }
            // Check direct messages (not references) with x-event-type
            else if (message && message['x-event-type']) {
              // Get schema name from payload $ref
              if (message.payload && message.payload.$ref) {
                const refParts = message.payload.$ref.split('/');
                const schemaName = refParts[refParts.length - 1];
                if (schemaName) {
                  mappings[schemaName] = message['x-event-type'];
                }
              }
            }
          });
        }
      });
    }
    
    // Also check components/messages
    if (rawSpec && rawSpec.components && rawSpec.components.messages) {
      Object.keys(rawSpec.components.messages).forEach(msgKey => {
        const message = rawSpec.components.messages[msgKey];
        if (message && message['x-event-type']) {
          // Get schema name from payload $ref
          if (message.payload && message.payload.$ref) {
            const refParts = message.payload.$ref.split('/');
            const schemaName = refParts[refParts.length - 1];
            if (schemaName) {
              mappings[schemaName] = message['x-event-type'];
            }
          }
        }
      });
    }
  } catch (e) {
    console.warn('Error extracting event type mappings:', e);
  }
  
  // Log warning if no mappings were extracted from spec
  if (Object.keys(mappings).length === 0) {
    console.warn('Warning: No x-event-type mappings found in AsyncAPI spec. Event parsers will use default naming.');
  }
  
  return mappings;
}

/**
 * Detect module information directly from AsyncAPI spec content
 */
function detectModuleFromSpec(asyncapi) {
  try {
    const info = asyncapi.info();
    const title = info.title() || '';
    const description = info.description() || '';
    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    
    // Check title and description for module indicators
    const combined = `${titleLower} ${descLower}`;
    
    // Extract module name from title and description
    if (combined.includes('streams')) {
      if (combined.includes('spot')) return 'spot-streams';
      if (combined.includes('usd-m') || combined.includes('umfutures')) return 'umfutures-streams';
      if (combined.includes('coin-m') || combined.includes('cmfutures')) return 'cmfutures-streams';
      if (combined.includes('options')) return 'options-streams';
      return 'streams';
    } else {
      if (combined.includes('spot')) return 'spot';
      if (combined.includes('usd-m') || combined.includes('umfutures')) return 'umfutures';
      if (combined.includes('coin-m') || combined.includes('cmfutures')) return 'cmfutures';
      if (combined.includes('options')) return 'options';
      if (combined.includes('pmargin') || combined.includes('portfolio')) return 'pmargin';
      
      // Check servers for module detection
      const servers = asyncapi.servers();
      if (servers) {
        const serverMap = typeof servers.all === 'function' ? servers.all() : servers;
        const serverUrls = Object.values(serverMap).map(server => {
          const url = typeof server.url === 'function' ? server.url() : server.url;
          return url || '';
        }).join(' ');
        
        if (serverUrls.includes('nbstream') && serverUrls.includes('/eoptions/ws')) return 'options';
        if (serverUrls.includes('fstream') && serverUrls.includes('/pm/ws')) return 'pmargin';
        if (serverUrls.includes('dstream')) return 'cmfutures';
        if (serverUrls.includes('fstream')) return 'umfutures';
        if (serverUrls.includes('ws-api.binance')) return 'spot';
      }
      
      return 'api';
    }
  } catch (e) {
    return 'api';
  }
}

/**
 * Get module type (streams vs api) from detected module and operations
 */
function getModuleType(detectedModule, asyncapi) {
  // Stream modules based on name
  if (detectedModule.includes('streams')) {
    return 'streams';
  }
  
  // Check operations for event-only modules (like options)
  try {
    const operations = asyncapi.operations();
    if (operations) {
      const operationIds = Object.keys(operations);
      
      // Check if it has send operations (API module)
      const hasSendOperations = operationIds.some(opId => 
        opId.toLowerCase().startsWith('send')
      );
      
      // If it only has receive operations without send operations, treat as streams (event-only)
      const hasReceiveOperations = operationIds.some(opId => 
        opId.toLowerCase().includes('receive')
      );
      
      if (hasReceiveOperations && !hasSendOperations) {
        return 'streams';  // Event-only modules behave like streams
      }
    }
  } catch (e) {
    // Ignore errors
  }
  
  return 'api';
}

/**
 * Determine authentication capabilities from AsyncAPI operations
 */
function getAuthCapabilities(asyncapi) {
  try {
    let operations = null;
    try {
      operations = asyncapi.operations();
    } catch (e) {
      // operations() method might not exist for some specs
    }
    
    if (!operations || typeof operations.all !== 'function') {
      return { requiresAuth: false, authTypes: [], securitySchemes: {} };
    }
    
    const operationsList = operations.all();
    const authTypes = new Set();
    const securitySchemes = {};
    let requiresAuth = false;
    
    // Collect security requirements from operations
    operationsList.forEach(operation => {
      const security = operation.security();
      if (security && security.length > 0) {
        requiresAuth = true;
        security.forEach(secReq => {
          // Each security requirement is an array of SecurityRequirement objects
          if (secReq && secReq.all) {
            secReq.all().forEach(sr => {
              const scheme = sr.scheme();
              if (scheme) {
                const schemeName = scheme.id();
                authTypes.add(schemeName);
                // Store scheme details
                securitySchemes[schemeName] = {
                  type: scheme.type(),
                  description: scheme.description(),
                  in: scheme.in()
                };
              }
            });
          }
        });
      }
    });
    
    // Also check components for security schemes
    const components = asyncapi.components();
    if (components && components.securitySchemes) {
      const schemes = components.securitySchemes();
      if (schemes) {
        Object.keys(schemes).forEach(schemeName => {
          const scheme = schemes[schemeName];
          if (scheme) {
            securitySchemes[schemeName] = {
              type: scheme.type ? scheme.type() : 'apiKey',
              description: scheme.description ? scheme.description() : '',
              in: scheme.in ? scheme.in() : 'user'
            };
          }
        });
      }
    }
    
    return { requiresAuth, authTypes: Array.from(authTypes), securitySchemes };
  } catch (e) {
    return { requiresAuth: false, authTypes: [], securitySchemes: {} };
  }
}

/**
 * Extract zero-parameter methods from AsyncAPI spec
 * These are methods that should not have any parameters added during authentication
 */
function extractZeroParamMethods(asyncapi) {
  const zeroParamMethods = [];
  
  try {
    const rawSpec = asyncapi.json();
    let operations = null;
    try {
      operations = asyncapi.operations();
    } catch (e) {
      // operations() method might not exist for some specs
    }
    
    // Try different ways to get operations
    let operationsList = [];
    if (operations) {
      if (typeof operations.all === 'function') {
        operationsList = operations.all();
      } else if (Array.isArray(operations)) {
        operationsList = operations;
      } else if (typeof operations === 'object') {
        operationsList = Object.keys(operations).map(key => operations[key]);
      }
    }
    
    // If no operations from parsed asyncapi, fall back to raw spec
    if ((!operationsList || operationsList.length === 0) && rawSpec && rawSpec.operations) {
      Object.keys(rawSpec.operations).forEach(operationId => {
        const op = rawSpec.operations[operationId];
        
        // Only process 'send' operations
        if (!operationId.startsWith('send')) return;
        
        // Extract method name from title
        let methodName = '';
        if (op.title && op.title.includes('Send to ')) {
          methodName = op.title.replace('Send to ', '').trim();
        }
        
        if (methodName) {
          // Check for security
          const hasAuth = op.security && op.security.length > 0;
          
          // Check for params in request message
          let hasRequestParams = false;
          if (op.channel && rawSpec.channels) {
            const channelKey = op.channel.$ref ? op.channel.$ref.replace('#/channels/', '') : op.channel;
            const channel = rawSpec.channels[channelKey];
            if (channel && op.messages) {
              op.messages.forEach(msgRef => {
                const msgKey = msgRef.$ref ? msgRef.$ref.split('/').pop() : msgRef;
                if (channel.messages && channel.messages[msgKey]) {
                  const msg = channel.messages[msgKey];
                  if (msg.$ref) {
                    const refParts = msg.$ref.split('/');
                    const msgName = refParts[refParts.length - 1];
                    if (rawSpec.components && rawSpec.components.messages && rawSpec.components.messages[msgName]) {
                      const message = rawSpec.components.messages[msgName];
                      if (message.payload && message.payload.properties) {
                        if (message.payload.properties.params) {
                          hasRequestParams = true;
                        }
                      }
                    }
                  }
                }
              });
            }
          }
          
          // If method has auth but no request params, it's a zero-param method
          if (hasAuth && !hasRequestParams) {
            zeroParamMethods.push(methodName);
          }
        }
      });
    } else if (operationsList && operationsList.length > 0) {
      operationsList.forEach(operation => {
        const operationId = operation.id();
        if (!operationId) return;
        
        // Extract method name from operation ID
        let methodName = '';
        if (operationId.startsWith('send')) {
          const title = operation.title ? operation.title() : '';
          if (title && title.includes('Send to ')) {
            methodName = title.replace('Send to ', '').trim();
          } else {
            // Fallback: convert sendOrderPlace -> order.place
            methodName = operationId.replace('send', '');
            methodName = methodName.replace(/([A-Z])/g, '.$1').toLowerCase();
            if (methodName.startsWith('.')) {
              methodName = methodName.substring(1);
            }
          }
        }
        
        if (methodName) {
          // Check if this operation has security requirements but no request parameters
          // These methods authenticate at session level, not per-request
          const security = operation.security();
          const hasAuth = security && security.length > 0;
          
          // Check if operation has request message with parameters
          let hasRequestParams = false;
          try {
            // Get the operation's channel and messages
            const channel = operation.channel();
            if (channel) {
              const messages = channel.messages();
              if (messages) {
                // Check each message for parameters
                Object.values(messages).forEach(message => {
                  if (message.payload) {
                    const payload = message.payload();
                    // Check if payload has a 'params' property
                    if (payload && payload.properties) {
                      const props = Object.keys(payload.properties());
                      // If the message has a 'params' property, it has request parameters
                      if (props.includes('params')) {
                        hasRequestParams = true;
                      }
                    }
                  }
                });
              }
            }
          } catch (e) {
            // Fallback: check raw spec for operation parameters
            if (rawSpec && rawSpec.operations && rawSpec.operations[operationId]) {
              const opSpec = rawSpec.operations[operationId];
              if (opSpec.channel && rawSpec.channels) {
                const channelSpec = rawSpec.channels[opSpec.channel.replace('#/channels/', '')];
                if (channelSpec && channelSpec.messages) {
                  Object.values(channelSpec.messages).forEach(msg => {
                    // Check if message references a component
                    if (msg.$ref) {
                      const msgRef = msg.$ref.replace('#/components/messages/', '');
                      if (rawSpec.components && rawSpec.components.messages && rawSpec.components.messages[msgRef]) {
                        const message = rawSpec.components.messages[msgRef];
                        if (message.payload && message.payload.properties) {
                          // Check if the payload has a 'params' property
                          if (message.payload.properties.params) {
                            hasRequestParams = true;
                          }
                        }
                      }
                    }
                  });
                }
              }
            }
          }
          
          // If method has auth but no request params, it's a zero-param method
          if (hasAuth && !hasRequestParams) {
            zeroParamMethods.push(methodName);
          }
        }
      });
    }
  } catch (e) {
    console.warn('Error extracting zero-param methods:', e.message);
  }
  
  // If extraction failed or found nothing, return empty array
  // The SDK will handle this gracefully
  return zeroParamMethods;
}

/**
 * Build operation security map from AsyncAPI spec
 */
function buildOperationSecurityMap(asyncapi) {
  const operationSecurityMap = {};
  
  try {
    const rawSpec = asyncapi.json();
    
    // First try to use raw spec operations which is more reliable
    if (rawSpec && rawSpec.operations) {
      Object.keys(rawSpec.operations).forEach(operationId => {
        const op = rawSpec.operations[operationId];
        
        // Extract method name from title
        let methodName = '';
        if (op.title && op.title.includes('Send to ')) {
          methodName = op.title.replace('Send to ', '').trim();
        }
        
        if (methodName) {
          // Extract security scheme name
          if (op.security && op.security.length > 0) {
            const secRef = op.security[0];
            if (secRef && secRef['$ref']) {
              const schemeName = secRef['$ref'].split('/').pop();
              if (schemeName) {
                operationSecurityMap[methodName] = schemeName;
              }
            }
          }
        }
      });
      
      // If we got mappings from raw spec, return them
      if (Object.keys(operationSecurityMap).length > 0) {
        return operationSecurityMap;
      }
    }
    
    // Fallback to parsed operations if raw spec doesn't work
    let operations = null;
    try {
      operations = asyncapi.operations();
    } catch (e) {
      // operations() method might not exist for some specs
    }
    
    // Try different ways to get operations
    let operationsList = [];
    if (operations) {
      if (typeof operations.all === 'function') {
        operationsList = operations.all();
      } else if (Array.isArray(operations)) {
        operationsList = operations;
      } else if (typeof operations === 'object') {
        // Convert operations object to array
        operationsList = Object.keys(operations).map(key => operations[key]);
      }
    }
    
    if (operationsList && operationsList.length > 0) {
      
      operationsList.forEach(operation => {
        const operationId = operation.id();
        if (!operationId) return;
        
        // Extract method name from operation ID (e.g., 'sendOrderPlace' -> 'order.place')
        let methodName = '';
        if (operationId.startsWith('send')) {
          // For send operations, extract the method name
          const title = operation.title ? operation.title() : '';
          if (title && title.includes('Send to ')) {
            methodName = title.replace('Send to ', '').trim();
          } else {
            // Fallback: convert sendOrderPlace -> order.place
            methodName = operationId.replace('send', '');
            // Convert camelCase to dot notation
            methodName = methodName.replace(/([A-Z])/g, '.$1').toLowerCase();
            if (methodName.startsWith('.')) {
              methodName = methodName.substring(1);
            }
          }
        }
        
        if (methodName) {
          // Get security requirements for this operation
          // First try the raw spec approach which is more reliable
          let securitySchemeName = null;
          
          // Check raw spec for security
          if (rawSpec && rawSpec.operations && rawSpec.operations[operationId]) {
            const opSpec = rawSpec.operations[operationId];
            if (opSpec.security && opSpec.security.length > 0) {
              const securityRef = opSpec.security[0];
              if (securityRef && securityRef['$ref']) {
                // Extract security scheme name from $ref
                // Format: #/components/securitySchemes/userData
                const refPath = securityRef['$ref'];
                const schemeName = refPath.split('/').pop();
                if (schemeName) {
                  securitySchemeName = schemeName;
                }
              }
            }
          }
          
          // Fallback to parsed operation security
          if (!securitySchemeName) {
            const security = operation.security();
            if (security && security.length > 0) {
              // Handle both direct security and $ref format
              const secReq = security[0];
              if (secReq) {
                // Check if it's a $ref format
                if (secReq['$ref']) {
                  // Extract security scheme name from $ref
                  // Format: #/components/securitySchemes/userData
                  const refPath = secReq['$ref'];
                  const schemeName = refPath.split('/').pop();
                  if (schemeName) {
                    securitySchemeName = schemeName;
                  }
                } else if (secReq.all) {
                  // Handle the parsed format
                  const schemes = secReq.all();
                  if (schemes && schemes.length > 0) {
                    const scheme = schemes[0].scheme();
                    if (scheme) {
                      securitySchemeName = scheme.id();
                    }
                  }
                } else {
                  // Check for direct scheme names in the security object
                  const schemeNames = Object.keys(secReq);
                  if (schemeNames.length > 0) {
                    securitySchemeName = schemeNames[0];
                  }
                }
              }
            }
          }
          
          if (securitySchemeName) {
            operationSecurityMap[methodName] = securitySchemeName;
          }
        }
        
        // Also check for x-binance-security-type extension
        const extensions = operation.extensions();
        if (extensions && extensions['x-binance-security-type']) {
          const binanceSecType = extensions['x-binance-security-type'];
          // Store the original Binance security type as well if available
          if (methodName && !operationSecurityMap[methodName]) {
            // Map Binance security types to scheme names
            if (binanceSecType === 'TRADE') {
              operationSecurityMap[methodName] = 'trade';
            } else if (binanceSecType === 'USER_DATA') {
              operationSecurityMap[methodName] = 'userData';
            } else if (binanceSecType === 'USER_STREAM') {
              operationSecurityMap[methodName] = 'userStream';
            } else if (binanceSecType === 'SIGNED') {
              operationSecurityMap[methodName] = 'userData';
            }
          }
        }
      });
    }
  } catch (e) {
    console.warn('Error building operation security map:', e.message);
  }
  
  return operationSecurityMap;
}

export default function ({ asyncapi, params, originalAsyncAPI }) {
  const packageName = params.packageName || 'binance-websocket';
  const moduleName = params.moduleName || 'binance-websocket-client';
  const version = params.version || '0.1.0';
  const author = params.author || 'openxapi';
  
  // Extract module information directly from AsyncAPI spec
  const apiInfo = asyncapi.info();
  const apiTitle = apiInfo.title();
  const apiDescription = apiInfo.description();
  const apiVersion = apiInfo.version();
  
  // Detect module type from spec content rather than hardcoded detection
  const detectedModule = detectModuleFromSpec(asyncapi);
  
  const moduleType = getModuleType(detectedModule, asyncapi);
  const authCapabilities = getAuthCapabilities(asyncapi);
  
  // Try to get the raw spec for extraction
  let rawSpec = null;
  
  // The originalAsyncAPI is a stringified version of the spec
  // We need to parse it to get the actual JSON object
  try {
    if (originalAsyncAPI) {
      // originalAsyncAPI is a string, parse it
      try {
        rawSpec = JSON.parse(originalAsyncAPI);
      } catch (jsonErr) {
        // If JSON parse fails, try YAML
        try {
          rawSpec = yaml.load(originalAsyncAPI);
        } catch (yamlErr) {
          console.warn('Warning: Unable to parse originalAsyncAPI as JSON or YAML');
        }
      }
    }
    
    // Fallback to asyncapi.json() if originalAsyncAPI doesn't work
    if (!rawSpec && typeof asyncapi.json === 'function') {
      const jsonResult = asyncapi.json();
      // Check if it's a valid object with expected properties
      if (jsonResult && typeof jsonResult === 'object' && !Array.isArray(jsonResult)) {
        // Check if it has AsyncAPI structure
        if (jsonResult.asyncapi || jsonResult.info || jsonResult.channels || jsonResult.operations) {
          rawSpec = jsonResult;
        }
      }
    }
  } catch (e) {
    console.warn('Warning: Unable to get raw spec:', e.message);
  }
  
  
  // If we can't get raw spec, try to build mappings from parsed objects
  let eventTypeMappings = {};
  let operationSecurityMap = {};
  let zeroParamMethods = [];
  
  if (rawSpec) {
    console.log('Extracting from raw spec with keys:', Object.keys(rawSpec).join(', '));
    
    // Create a mock asyncapi object that uses rawSpec for json()
    const mockAsyncapi = {
      ...asyncapi,
      json: () => rawSpec
    };
    
    // Extract from raw spec
    eventTypeMappings = extractEventTypeMappings(mockAsyncapi);
    operationSecurityMap = buildOperationSecurityMap(mockAsyncapi);
    zeroParamMethods = extractZeroParamMethods(mockAsyncapi);
    
    console.log(`Extracted ${Object.keys(eventTypeMappings).length} event mappings, ${Object.keys(operationSecurityMap).length} security mappings, ${zeroParamMethods.length} zero-param methods`);
  } else {
    console.warn('Warning: Could not get raw spec for extraction');
  }
  
  // If extraction failed, try alternative methods or leave empty for graceful degradation
  if (Object.keys(operationSecurityMap).length === 0) {
    console.warn('Warning: No operation security mappings extracted from AsyncAPI spec. Authentication may not work correctly.');
    // The SDK will still work but authentication will need to be handled manually
  }
  
  if (Object.keys(eventTypeMappings).length === 0) {
    console.warn('Warning: No event type mappings extracted from AsyncAPI spec. Event parsers will use default naming.');
    // The SDK will fall back to class name-based event type detection
  }
  
  if (zeroParamMethods.length === 0) {
    console.warn('Warning: No zero-param methods extracted from AsyncAPI spec.');
    // The SDK may send unnecessary parameters to some methods
  }
  
  // Extract complete server information from AsyncAPI spec
  const serverInfoList = extractServerInfo(asyncapi);
  
  // Generate handlers code dynamically from AsyncAPI operations
  const handlersCode = PythonGeneralWebSocketHandlers({ asyncapi, context: { packageName, moduleName, detectedModule, moduleType } });
  const usesModels = handlersCode && handlersCode.includes('models.');
  
  // Generate operation security map as Python code
  let operationSecurityMapPython = Object.entries(operationSecurityMap)
    .map(([key, value]) => `'${key}': '${value}'`)
    .join(',\n            ');
  
  // If no security mappings were extracted, leave empty
  // The SDK will work in public-only mode
  if (!operationSecurityMapPython) {
    operationSecurityMapPython = '';
  }
  
  // Generate zero-param methods as Python list
  let zeroParamMethodsPython = zeroParamMethods.map(m => `'${m}'`).join(', ');
  if (!zeroParamMethodsPython) {
    // If no methods extracted, use empty list
    zeroParamMethodsPython = '';
  }
  
  // Generate event type mappings as Python dictionary
  let eventTypeMappingsPython = Object.entries(eventTypeMappings)
    .map(([key, value]) => `'${key}': '${value}'`)
    .join(',\n                            ');
  if (!eventTypeMappingsPython) {
    eventTypeMappingsPython = '';
  }

  // Set first server as default if available
  const defaultServerUrl = serverInfoList.length > 0 ? serverInfoList[0].url : 'wss://stream.binance.com:9443/ws';

  return (
    <File name="client.py">
      <Text>{`"""
${apiTitle}

${apiDescription || `WebSocket client for ${apiTitle}`}
Generated from AsyncAPI ${apiVersion} specification.

API Title: ${apiTitle}
API Version: ${apiVersion}
Module Type: ${moduleType} (${detectedModule})
Available Servers: ${serverInfoList.length}
${serverInfoList.map(server => `  - ${server.name}: ${server.url} (${server.title || server.summary || 'Server'})`).join('\n')}
Authentication: ${Object.keys(authCapabilities.securitySchemes).length > 0 ? Object.keys(authCapabilities.securitySchemes).join(', ') : 'None required'}

Generated by: OpenXAPI (${author})
Template Version: ${version}
"""

import asyncio
import json
import logging
import os
import time
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional, Union
from urllib.parse import urlencode

import websockets
from pydantic import BaseModel, ValidationError

try:
    from .models import *
    from .auth import BinanceAuth
except ImportError:
    # For standalone usage
    try:
        from models import *
        from auth import BinanceAuth
    except ImportError:
        pass


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class WebSocketError(Exception):
    """Custom exception for WebSocket errors"""
    pass


class AuthenticationError(Exception):
    """Custom exception for authentication errors"""
    pass


class BinanceWebSocketClient:
    """
    ${apiTitle} - Async WebSocket Client
    
    ${apiDescription || `WebSocket client for ${apiTitle}`}
    
    This client is generated dynamically from the AsyncAPI specification and provides:
    ${moduleType === 'streams' ? '- Stream subscription methods (subscribe/unsubscribe)' : '- WebSocket API request methods'}
    - Connection management with server switching
    - Authentication support${authCapabilities.requiresAuth ? ' (API Key & Signature)' : ' (Public endpoints)'}
    - Automatic reconnection and error handling
    
    Specification Details:
    - API Version: ${apiVersion}
    - Module Type: ${moduleType} (${detectedModule})
    - Available Servers: ${serverInfoList.length}
${serverInfoList.map(server => `      * ${server.name}: ${server.url}`).join('\n')}
    - Authentication: ${Object.keys(authCapabilities.securitySchemes).length > 0 ? Object.keys(authCapabilities.securitySchemes).join(', ') : 'None required'}
    
    All methods are generated automatically from AsyncAPI operations.
    """
    
    def __init__(
        self,
        auth: Optional[BinanceAuth] = None,
        auto_reconnect: bool = True,
        ping_interval: int = 20,
        ping_timeout: int = 10,
        max_message_size: int = 10 * 1024 * 1024  # 10MB default
    ):
        """
        Initialize the WebSocket client
        
        Args:
            auth: Authentication credentials for private endpoints
            auto_reconnect: Automatically reconnect on connection loss
            ping_interval: Ping interval in seconds
            ping_timeout: Ping timeout in seconds
            max_message_size: Maximum WebSocket message size in bytes (default: 10MB)
        """
        self.auth = auth
        self.auto_reconnect = auto_reconnect
        self.ping_interval = ping_interval
        self.ping_timeout = ping_timeout
        self.max_message_size = max_message_size
        
        # Connection state
        self._websocket: Optional[websockets.WebSocketServerProtocol] = None
        self._connection_lock = asyncio.Lock()
        self._is_connected = False
        self._should_reconnect = True
        
        # Message handling
        self._handlers: Dict[str, Callable] = {}
        self._typed_handlers: Dict[str, Callable] = {}  # Type-safe handlers
        self._response_handlers: Dict[str, Callable] = {}
        self._request_id = 0
        self._message_history: List[Dict] = []
        
        # Event type mapping for automatic parsing
        self._event_parsers = self._initialize_event_parsers()
        
        # Server configuration from AsyncAPI spec
        self.servers = {
${serverInfoList.map(server => `            "${server.name}": {
                "name": "${server.name}",
                "url": "${server.url}",
                "host": "${server.host}",
                "pathname": "${server.pathname}",
                "protocol": "${server.protocol}",
                "title": "${server.title}",
                "summary": "${server.summary}",
                "description": "${server.description}",
                "variables": ${JSON.stringify(server.variables || {})},
                "active": False
            }`).join(',\n')}
        }
        self.module = "${detectedModule}"
        
        # Set default active server (first server or fallback)
        ${serverInfoList.length > 0 ? `
        self.active_server = "${serverInfoList[0].name}"
        self.servers["${serverInfoList[0].name}"]["active"] = True
        self.base_url = "${serverInfoList[0].url}"` : `
        self.active_server = None
        self.base_url = "${defaultServerUrl}"`}
        
        # Background tasks
        self._listen_task: Optional[asyncio.Task] = None
        self._ping_task: Optional[asyncio.Task] = None
        
        # Security configuration from AsyncAPI spec
        self._operation_security_map = {
            ${operationSecurityMapPython}
        }
        self._security_schemes = ${JSON.stringify(authCapabilities.securitySchemes, null, 12).replace(/"/g, "'")}

    def get_server_info(self) -> Dict[str, Any]:
        """
        Get current server configuration information
        
        Returns:
            Dict containing server configuration details
        """
        active_server_info = self.servers.get(self.active_server, {}) if self.active_server else {}
        return {
            'module': self.module,
            'active_server': self.active_server,
            'base_url': self.base_url,
            'active_server_info': active_server_info,
            'available_servers': list(self.servers.keys()),
            'total_servers': len(self.servers)
        }
    
    def switch_server(self, server_name: str) -> bool:
        """
        Switch to a different server
        
        Args:
            server_name: Name of the server to switch to
            
        Returns:
            True if successful, False if server not found
            
        Note:
            This will close existing connections. Call connect() to reconnect.
        """
        if server_name not in self.servers:
            logger.error(f"Server '{server_name}' not found. Available servers: {list(self.servers.keys())}")
            return False
            
        # Deactivate current server
        if self.active_server and self.active_server in self.servers:
            self.servers[self.active_server]["active"] = False
            
        # Activate new server
        self.active_server = server_name
        self.servers[server_name]["active"] = True
        self.base_url = self.servers[server_name]["url"]
        
        # Close existing connection if connected
        if self._is_connected:
            logger.info(f"Switching to server '{server_name}': {self.base_url}")
            
        return True
    
    def get_available_servers(self) -> List[str]:
        """
        Get list of available server names
        
        Returns:
            List of server names
        """
        return list(self.servers.keys())
    
    def get_connection_url(self, **variables) -> str:
        """
        Get the connection URL with resolved server variables
        
        Args:
            **variables: Server variables to resolve (e.g., streamPath='ws')
            
        Returns:
            Full WebSocket URL with variables resolved
        """
        base = self.base_url
        
        # Get server variables configuration for the active server
        if self.active_server and self.active_server in self.servers:
            server_vars = self.servers[self.active_server].get('variables', {})
            
            # Process each variable defined in the server configuration
            for var_name, var_config in server_vars.items():
                placeholder = f'{{{var_name}}}'
                
                if placeholder in base:
                    # Use provided value, or fall back to default
                    if var_name in variables:
                        value = variables[var_name]
                    elif var_config.get('default'):
                        value = var_config['default']
                    else:
                        # If no value and no default, use first enum value if available
                        value = var_config['enum'][0] if var_config.get('enum') else ''
                    
                    base = base.replace(placeholder, value)
        
        return base

    def _generate_request_id(self) -> int:
        """Generate a unique request ID"""
        self._request_id += 1
        return self._request_id
    
    def _extract_request_params(self, request_obj: Any) -> Dict[str, Any]:
        """
        Extract parameters from a request object for backward compatibility
        
        Args:
            request_obj: Request object (Pydantic model or dict)
            
        Returns:
            Dict containing id, method, and params
        """
        if hasattr(request_obj, 'model_dump'):
            # Pydantic model - use by_alias=True to get API field names
            data = request_obj.model_dump(by_alias=True, exclude_none=True)
        elif isinstance(request_obj, dict):
            # Dictionary
            data = {k: v for k, v in request_obj.items() if v is not None}
        else:
            # Try to convert to dict
            try:
                data = dict(request_obj)
            except:
                raise ValueError(f"Cannot extract parameters from object of type {type(request_obj)}")
        
        # Extract id, method, and params
        request_id = data.get('id')
        method = data.get('method')
        
        # Handle params extraction
        if 'params' in data:
            if hasattr(request_obj, 'to_params_dict'):
                # Use explicit field extraction if available
                params = request_obj.to_params_dict()
            else:
                params = data['params']
        else:
            # Create params from remaining fields (excluding id and method)
            params = {k: v for k, v in data.items() if k not in ['id', 'method']}
        
        return {
            'id': request_id,
            'method': method,
            'params': params if params else {}
        }

    async def connect(self, uri: Optional[str] = None) -> None:
        """
        Connect to the WebSocket server using the active server configuration
        
        Args:
            uri: Custom WebSocket URI (uses active server if not provided)
            
        Note:
            For stream modules, this defaults to ConnectToSingleStream behavior
        """
        async with self._connection_lock:
            if self._is_connected:
                logger.warning("Already connected to WebSocket")
                return
                
            # Determine connection URI
            if uri:
                connect_uri = uri
            else:
                # For stream modules, default to single stream connection
                ${moduleType === 'streams' ? `return await self.connect_to_single_stream()` : `connect_uri = self.get_connection_url()`}
                
            logger.info(f"Connecting to WebSocket: {connect_uri} (module: {self.module}, server: {self.active_server})")
            
            try:
                self._websocket = await websockets.connect(
                    connect_uri,
                    ping_interval=self.ping_interval,
                    ping_timeout=self.ping_timeout,
                    max_size=self.max_message_size  # Configurable message size limit
                )
                self._is_connected = True
                
                # Start background tasks
                self._listen_task = asyncio.create_task(self._listen_for_messages())
                self._ping_task = asyncio.create_task(self._ping_handler())
                
                logger.info("WebSocket connection established")
                
            except Exception as e:
                logger.error(f"Failed to connect to WebSocket: {e}")
                raise WebSocketError(f"Connection failed: {e}")

    async def connect_to_server(self, server_name: str) -> None:
        """
        Connect to a specific server by name
        
        Args:
            server_name: Name of the server to connect to
        """
        if not self.switch_server(server_name):
            raise WebSocketError(f"Failed to switch to server '{server_name}'")
        
        await self.connect()

    async def connect_to_single_stream(self, time_unit: Optional[str] = None) -> None:
        """
        Connect to single stream endpoint with optional timeUnit parameter
        (For stream modules only - uses streamPath='ws' server variable)
        
        Args:
            time_unit: Optional time unit parameter (e.g., "?timeUnit=MICROSECOND")
        """
        # Use connect_with_variables to handle the template replacement
        await self.connect_with_variables(streamPath='ws', timeUnit=time_unit)

    async def connect_to_combined_stream(self, time_unit: Optional[str] = None) -> None:
        """
        Connect to combined stream endpoint with optional timeUnit parameter
        (For stream modules only - uses streamPath='stream' server variable)
        
        Args:
            time_unit: Optional time unit parameter (e.g., "?timeUnit=MICROSECOND")
        """
        # Use connect_with_variables to handle the template replacement
        await self.connect_with_variables(streamPath='stream', timeUnit=time_unit)

    async def connect_to_single_stream_microsecond(self) -> None:
        """
        Connect to single stream endpoint with microsecond precision
        (For stream modules only)
        """
        await self.connect_to_single_stream("?timeUnit=MICROSECOND")

    async def connect_to_combined_stream_microsecond(self) -> None:
        """
        Connect to combined stream endpoint with microsecond precision
        (For stream modules only)
        """
        await self.connect_to_combined_stream("?timeUnit=MICROSECOND")

    async def connect_with_variables(self, **variables) -> None:
        """
        Connect using provided server variables (like {streamPath}, {listenKey})
        
        Args:
            **variables: Server variables to resolve in the URL template
                        Special handling for 'timeUnit' which becomes a query parameter
            
        Example:
            await client.connect_with_variables(streamPath="ws", listenKey="your_listen_key")
            await client.connect_with_variables(streamPath="stream")
            await client.connect_with_variables(streamPath="ws", timeUnit="?timeUnit=MICROSECOND")
        """
        async with self._connection_lock:
            if self._is_connected:
                logger.warning("Already connected to WebSocket")
                return
                
            # Extract timeUnit if present (it's a query param, not a server variable)
            time_unit = variables.pop('timeUnit', None)
            
            # Use get_connection_url to properly resolve server variables with defaults
            connect_uri = self.get_connection_url(**variables)
            
            # Append timeUnit as query parameter if provided
            if time_unit:
                connect_uri += time_unit
                    
            logger.info(f"Connecting with variables: {connect_uri} (module: {self.module}, server: {self.active_server})")
            
            try:
                self._websocket = await websockets.connect(
                    connect_uri,
                    ping_interval=self.ping_interval,
                    ping_timeout=self.ping_timeout,
                    max_size=self.max_message_size
                )
                self._is_connected = True
                
                # Start background tasks
                self._listen_task = asyncio.create_task(self._listen_for_messages())
                self._ping_task = asyncio.create_task(self._ping_handler())
                
                logger.info("WebSocket connection with variables established")
                
            except Exception as e:
                logger.error(f"Failed to connect with variables: {e}")
                raise WebSocketError(f"Connection with variables failed: {e}")

    async def connect_to_server_with_variables(self, server_name: str, **variables) -> None:
        """
        Connect to a specific server using provided server variables
        
        Args:
            server_name: Name of the server to connect to
            **variables: Server variables to resolve in the URL template
        """
        if not self.switch_server(server_name):
            raise WebSocketError(f"Failed to switch to server '{server_name}'")
        
        await self.connect_with_variables(**variables)

    async def disconnect(self) -> None:
        """Disconnect from the WebSocket server"""
        async with self._connection_lock:
            self._should_reconnect = False
            self._is_connected = False
            
            # Cancel background tasks
            if self._listen_task:
                self._listen_task.cancel()
                try:
                    await self._listen_task
                except asyncio.CancelledError:
                    pass
                    
            if self._ping_task:
                self._ping_task.cancel()
                try:
                    await self._ping_task
                except asyncio.CancelledError:
                    pass
            
            # Close WebSocket connection
            if self._websocket:
                await self._websocket.close()
                self._websocket = None
                
            logger.info("WebSocket connection closed")

    async def _send_message(self, message: Dict[str, Any]) -> None:
        """
        Send a message through the WebSocket connection
        
        Args:
            message: Message to send
        """
        if not self._is_connected or not self._websocket:
            raise WebSocketError("Not connected to WebSocket")
            
        try:
            # Note: Authentication is handled in _send_request for authenticated methods
            # to avoid duplicate authentication calls
            message_str = json.dumps(message)
            await self._websocket.send(message_str)
            logger.debug(f"Sent message: {message_str}")
            
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            raise WebSocketError(f"Send failed: {e}")

    def _get_auth_type(self, method: str) -> Optional[str]:
        """
        Determine the authentication type required for a given method
        by checking the AsyncAPI spec's operation security map
        
        Args:
            method: WebSocket method name
            
        Returns:
            Security scheme name from AsyncAPI spec or None if no auth required
            
        Security Schemes (from AsyncAPI spec):
        - userStream: Only apiKey required (for User Data Stream management)
        - trade: apiKey, timestamp, signature required (for trading operations)
        - userData: apiKey, timestamp, signature required (for private user data)
        """
        if not method:
            return None
            
        # Check the operation security map from AsyncAPI spec
        security_scheme = self._operation_security_map.get(method)
        
        if security_scheme:
            # Return the security scheme name from the spec
            # This will be 'trade', 'userData', or 'userStream'
            return security_scheme.upper().replace('USERSTREAM', 'USER_STREAM').replace('USERDATA', 'USER_DATA')
            
        # No authentication required for public methods
        return None

    def _add_authentication(self, message: Dict[str, Any], auth_type: str = "USER_DATA") -> Dict[str, Any]:
        """
        Add authentication to a message based on authentication type (following Go SDK patterns)
        
        Args:
            message: Message to authenticate
            auth_type: Authentication type from AsyncAPI spec (USER_STREAM, USER_DATA, TRADE, etc.)
        """
        if not self.auth:
            raise AuthenticationError("Authentication required but not provided")
            
        # Special case: some methods should send 0 parameters
        # These methods work with session-based authentication after connection
        method = message.get('method', '')
        # Zero-param methods extracted from AsyncAPI spec
        zero_param_methods = [${zeroParamMethodsPython}]
        if method in zero_param_methods:
            # Don't add any parameters for these methods - they send 0 parameters
            # Authentication is handled at the session/connection level
            return message
            
        # For all other authenticated requests, ensure params object exists
        if 'params' not in message:
            message['params'] = {}
        params = message['params']
        
        # Add API key for authenticated requests (except subscribe/unsubscribe)
        params['apiKey'] = self.auth.api_key
        
        # Determine if this auth type requires signature based on AsyncAPI spec
        # userStream only requires apiKey, while trade and userData require full signature
        requires_signature = auth_type in ["TRADE", "USER_DATA", "SIGNED"]
        
        if requires_signature:
            # Add timestamp for signed requests (USER_DATA and TRADE)
            timestamp = int(time.time() * 1000)
            params['timestamp'] = timestamp
            
            # Create signature payload from ALL params (including apiKey and timestamp)
            if isinstance(params, dict):
                query_string = urlencode(sorted(params.items()))
            else:
                query_string = f"apiKey={self.auth.api_key}&timestamp={timestamp}"
                
            # Sign the request and add signature to params
            signature = self.auth.sign(query_string)
            params['signature'] = signature
        
        # For USER_STREAM auth type (except subscribe/unsubscribe), only apiKey is added
        # This matches Go SDK behavior where USER_STREAM methods get apiKey but not timestamp/signature
        
        return message

    async def _listen_for_messages(self) -> None:
        """Listen for incoming WebSocket messages"""
        try:
            async for message in self._websocket:
                try:
                    data = json.loads(message)
                    self._message_history.append({
                        'timestamp': time.time(),
                        'data': data
                    })
                    
                    await self._handle_message(data)
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to decode message: {e}")
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket connection closed")
            if self.auto_reconnect and self._should_reconnect:
                await self._reconnect()
        except Exception as e:
            logger.error(f"Error in message listener: {e}")
            if self.auto_reconnect and self._should_reconnect:
                await self._reconnect()

    async def _handle_message(self, data: Union[Dict[str, Any], List[Dict[str, Any]]]) -> None:
        """Handle incoming WebSocket message"""
        # Handle array responses (when server sends an array of events)
        if isinstance(data, list):
            # Array response - handle each item
            for item in data:
                await self._handle_single_event(item)
            return
        
        # Check for error messages
        if 'error' in data:
            logger.error(f"Received error: {data['error']}")
            return
            
        # Handle subscription confirmations
        if 'result' in data and 'id' in data:
            request_id = str(data['id'])
            if request_id in self._response_handlers:
                handler = self._response_handlers.pop(request_id)
                handler(data)  # Don't await - this is a lambda function, not a coroutine
            return
            
        # Handle combined stream data (wrapped with stream name)
        if 'stream' in data and 'data' in data:
            stream_name = data['stream']
            stream_data = data['data']
            
            # Check if stream_data is an array (some streams return arrays of events)
            if isinstance(stream_data, list):
                # Handle array of events
                for item in stream_data:
                    await self._handle_stream_event(stream_name, item)
            else:
                # Handle single event
                await self._handle_stream_event(stream_name, stream_data)
        else:
            # Handle single stream data (direct event data)
            await self._handle_single_event(data)
    
    async def _handle_single_event(self, data: Dict[str, Any]) -> None:
        """Handle a single event (not wrapped in stream format) with automatic parsing"""
        # Detect event type using improved logic
        event_type = self._get_event_type(data)
        
        # Check if this is a WebSocket API event with 'event' wrapper
        # (User Data Stream events from WebSocket API have this format)
        if 'event' in data and isinstance(data['event'], dict) and 'e' in data['event']:
            # Extract the actual event from the wrapper
            actual_event = data['event']
            event_type = actual_event.get('e')
            # Pass only the event data to parsers, not the wrapper
            event_data = actual_event
        else:
            # WebSocket Streams format - event type at root level
            event_data = data
        
        # Try to parse event to typed model if parser exists
        parsed_event = None
        if event_type and event_type in self._event_parsers:
            try:
                from pydantic import ValidationError
                parser_class = self._event_parsers[event_type]
                parsed_event = parser_class(**event_data)
                logger.debug(f"Successfully parsed {event_type} event to {parser_class.__name__}")
            except ValidationError as e:
                logger.error(f"Validation error parsing {event_type} event: {e}")
                # Continue with raw data if parsing fails
            except Exception as e:
                logger.error(f"Error parsing {event_type} event: {e}")
        
        # Track if we found a specific handler
        handled = False
        
        # First, try typed handlers with parsed models
        if event_type and parsed_event and event_type in self._typed_handlers:
            handler = self._typed_handlers[event_type]
            try:
                await handler(parsed_event)
                handled = True
            except Exception as e:
                logger.error(f"Error in typed handler for event {event_type}: {e}")
        
        # Then try regular handlers with raw data
        if not handled and event_type and event_type in self._handlers:
            handler = self._handlers[event_type]
            try:
                await handler(event_data)
                handled = True
            except Exception as e:
                logger.error(f"Error in handler for event {event_type}: {e}")
        
        # If no specific handler was found, use the universal handler
        if not handled and '*' in self._handlers:
            try:
                await self._handlers['*'](event_data)
            except Exception as e:
                logger.error(f"Error in universal handler: {e}")
    
    async def _handle_stream_event(self, stream_name: str, data: Dict[str, Any]) -> None:
        """Handle an event from a specific stream"""
        # Find appropriate handler based on stream pattern
        for pattern, handler in self._handlers.items():
            if stream_name.startswith(pattern) or pattern == '*':
                try:
                    await handler(data)
                except Exception as e:
                    logger.error(f"Error in handler for {stream_name}: {e}")
                break

    async def _ping_handler(self) -> None:
        """Handle periodic ping to keep connection alive"""
        while self._is_connected:
            try:
                await asyncio.sleep(self.ping_interval)
                if self._websocket:
                    pong_waiter = await self._websocket.ping()
                    await asyncio.wait_for(pong_waiter, timeout=self.ping_timeout)
                    logger.debug("Ping successful")
            except asyncio.TimeoutError:
                logger.warning("Ping timeout - connection may be lost")
                break
            except Exception as e:
                logger.error(f"Ping error: {e}")
                break

    async def _reconnect(self) -> None:
        """Attempt to reconnect to WebSocket"""
        if not self._should_reconnect:
            return
            
        logger.info("Attempting to reconnect...")
        await self.disconnect()
        
        retry_count = 0
        max_retries = 5
        
        while retry_count < max_retries and self._should_reconnect:
            try:
                await asyncio.sleep(min(retry_count * 2, 30))  # Exponential backoff
                await self.connect()
                logger.info("Reconnection successful")
                return
            except Exception as e:
                retry_count += 1
                logger.error(f"Reconnection attempt {retry_count} failed: {e}")
                
        logger.error("Max reconnection attempts reached")

    async def request(self, request_obj: Any) -> Dict[str, Any]:
        """
        Send a request using a request object (backward compatibility)
        
        Args:
            request_obj: Request object (Pydantic model or dict)
            
        Returns:
            Dict: API response
            
        Raises:
            WebSocketError: If not connected or request fails
            AuthenticationError: If authentication required but not provided
        """
        if not self._is_connected or not self._websocket:
            raise WebSocketError("Not connected to WebSocket")
        
        # Extract request parameters
        extracted = self._extract_request_params(request_obj)
        request_id = extracted['id'] if extracted['id'] is not None else self._generate_request_id()
        method = extracted['method']
        params = extracted['params']
        
        # Create request message
        message = {
            "id": request_id,
            "method": method
        }
        
        if params:
            message["params"] = params
        
        # Determine authentication type dynamically based on method name
        auth_type = self._get_auth_type(method)
        
        if auth_type:
            if self.auth:
                message = self._add_authentication(message, auth_type)
            else:
                raise AuthenticationError(f"Authentication required for {method}")
        
        # Send request and wait for response
        response_future = asyncio.Future()
        request_id_str = str(request_id)
        self._response_handlers[request_id_str] = lambda data: response_future.set_result(data)
        
        try:
            await self._send_message(message)
            
            # Wait for response with timeout
            response_data = await asyncio.wait_for(response_future, timeout=30.0)
            
            # Parse response
            if 'error' in response_data:
                raise WebSocketError(f"API error: {response_data['error']}")
            
            # Return entire response (preserves status, rateLimits, etc.)
            return response_data
            
        except asyncio.TimeoutError:
            self._response_handlers.pop(request_id_str, None)
            raise WebSocketError(f"Timeout waiting for {method} response")
        except Exception as e:
            self._response_handlers.pop(request_id_str, None)
            raise WebSocketError(f"Request failed: {e}")

    # Generated handler methods
${handlersCode}

    def set_handler(self, pattern: str, handler: Callable[[Dict], Awaitable[None]]) -> None:
        """
        Set a custom message handler
        
        Args:
            pattern: Message pattern to match (stream name, event type, or '*' for all)
            handler: Async function to handle messages
        """
        self._handlers[pattern] = handler

    def remove_handler(self, pattern: str) -> None:
        """Remove a message handler"""
        self._handlers.pop(pattern, None)

    def get_message_history(self, limit: Optional[int] = None) -> List[Dict]:
        """
        Get message history
        
        Args:
            limit: Maximum number of messages to return
            
        Returns:
            List of received messages with timestamps
        """
        if limit:
            return self._message_history[-limit:]
        return self._message_history.copy()

    async def __aenter__(self):
        """Async context manager entry"""
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.disconnect()
    
    def _initialize_event_parsers(self) -> Dict[str, Any]:
        """Initialize event type to model class mapping dynamically"""
        parsers = {}
        
        # Dynamically discover available event models from the models module
        try:
            import inspect
            
            # Import the models module
            # Try different import strategies based on context
            models_module = None
            
            # Strategy 1: Try relative import (works when client is part of a package)
            try:
                from . import models as models_module
            except ImportError:
                pass
            
            # Strategy 2: Try direct import (works when running from the same directory)
            if models_module is None:
                try:
                    import models as models_module
                except ImportError:
                    pass
            
            # Strategy 3: Try importing from the package if we know it
            if models_module is None and '.' in self.__module__:
                try:
                    import importlib
                    # Get package name from module
                    package_parts = self.__module__.split('.')[:-1]
                    if package_parts:
                        package_name = '.'.join(package_parts)
                        models_module = importlib.import_module(f'{package_name}.models')
                except ImportError:
                    pass
            
            if models_module is None:
                logger.debug("Models module not available - event parsers not initialized")
                return parsers
            
            # Iterate through all classes in the models module
            for name, obj in inspect.getmembers(models_module, inspect.isclass):
                # Look for event classes (those ending with 'Event' or containing event-like names)
                if name.endswith('Event'):
                    # Extract event type from class name
                    # e.g., TradeEvent -> trade, KlineEvent -> kline
                    event_type = None
                    
                    # Try to get event type from the class itself (if it has 'e' field)
                    try:
                        if hasattr(obj, '__fields__'):
                            # Pydantic v1
                            fields = obj.__fields__
                        elif hasattr(obj, 'model_fields'):
                            # Pydantic v2
                            fields = obj.model_fields
                        else:
                            fields = {}
                        
                        # Check if there's an 'e' field with a const/default value
                        if 'e' in fields:
                            field_info = fields['e']
                            if hasattr(field_info, 'default') and field_info.default is not None:
                                event_type = field_info.default
                            elif hasattr(field_info, 'json_schema_extra') and 'const' in field_info.json_schema_extra:
                                event_type = field_info.json_schema_extra['const']
                    except:
                        pass
                    
                    # If no event type found from field, derive from class name
                    if not event_type:
                        # Use the event type mappings from the AsyncAPI spec
                        # These were extracted from x-event-type fields
                        event_type_mappings = {
                            ${eventTypeMappingsPython}
                        }
                        
                        # Check if we have a mapping for this class
                        if name in event_type_mappings:
                            event_type = event_type_mappings[name]
                        else:
                            # Fallback: convert class name to event type
                            # OutboundAccountPositionEvent -> outboundAccountPosition
                            base_name = name.replace('Event', '')
                            # Convert PascalCase to camelCase for event type
                            event_type = base_name[0].lower() + base_name[1:] if base_name else None
                    
                    if event_type:
                        parsers[event_type] = obj
                        logger.debug(f"Registered event parser: {event_type} -> {name}")
            
            logger.debug(f"Initialized {len(parsers)} event parsers")
                
        except Exception as e:
            logger.debug(f"Could not dynamically import event models: {e}")
        
        return parsers
    
    def _get_event_type(self, data: Dict[str, Any]) -> Optional[str]:
        """
        Generic event type detection logic
        
        Args:
            data: Event data dictionary
            
        Returns:
            Event type string or None if not detected
        """
        # Check for event type field (most common pattern across exchanges)
        # Common field names for event type: 'e', 'event', 'type', 'eventType', 'event_type'
        event_type_fields = ['e', 'event', 'type', 'eventType', 'event_type', 'action', 'method']
        
        for field in event_type_fields:
            if field in data:
                value = data[field]
                # If it's a string, return it directly
                if isinstance(value, str):
                    return value
                # If it's a dict with nested 'e' or 'type' field (wrapped format)
                elif isinstance(value, dict):
                    for nested_field in event_type_fields:
                        if nested_field in value and isinstance(value[nested_field], str):
                            return value[nested_field]
        
        # Check for response format (has 'result' and 'id')
        if 'result' in data and 'id' in data:
            # This is likely a response to a request, not an event
            return None
        
        # Try to detect event type from stream name if available
        if 'stream' in data and isinstance(data['stream'], str):
            stream_name = data['stream']
            # Extract event type from stream name pattern (e.g., "btcusdt@trade" -> "trade")
            if '@' in stream_name:
                parts = stream_name.split('@')
                if len(parts) >= 2:
                    # Get the part after @ which usually indicates the event type
                    stream_type = parts[-1].split('_')[0]  # Handle patterns like "trade_1m"
                    return stream_type
        
        # Try pattern matching against known event parsers
        # This allows detection of events without explicit type fields
        if self._event_parsers:
            for event_type, parser_class in self._event_parsers.items():
                # Check if the data matches the expected structure of this event type
                if self._matches_event_structure(data, parser_class):
                    return event_type
        
        return None
    
    def _matches_event_structure(self, data: Dict[str, Any], parser_class: Any) -> bool:
        """
        Check if data matches the expected structure of a parser class
        
        Args:
            data: Event data to check
            parser_class: Pydantic model class to match against
            
        Returns:
            True if data appears to match the model structure
        """
        try:
            # Get required fields from the Pydantic model
            required_fields = set()
            optional_fields = set()
            
            if hasattr(parser_class, '__fields__'):
                # Pydantic v1
                for field_name, field_info in parser_class.__fields__.items():
                    if field_info.required:
                        required_fields.add(field_name)
                    else:
                        optional_fields.add(field_name)
            elif hasattr(parser_class, 'model_fields'):
                # Pydantic v2
                for field_name, field_info in parser_class.model_fields.items():
                    if field_info.is_required():
                        required_fields.add(field_name)
                    else:
                        optional_fields.add(field_name)
            
            # Check if all required fields are present in data
            data_fields = set(data.keys())
            if required_fields and not required_fields.issubset(data_fields):
                return False
            
            # Check if most of the model's fields are present (heuristic)
            all_model_fields = required_fields | optional_fields
            if all_model_fields:
                matching_fields = data_fields & all_model_fields
                match_ratio = len(matching_fields) / len(all_model_fields)
                # If more than 60% of fields match, consider it a match
                return match_ratio > 0.6
            
        except Exception:
            pass
        
        return False


# Example usage
async def main():
    """Example usage of the WebSocket client"""
    
    # Initialize client for ${apiTitle} (${detectedModule} module)
    client = BinanceWebSocketClient()
    
    # Check server configuration
    server_info = client.get_server_info()
    print(f"Module: {server_info['module']}")
    print(f"Active server: {server_info['active_server']}")
    print(f"Available servers: {server_info['available_servers']}")
    
    # Switch to a different server if needed (e.g., testnet)
    available_servers = client.get_available_servers()
    print(f"Available servers: {available_servers}")
    
    # Example: Switch to testnet server if available
    testnet_servers = [s for s in available_servers if 'testnet' in s.lower()]
    if testnet_servers:
        client.switch_server(testnet_servers[0])
        print(f"Switched to testnet: {client.get_server_info()['active_server']}")
    
    # Set up handlers
    async def handle_ticker(data):
        print(f"Ticker update: {data}")
    
    async def handle_trade(data):
        print(f"Trade update: {data}")
    
    # Example 1: Basic connection (uses default behavior)
    async with client:
        # Set handlers
        client.set_handler('*', handle_ticker)  # Handle all messages
        
        # Default connection behavior:
        # - For stream modules: connects to single stream endpoint
        # - For API modules: connects to main WebSocket API endpoint
        
        # Keep running
        await asyncio.sleep(10)
    
    # Example 2: Connect to specific server
    client2 = BinanceWebSocketClient()
    available_servers = client2.get_available_servers()
    if len(available_servers) > 1:
        await client2.connect_to_server(available_servers[1])
        await asyncio.sleep(5)
        await client2.disconnect()
    
    # Example 3: Spec-specific usage based on ${apiTitle}
    ${moduleType === 'streams' ? `
    # Stream module usage (${detectedModule})
    client3 = BinanceWebSocketClient()
    
    async with client3:
        # Connect to single stream endpoint  
        await client3.connect_to_single_stream()
        
        # Simple subscribe/unsubscribe (methods generated from AsyncAPI operations)
        ${detectedModule.includes('spot') ? `
        # Market data streams for spot trading
        await client3.subscribe(['btcusdt@trade', 'btcusdt@ticker'])
        await client3.subscribe(['btcusdt@kline_1m', 'ethusdt@depth5'])` : detectedModule.includes('futures') ? `
        # Derivatives streams for futures trading
        await client3.subscribe(['btcusdt@trade', 'btcusdt@markPrice'])
        await client3.subscribe(['btcusdt@fundingRate', 'btcusdt@forceOrder'])` : `
        # Generic streams (check AsyncAPI spec for available stream names)
        await client3.subscribe(['symbol@trade', 'symbol@ticker'])`}
        
        # Unsubscribe from streams
        await client3.unsubscribe(['btcusdt@trade'])
        
        await asyncio.sleep(10)` : `
    # API module usage (${detectedModule})
    client3 = BinanceWebSocketClient()
    
    async with client3:
        # Connect to WebSocket API endpoint
        await client3.connect()
        
        # All API methods are generated from AsyncAPI operations
        # Common methods (if available in spec):
        # ping_response = await client3.ping()
        # time_response = await client3.time()
        # exchange_info = await client3.exchange_info()
        
        # Check the generated client code for available methods
        # based on your specific AsyncAPI specification
        
        # Set up event handlers for real-time data
        client3.set_handler('*', handle_ticker)
        
        await asyncio.sleep(10)`}


if __name__ == "__main__":
    asyncio.run(main())
`}</Text>
    </File>
  );
}