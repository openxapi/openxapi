import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'spot';
  const moduleName = params.moduleName || 'binance-websocket-client';
  const version = params.version || '0.1.0';
  const author = params.author || 'openxapi';
  const exchangeName = params.exchangeName || 'Binance';  // Make exchange name configurable

  return (
    <File name="README.md">
      <Text>{`# ${exchangeName} ${packageName.toUpperCase()} WebSocket Client

An async WebSocket client for the ${exchangeName} ${packageName.toUpperCase()} API, automatically generated from AsyncAPI specification.

## Features

- ✅ **Async/Await Support**: Built with Python's asyncio for high-performance async operations
- ✅ **Type Safety**: Pydantic models provide runtime type validation and IDE support
- ✅ **Multiple Authentication**: Support for HMAC-SHA256, RSA, and Ed25519 signing methods
- ✅ **Auto Reconnection**: Automatic reconnection with exponential backoff
- ✅ **Message History**: Track and query received messages
- ✅ **Event Handlers**: Flexible event handling system with pattern matching
- ✅ **Context Manager**: Easy-to-use async context manager support
- ✅ **Error Handling**: Comprehensive error handling with custom exceptions

## Installation

### From Requirements

\`\`\`bash
pip install -r requirements.txt
\`\`\`

### From Source

\`\`\`bash
# Install in development mode
pip install -e .
\`\`\`

### Manual Dependencies

\`\`\`bash
pip install websockets pydantic cryptography python-dotenv
\`\`\`

## Quick Start

### Basic Usage

\`\`\`python
import asyncio
from client import ${exchangeName}WebSocketClient

async def main():
    # Initialize client
    client = ${exchangeName}WebSocketClient(testnet=True)
    
    # Set up message handler
    async def handle_ticker(data):
        print(f"Ticker: {data}")
    
    # Use as async context manager
    async with client:
        # Set handler for all messages
        client.set_handler('*', handle_ticker)
        
        # Subscribe to ticker stream
        await client.subscribe('btcusdt@ticker')
        
        # Keep running for 60 seconds
        await asyncio.sleep(60)

if __name__ == "__main__":
    asyncio.run(main())
\`\`\`

### Authentication

\`\`\`python
import asyncio
from client import ${exchangeName}WebSocketClient
from auth import ${exchangeName}Auth

async def main():
    # Set up authentication
    auth = ${exchangeName}Auth(
        api_key="your_api_key",
        secret_key="your_secret_key",
        auth_type="hmac"  # or "rsa", "ed25519"
    )
    
    # Initialize authenticated client
    client = ${exchangeName}WebSocketClient(
        testnet=True,
        auth=auth
    )
    
    async def handle_account_update(data):
        print(f"Account update: {data}")
    
    async with client:
        # Set handler for account events
        client.set_handler('outboundAccountPosition', handle_account_update)
        
        # Subscribe to user data stream (requires authentication)
        await client.subscribe('user_data_stream')
        
        await asyncio.sleep(300)  # Run for 5 minutes

if __name__ == "__main__":
    asyncio.run(main())
\`\`\`

### Environment Variables

\`\`\`bash
# Create .env file
${exchangeName.toUpperCase()}_API_KEY=your_api_key_here
${exchangeName.toUpperCase()}_SECRET_KEY=your_secret_key_here
# For RSA/Ed25519 authentication
${exchangeName.toUpperCase()}_PRIVATE_KEY=your_private_key_pem_here
\`\`\`

\`\`\`python
from auth import ${exchangeName}Auth

# Authentication will be loaded from environment variables
auth = ${exchangeName}Auth.from_env(auth_type="hmac")
\`\`\`

## API Reference

### ${exchangeName}WebSocketClient

#### Constructor

\`\`\`python
${exchangeName}WebSocketClient(
    testnet: bool = False,
    auth: Optional[${exchangeName}Auth] = None,
    auto_reconnect: bool = True,
    ping_interval: int = 20,
    ping_timeout: int = 10
)
\`\`\`

#### Methods

- \`async connect(uri: Optional[str] = None)\` - Connect to WebSocket
- \`async disconnect()\` - Disconnect from WebSocket  
- \`async subscribe(channel: str, params: dict = None)\` - Subscribe to channel
- \`async unsubscribe(channel: str)\` - Unsubscribe from channel
- \`set_handler(pattern: str, handler: Callable)\` - Set message handler
- \`remove_handler(pattern: str)\` - Remove message handler
- \`get_message_history(limit: Optional[int] = None)\` - Get message history

### ${exchangeName}Auth

#### Constructor

\`\`\`python
${exchangeName}Auth(
    api_key: Optional[str] = None,
    secret_key: Optional[str] = None,
    private_key: Optional[Union[str, bytes]] = None,
    auth_type: str = "hmac"
)
\`\`\`

#### Methods

- \`sign(message: str) -> str\` - Sign message
- \`create_signed_params(params: dict) -> dict\` - Create signed parameters
- \`get_headers() -> dict\` - Get authentication headers
- \`from_env(auth_type: str = "hmac") -> ${exchangeName}Auth\` - Create from environment

## Authentication Types

### HMAC-SHA256 (Default)

\`\`\`python
auth = ${exchangeName}Auth(
    api_key="your_api_key",
    secret_key="your_secret_key",
    auth_type="hmac"
)
\`\`\`

### RSA Signing

\`\`\`python
# Generate RSA key pair for testing
from auth import generate_rsa_keypair
private_key_pem, public_key_pem = generate_rsa_keypair()

auth = ${exchangeName}Auth(
    api_key="your_api_key",
    private_key=private_key_pem,
    auth_type="rsa"
)
\`\`\`

### Ed25519 Signing

\`\`\`python
# Generate Ed25519 key pair for testing
from auth import generate_ed25519_keypair
private_key_pem, public_key_pem = generate_ed25519_keypair()

auth = ${exchangeName}Auth(
    api_key="your_api_key",
    private_key=private_key_pem,
    auth_type="ed25519"
)
\`\`\`

## Error Handling

\`\`\`python
from client import WebSocketError, AuthenticationError

try:
    async with client:
        await client.subscribe('invalid@stream')
except WebSocketError as e:
    print(f"WebSocket error: {e}")
except AuthenticationError as e:
    print(f"Authentication error: {e}")
\`\`\`

## Message Handlers

### Pattern Matching

\`\`\`python
# Handle all messages
client.set_handler('*', handle_all)

# Handle specific stream
client.set_handler('btcusdt@ticker', handle_ticker)

# Handle specific event type
client.set_handler('outboundAccountPosition', handle_account)
\`\`\`

### Handler Function

\`\`\`python
async def my_handler(data: dict) -> None:
    """
    Message handler function
    
    Args:
        data: Parsed message data as dictionary
    """
    print(f"Received: {data}")
\`\`\`

## Development

### Testing

\`\`\`bash
# Install development dependencies
pip install -e .[dev]

# Run tests
pytest

# Run with coverage
pytest --cov=.
\`\`\`

### Code Formatting

\`\`\`bash
# Format code
black .

# Lint code
flake8 .

# Type checking
mypy .
\`\`\`

## Examples

Check the \`client.py\` file for a complete example in the \`main()\` function.

## License

This client is generated from AsyncAPI specification and follows the same license as the OpenXAPI project.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Submit a pull request

## Support

- GitHub Issues: [Report bugs and feature requests](https://github.com/openxapi/binance-python/issues)
- Documentation: [API Documentation](https://docs.openxapi.org/binance-python)
- Community: [Discord Server](https://discord.gg/openxapi)

---

Generated by OpenXAPI AsyncAPI Python Template v${version}
`}</Text>
    </File>
  );
}