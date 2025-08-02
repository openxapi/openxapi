import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'spot';
  const moduleName = params.moduleName || 'binance-websocket-client';
  const version = params.version || '0.1.0';
  const author = params.author || 'openxapi';

  return (
    <File name="__init__.py">
      <Text>{`"""
Binance ${packageName.toUpperCase()} WebSocket Client

An async WebSocket client for the Binance ${packageName.toUpperCase()} API, generated from AsyncAPI specification.

Author: ${author}
Version: ${version}
"""

from .client import BinanceWebSocketClient, WebSocketError, AuthenticationError
from .auth import BinanceAuth

try:
    from .models import *
except ImportError:
    # Models may not be available if AsyncAPI spec has no schemas
    pass

__version__ = "${version}"
__author__ = "${author}"

__all__ = [
    "BinanceWebSocketClient",
    "BinanceAuth", 
    "WebSocketError",
    "AuthenticationError",
]
`}</Text>
    </File>
  );
}