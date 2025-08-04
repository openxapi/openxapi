/**
 * Python Modular WebSocket Handlers
 * Routes to module-specific handlers based on detected module type
 * This provides proper isolation between different modules (spot, spot-streams, umfutures, etc.)
 */

import { detectModuleName, getModuleConfig } from './PythonModuleRegistry.js';
import { PythonWebSocketHandlers } from './PythonWebSocketHandlers.js';
import { PythonSpotStreamsWebSocketHandlers } from './PythonSpotStreamsWebSocketHandlers.js';

/**
 * Generate Python WebSocket handlers with module-specific routing
 * @param {Object} params - Parameters object
 * @param {Object} params.asyncapi - AsyncAPI document
 * @param {Object} params.context - Generation context
 * @returns {string} Generated Python handlers for the specific module
 */
export function PythonModularWebSocketHandlers({ asyncapi, context }) {
  const { packageName, moduleName } = context;
  const detectedModule = detectModuleName(asyncapi, context);
  const moduleConfig = getModuleConfig(detectedModule);
  
  // Route to appropriate module-specific handlers
  switch (detectedModule) {
    case 'spot-streams':
      return generateSpotStreamsHandlers(asyncapi, context);
      
    case 'umfutures-streams':
      return generateUmfuturesStreamsHandlers(asyncapi, context);
      
    case 'cmfutures-streams':
      return generateCmfuturesStreamsHandlers(asyncapi, context);
      
    case 'options-streams':
      return generateOptionsStreamsHandlers(asyncapi, context);
      
    case 'spot':
      return generateSpotApiHandlers(asyncapi, context);
      
    case 'umfutures':
      return generateUmfuturesApiHandlers(asyncapi, context);
      
    case 'cmfutures':
      return generateCmfuturesApiHandlers(asyncapi, context);
      
    case 'pmargin':
      return generatePmarginHandlers(asyncapi, context);
      
    default:
      // Fallback to generic handlers
      return PythonWebSocketHandlers({ asyncapi, context });
  }
}

/**
 * Generate handlers for spot-streams module (market data streams)
 */
function generateSpotStreamsHandlers(asyncapi, context) {
  const baseHandlers = generateBasicStreamHandlers();
  const spotStreamsHandlers = PythonSpotStreamsWebSocketHandlers({ asyncapi, context });
  
  return baseHandlers + '\n\n' + spotStreamsHandlers;
}

/**
 * Generate handlers for umfutures-streams module
 */
function generateUmfuturesStreamsHandlers(asyncapi, context) {
  const baseHandlers = generateBasicStreamHandlers();
  const futuresStreamsHandlers = generateFuturesStreamHandlers('USD-M');
  
  return baseHandlers + '\n\n' + futuresStreamsHandlers;
}

/**
 * Generate handlers for cmfutures-streams module  
 */
function generateCmfuturesStreamsHandlers(asyncapi, context) {
  const baseHandlers = generateBasicStreamHandlers();
  const futuresStreamsHandlers = generateFuturesStreamHandlers('COIN-M');
  
  return baseHandlers + '\n\n' + futuresStreamsHandlers;
}

/**
 * Generate handlers for options-streams module
 */
function generateOptionsStreamsHandlers(asyncapi, context) {
  const baseHandlers = generateBasicStreamHandlers();
  const optionsStreamsHandlers = generateOptionsStreamHandlers();
  
  return baseHandlers + '\n\n' + optionsStreamsHandlers;
}

/**
 * Generate handlers for spot API module (WebSocket API, not streams)
 */
function generateSpotApiHandlers(asyncapi, context) {
  // Use the full API handlers for spot WebSocket API
  return PythonWebSocketHandlers({ asyncapi, context });
}

/**
 * Generate handlers for umfutures API module
 */
function generateUmfuturesApiHandlers(asyncapi, context) {
  // Use the full API handlers for USD-M futures WebSocket API
  return PythonWebSocketHandlers({ asyncapi, context });
}

/**
 * Generate handlers for cmfutures API module
 */
function generateCmfuturesApiHandlers(asyncapi, context) {
  // Use the full API handlers for COIN-M futures WebSocket API  
  return PythonWebSocketHandlers({ asyncapi, context });
}

/**
 * Generate handlers for pmargin module
 */
function generatePmarginHandlers(asyncapi, context) {
  // Use the full API handlers with portfolio margin specific methods
  const baseHandlers = PythonWebSocketHandlers({ asyncapi, context });
  const pmarginHandlers = generatePmarginSpecificHandlers();
  
  return baseHandlers + '\n\n' + pmarginHandlers;
}

/**
 * Generate basic stream subscription handlers (common to all stream modules, matching Go SDK)
 */
function generateBasicStreamHandlers() {
  return `    # Market Data Stream Subscription Methods (matching Go SDK)
    
    async def subscribe(self, streams: List[str], *, id: Optional[Union[int, str]] = None) -> None:
        """
        Subscribe to market data streams
        
        Args:
            streams: List of stream names to subscribe to
            id: Optional request ID (auto-generated if not provided)
            
        Example:
            await client.subscribe(['btcusdt@trade', 'ethusdt@ticker'])
        """
        if not self._is_connected:
            raise WebSocketError("WebSocket not connected")
            
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "method": "SUBSCRIBE",
            "params": streams,
            "id": request_id
        }
        
        await self._send_message(message)

    async def unsubscribe(self, streams: List[str], *, id: Optional[Union[int, str]] = None) -> None:
        """
        Unsubscribe from market data streams
        
        Args:
            streams: List of stream names to unsubscribe from
            id: Optional request ID (auto-generated if not provided)
            
        Example:
            await client.unsubscribe(['btcusdt@trade', 'ethusdt@ticker'])
        """
        if not self._is_connected:
            raise WebSocketError("WebSocket not connected")
            
        request_id = id if id is not None else self._generate_request_id()
        
        message = {
            "method": "UNSUBSCRIBE",
            "params": streams,
            "id": request_id
        }
        
        await self._send_message(message)`;
}

/**
 * Generate futures-specific stream handlers (just comments, uses same subscribe/unsubscribe)
 */
function generateFuturesStreamHandlers(futuresType) {
  return `    # ${futuresType} Futures Streams
    # Use subscribe() with futures-specific stream names:
    # - Mark Price: await client.subscribe(['btcusdt@markPrice'])  
    # - Funding Rate: await client.subscribe(['btcusdt@fundingRate'])
    # - Liquidations: await client.subscribe(['btcusdt@forceOrder'])
    # - Composite Index: await client.subscribe(['btcusdt@compositeIndex'])`;
}

/**
 * Generate options-specific stream handlers (just comments, uses same subscribe/unsubscribe)
 */
function generateOptionsStreamHandlers() {
  return `    # Options Streams  
    # Use subscribe() with options-specific stream names:
    # - Option Info: await client.subscribe(['BTC@optionInfo'])
    # - Option Mark Price: await client.subscribe(['BTC-230630-30000-C@markPrice'])`;
}

/**
 * Generate portfolio margin specific handlers (just comments, uses same subscribe/unsubscribe) 
 */
function generatePmarginSpecificHandlers() {
  return `    # Portfolio Margin Streams
    # Use subscribe() with portfolio margin stream names:
    # - Margin Call: await client.subscribe(['marginCall'])
    # - Account Config: await client.subscribe(['accountConfig'])`;
}

export default PythonModularWebSocketHandlers;