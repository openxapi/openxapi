/**
 * Python Spot Streams WebSocket Handlers
 * Module-specific handlers for spot-streams (market data streams)
 * This isolates spot-streams from other modules like spot (API), umfutures, etc.
 */

import { detectModuleName } from './PythonModuleRegistry.js';

/**
 * Generate Python WebSocket handlers specifically for spot-streams module
 * This provides stream subscription methods and connection helpers
 * @param {Object} params - Parameters object
 * @param {Object} params.asyncapi - AsyncAPI document  
 * @param {Object} params.context - Generation context
 * @returns {string} Generated Python spot-streams handlers
 */
export function PythonSpotStreamsWebSocketHandlers({ asyncapi, context }) {
  const { packageName, moduleName } = context;
  const detectedModule = detectModuleName(asyncapi, context);
  
  // Only generate for spot-streams module
  if (!detectedModule.includes('streams')) {       
    return '';
  }
  
  return generateSpotStreamsHandlers();
}

/**
 * Generate spot-streams specific handlers
 */
function generateSpotStreamsHandlers() {
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

export default PythonSpotStreamsWebSocketHandlers;