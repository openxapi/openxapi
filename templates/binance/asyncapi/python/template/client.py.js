import { File, Text } from '@asyncapi/generator-react-sdk';
import { PythonWebSocketHandlers } from '../components/PythonWebSocketHandlers.js';
// import { detectModuleName } from '../../go/components/ModuleRegistry.js'; // Removed to fix import issue

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'spot';
  const moduleName = params.moduleName || 'binance-websocket-client';
  const version = params.version || '0.1.0';
  const author = params.author || 'openxapi';
  
  // Detect the module type
  const detectedModule = packageName || 'spot'; // Simplified detection without Go module dependency
  
  // Get all servers from AsyncAPI spec
  const servers = asyncapi.servers();
  const serverList = servers.all();
  const mainnetServers = serverList.filter(server => 
    server.id().includes('mainnet') || !server.id().includes('testnet')
  );
  const testnetServers = serverList.filter(server => 
    server.id().includes('testnet')
  );

  // Get all channels to generate handler methods
  const channels = asyncapi.channels();
  
  // Generate handlers code
  const handlersCode = PythonWebSocketHandlers({ asyncapi, context: { packageName, moduleName } });
  const usesModels = handlersCode && handlersCode.includes('models.');

  // Get server URLs for configuration
  const mainnetUrl = mainnetServers.length > 0 ? mainnetServers[0].url() : 'wss://stream.binance.com:9443/ws';
  const testnetUrl = testnetServers.length > 0 ? testnetServers[0].url() : 'wss://testnet.dex.binance.org/api/ws';

  return (
    <File name="client.py">
      <Text>{`"""
Binance ${packageName.toUpperCase()} WebSocket Client

This module provides an async WebSocket client for the Binance ${packageName.toUpperCase()} API.
Generated from AsyncAPI specification.

Author: ${author}
Version: ${version}
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
    Async WebSocket client for Binance ${packageName.toUpperCase()} API
    
    This client provides methods to connect to Binance WebSocket streams,
    subscribe to various data feeds, and handle real-time events.
    """
    
    def __init__(
        self,
        testnet: bool = False,
        auth: Optional[BinanceAuth] = None,
        auto_reconnect: bool = True,
        ping_interval: int = 20,
        ping_timeout: int = 10,
        max_message_size: int = 10 * 1024 * 1024  # 10MB default
    ):
        """
        Initialize the WebSocket client
        
        Args:
            testnet: Use testnet environment if True
            auth: Authentication credentials for private endpoints
            auto_reconnect: Automatically reconnect on connection loss
            ping_interval: Ping interval in seconds
            ping_timeout: Ping timeout in seconds
            max_message_size: Maximum WebSocket message size in bytes (default: 10MB)
        """
        self.testnet = testnet
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
        self._response_handlers: Dict[str, Callable] = {}
        self._request_id = 0
        self._message_history: List[Dict] = []
        
        # URLs
        self.base_url = "${testnetUrl}" if testnet else "${mainnetUrl}"
        
        # Background tasks
        self._listen_task: Optional[asyncio.Task] = None
        self._ping_task: Optional[asyncio.Task] = None

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
            # Pydantic model
            data = request_obj.model_dump(exclude_none=True)
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
        Connect to the WebSocket server
        
        Args:
            uri: Custom WebSocket URI (uses default if not provided)
        """
        async with self._connection_lock:
            if self._is_connected:
                logger.warning("Already connected to WebSocket")
                return
                
            connect_uri = uri or self.base_url
            logger.info(f"Connecting to WebSocket: {connect_uri}")
            
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
            # Add authentication if required and available
            if self.auth and self._requires_auth(message):
                message = await self._add_authentication(message)
                
            message_str = json.dumps(message)
            await self._websocket.send(message_str)
            logger.debug(f"Sent message: {message_str}")
            
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            raise WebSocketError(f"Send failed: {e}")

    def _requires_auth(self, message: Dict[str, Any]) -> bool:
        """Check if a message requires authentication"""
        method = message.get('method', '').lower()
        return any(keyword in method for keyword in ['account', 'order', 'user'])

    async def _add_authentication(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Add authentication to a message"""
        if not self.auth:
            raise AuthenticationError("Authentication required but not provided")
            
        # Ensure params object exists
        if 'params' not in message:
            message['params'] = {}
        params = message['params']
        
        # Add apiKey FIRST (this must be included in signature payload)
        params['apiKey'] = self.auth.api_key
        
        # Add timestamp (this must also be included in signature payload)
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

    async def _handle_message(self, data: Dict[str, Any]) -> None:
        """Handle incoming WebSocket message"""
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
            
        # Handle stream data
        if 'stream' in data and 'data' in data:
            stream_name = data['stream']
            stream_data = data['data']
            
            # Find appropriate handler
            for pattern, handler in self._handlers.items():
                if stream_name.startswith(pattern) or pattern == '*':
                    try:
                        await handler(stream_data)
                    except Exception as e:
                        logger.error(f"Error in handler for {stream_name}: {e}")
                    break
        
        # Handle direct event data (user data stream)
        elif 'e' in data:  # Event type field
            event_type = data['e']
            
            for pattern, handler in self._handlers.items():
                if event_type == pattern or pattern == '*':
                    try:
                        await handler(data)
                    except Exception as e:
                        logger.error(f"Error in handler for event {event_type}: {e}")
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
        
        # Check if authentication is required (basic heuristic)
        auth_required_methods = [
            'order.place', 'order.test', 'order.status', 'order.cancel',
            'openOrders.cancelAll', 'openOrders.status',
            'allOrders', 'myTrades', 'myAllocations', 'myPreventedMatches',
            'account.status', 'account.commission', 'account.rateLimits.orders',
            'userDataStream.start', 'userDataStream.ping', 'userDataStream.stop',
            'session.logon', 'session.status', 'session.logout'
        ]
        
        if method in auth_required_methods:
            if self.auth:
                message = await self._add_authentication(message)
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


# Example usage
async def main():
    """Example usage of the WebSocket client"""
    
    # Initialize client
    client = BinanceWebSocketClient(testnet=True)
    
    # Set up handlers
    async def handle_ticker(data):
        print(f"Ticker update: {data}")
    
    async def handle_trade(data):
        print(f"Trade update: {data}")
    
    # Use as async context manager
    async with client:
        # Set handlers
        client.set_handler('*', handle_ticker)  # Handle all messages
        
        # Subscribe to streams
        await client.subscribe('btcusdt@ticker')
        await client.subscribe('btcusdt@trade')
        
        # Keep running
        await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(main())
`}</Text>
    </File>
  );
}