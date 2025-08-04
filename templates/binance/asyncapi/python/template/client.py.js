import { File, Text } from '@asyncapi/generator-react-sdk';
import { PythonModularWebSocketHandlers } from '../components/PythonModularWebSocketHandlers.js';
import { detectModuleName, getModuleConfig, extractServerInfo } from '../components/PythonModuleRegistry.js';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'spot';
  const moduleName = params.moduleName || 'binance-websocket-client';
  const version = params.version || '0.1.0';
  const author = params.author || 'openxapi';
  
  // Detect the module type using the registry system
  const detectedModule = detectModuleName(asyncapi, { packageName, moduleName });
  const moduleConfig = getModuleConfig(detectedModule);
  
  // Extract complete server information from AsyncAPI spec
  const serverInfoList = extractServerInfo(asyncapi);

  // Get all channels to generate handler methods
  const channels = asyncapi.channels();
  
  // Generate module-specific handlers code
  const handlersCode = PythonModularWebSocketHandlers({ asyncapi, context: { packageName, moduleName } });
  const usesModels = handlersCode && handlersCode.includes('models.');

  // Set first server as default if available
  const defaultServerUrl = serverInfoList.length > 0 ? serverInfoList[0].url : moduleConfig.serverConfig.mainnetUrlPattern;

  return (
    <File name="client.py">
      <Text>{`"""
Binance ${packageName.toUpperCase()} WebSocket Client (Module: ${detectedModule})

This module provides an async WebSocket client for the Binance ${packageName.toUpperCase()} API.
Generated from AsyncAPI specification with complete server configurations.

Module: ${detectedModule}
Available Servers: ${serverInfoList.length}
${serverInfoList.map(server => `  - ${server.name}: ${server.url} (${server.title})`).join('\n')}
Authentication: ${moduleConfig.authentication.supportedTypes.join(', ') || 'None'}

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
    Async WebSocket client for Binance ${packageName.toUpperCase()} API (Module: ${detectedModule})
    
    This client provides methods to connect to Binance WebSocket streams,
    subscribe to various data feeds, and handle real-time events.
    
    Module Configuration:
    - Target Module: ${detectedModule}
    - Available Servers: ${serverInfoList.length}
${serverInfoList.map(server => `      * ${server.name}: ${server.url} (${server.title})`).join('\n')}
    - Authentication: ${moduleConfig.authentication.supportedTypes.join(', ') || 'None'}
    
    This client is specifically configured for the ${detectedModule} module and 
    uses server endpoints extracted directly from the AsyncAPI specification.
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
    
    def get_connection_url(self, custom_path: Optional[str] = None) -> str:
        """
        Get the connection URL, optionally with a custom path
        
        Args:
            custom_path: Optional custom path to append (for streams)
            
        Returns:
            Full WebSocket URL
        """
        if custom_path:
            # Handle stream-specific paths
            base = self.base_url
            if base.endswith('/ws') or base.endswith('/ws/'):
                # Replace /ws with custom path
                base = base.replace('/ws', custom_path)
            else:
                # Append custom path
                base = base.rstrip('/') + custom_path
            return base
        return self.base_url

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
                if '${detectedModule}'.endswith('-streams'):
                    return await self.connect_to_single_stream()
                else:
                    connect_uri = self.base_url
                
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
        (For stream modules only)
        
        Args:
            time_unit: Optional time unit parameter (e.g., "?timeUnit=MICROSECOND")
        """
        async with self._connection_lock:
            if self._is_connected:
                logger.warning("Already connected to WebSocket")
                return
                
            # Build endpoint URL with timeUnit parameter
            endpoint = "/ws"
            if time_unit:
                endpoint += time_unit
                
            connect_uri = self.get_connection_url(endpoint)
            logger.info(f"Connecting to single stream: {connect_uri} (module: {self.module}, server: {self.active_server})")
            
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
                
                logger.info("Single stream WebSocket connection established")
                
            except Exception as e:
                logger.error(f"Failed to connect to single stream: {e}")
                raise WebSocketError(f"Single stream connection failed: {e}")

    async def connect_to_combined_stream(self, time_unit: Optional[str] = None) -> None:
        """
        Connect to combined stream endpoint with optional timeUnit parameter
        (For stream modules only)
        
        Args:
            time_unit: Optional time unit parameter (e.g., "?timeUnit=MICROSECOND")
        """
        async with self._connection_lock:
            if self._is_connected:
                logger.warning("Already connected to WebSocket")
                return
                
            # Build endpoint URL with timeUnit parameter
            endpoint = "/stream"
            if time_unit:
                endpoint += time_unit
                
            connect_uri = self.get_connection_url(endpoint)
            logger.info(f"Connecting to combined stream: {connect_uri} (module: {self.module}, server: {self.active_server})")
            
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
                
                logger.info("Combined stream WebSocket connection established")
                
            except Exception as e:
                logger.error(f"Failed to connect to combined stream: {e}")
                raise WebSocketError(f"Combined stream connection failed: {e}")

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
            
        Example:
            await client.connect_with_variables(streamPath="ws", listenKey="your_listen_key")
        """
        async with self._connection_lock:
            if self._is_connected:
                logger.warning("Already connected to WebSocket")
                return
                
            # Start with base URL
            connect_uri = self.base_url
            
            # Replace variables in the URL
            for var_name, var_value in variables.items():
                template = "{" + var_name + "}"
                if template in connect_uri:
                    connect_uri = connect_uri.replace(template, str(var_value))
                    logger.debug(f"Replaced {template} with {var_value}")
                    
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

    def _requires_auth(self, message: Dict[str, Any]) -> bool:
        """Check if a message requires authentication"""
        method = message.get('method', '').lower()
        return any(keyword in method for keyword in ['account', 'order', 'user'])

    def _add_authentication(self, message: Dict[str, Any], auth_type: str = "USER_DATA") -> Dict[str, Any]:
        """
        Add authentication to a message based on authentication type (following Go SDK patterns)
        
        Args:
            message: Message to authenticate
            auth_type: Authentication type (USER_STREAM, USER_DATA, TRADE, SIGNED)
        """
        if not self.auth:
            raise AuthenticationError("Authentication required but not provided")
            
        # Special case: some methods should send 0 parameters
        # These methods work with session-based authentication after connection
        method = message.get('method', '')
        zero_param_methods = [
            'userDataStream.subscribe', 
            'userDataStream.unsubscribe',
            'session.status',
            'session.logout'
        ]
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
        
        # Determine if this auth type requires signature (following Go SDK RequiresSignature logic)
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
                message = self._add_authentication(message)
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
    
    # Initialize client for ${detectedModule} module
    client = BinanceWebSocketClient()
    
    # Check server configuration
    server_info = client.get_server_info()
    print(f"Module: {server_info['module']}")
    print(f"Active server: {server_info['active_server']}")
    print(f"Available servers: {server_info['available_servers']}")
    
    # Switch to a different server if needed
    # available_servers = client.get_available_servers()
    # if len(available_servers) > 1:
    #     client.switch_server(available_servers[1])
    #     print(f"Switched to: {client.get_server_info()['active_server']}")
    
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
    
    # Example 3: Module-specific usage
    ${detectedModule.includes('stream') ? `
    # Stream module examples (${detectedModule})
    client3 = BinanceWebSocketClient()
    
    async with client3:
        # Connect to single stream endpoint  
        await client3.connect_to_single_stream()
        
        # Simple subscribe/unsubscribe like Go SDK
        ${detectedModule === 'spot-streams' ? `
        # Spot streams - market data
        await client3.subscribe(['btcusdt@trade', 'btcusdt@ticker'])
        await client3.subscribe(['btcusdt@kline_1m', 'ethusdt@depth5'])
        
        # Unsubscribe from some streams
        await client3.unsubscribe(['btcusdt@trade'])` : `
        # Futures streams - derivatives data  
        await client3.subscribe(['btcusdt@trade', 'btcusdt@markPrice'])
        await client3.subscribe(['btcusdt@fundingRate', 'btcusdt@forceOrder'])
        
        # Unsubscribe from some streams
        await client3.unsubscribe(['btcusdt@trade'])`}
        
        await asyncio.sleep(10)` : `
    # API module examples (${detectedModule})
    client3 = BinanceWebSocketClient()
    
    async with client3:
        # Connect to WebSocket API endpoint
        await client3.connect()
        
        # Module-specific API methods
        ${detectedModule === 'spot' ? `
        # Spot WebSocket API methods
        # ping_response = await client3.ping()
        # time_response = await client3.time()
        # exchange_info = await client3.exchange_info()
        # ticker_response = await client3.ticker(symbol="BTCUSDT")` : `
        # ${detectedModule.toUpperCase()} WebSocket API methods
        # ping_response = await client3.ping() 
        # time_response = await client3.time()
        # exchange_info = await client3.exchange_info()`}
        
        # Set up event handlers for real-time data
        client3.set_handler('*', handle_ticker)
        
        await asyncio.sleep(10)`}


if __name__ == "__main__":
    asyncio.run(main())
`}</Text>
    </File>
  );
}