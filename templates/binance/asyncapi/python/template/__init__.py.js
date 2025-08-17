import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'spot';
  const moduleName = params.moduleName || 'binance-websocket-client';
  const version = params.version || '0.1.0';
  const author = params.author || 'openxapi';
  const exchangeName = params.exchangeName || 'Binance';  // Make exchange name configurable

  return (
    <File name="__init__.py">
      <Text>{`"""
${exchangeName} ${packageName.toUpperCase()} WebSocket Client

An async WebSocket client for the ${exchangeName} ${packageName.toUpperCase()} API, generated from AsyncAPI specification.

Author: ${author}
Version: ${version}
"""

from .client import ${exchangeName}WebSocketClient, WebSocketError, AuthenticationError
from .auth import ${exchangeName}Auth

try:
    from .models import *
except ImportError:
    # Models may not be available if AsyncAPI spec has no schemas
    pass

__version__ = "${version}"
__author__ = "${author}"

__all__ = [
    "${exchangeName}WebSocketClient",
    "${exchangeName}Auth", 
    "WebSocketError",
    "AuthenticationError",
]
`}</Text>
    </File>
  );
}