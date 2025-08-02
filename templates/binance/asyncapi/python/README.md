# Binance AsyncAPI Python WebSocket Client Template

An AsyncAPI template for generating **Python WebSocket clients** for Binance WebSocket API. The template generates production-ready Python code from AsyncAPI 3.0 specifications with full support for `asyncio`, `Pydantic` models, and multiple authentication methods.

## 🚀 Features

- ✅ **AsyncAPI 3.0 Compatible**: Full support for AsyncAPI 3.0 specifications
- ✅ **Async/Await Architecture**: Built with Python's asyncio for high-performance async operations
- ✅ **Type Safety**: Pydantic v2 models provide runtime type validation and IDE support
- ✅ **Multiple Authentication**: HMAC-SHA256, RSA, and Ed25519 signing methods
- ✅ **Auto Reconnection**: Automatic reconnection with exponential backoff
- ✅ **Message History**: Track and query received messages
- ✅ **Event Handlers**: Flexible event handling system with pattern matching
- ✅ **Context Manager**: Easy-to-use async context manager support
- ✅ **Error Handling**: Comprehensive error handling with custom exceptions
- ✅ **Modular Design**: Based on the same modular architecture as the Go template

## 📋 Prerequisites

- Python 3.8+
- Node.js 22+ (for template generation)
- AsyncAPI CLI v2.8+

### Install AsyncAPI CLI

```bash
npm install -g @asyncapi/cli
```

## 🛠️ Installation

1. **Clone the repository**:
```bash
git clone https://github.com/openxapi/openxapi.git
cd openxapi/templates/binance/asyncapi/python
```

2. **Install template dependencies**:
```bash
npm install
```

## 🎯 Quick Start

### Basic Generation

```bash
npm run generate
```

This generates a Python client using default parameters:
- Spec file: `../../../../specs/binance/asyncapi/spot.yaml`
- Output directory: `./output`
- Package name: `spot`
- Module name: `binance-websocket-client`

### Custom Generation

```bash
# Custom output directory
OUTPUT_DIR=/path/to/output npm run generate

# Use custom spec file
SPEC_FILE=/path/to/custom.yaml npm run generate

# Custom module and package names
MODULE_NAME=my-binance-client PACKAGE_NAME=client npm run generate

# Set author information
AUTHOR="Your Name" npm run generate
```

## 📦 Generated Code Structure

The template generates the following structure:

```
output/
├── client.py              # Main WebSocket client
├── auth.py                # Authentication system (HMAC, RSA, Ed25519)
├── models.py              # Pydantic models for type safety
├── requirements.txt       # Python dependencies
├── __init__.py            # Package initialization
└── README.md              # Generated client documentation
```

## 💻 Usage Examples

### Basic WebSocket Client

```python
import asyncio
from client import BinanceWebSocketClient

async def main():
    # Initialize client
    client = BinanceWebSocketClient(testnet=True)
    
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
```

### Authenticated Client

```python
import asyncio
from client import BinanceWebSocketClient
from auth import BinanceAuth

async def main():
    # Set up authentication
    auth = BinanceAuth(
        api_key="your_api_key",
        secret_key="your_secret_key",
        auth_type="hmac"  # or "rsa", "ed25519"
    )
    
    # Initialize authenticated client
    client = BinanceWebSocketClient(
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
```

## 🔐 Authentication

### Environment Variables

Create a `.env` file:

```bash
BINANCE_API_KEY=your_api_key_here
BINANCE_SECRET_KEY=your_secret_key_here
# For RSA/Ed25519 authentication
BINANCE_PRIVATE_KEY=your_private_key_pem_here
```

```python
from auth import BinanceAuth

# Authentication loaded from environment variables
auth = BinanceAuth.from_env(auth_type="hmac")
```

### Authentication Types

#### HMAC-SHA256 (Default)
```python
auth = BinanceAuth(
    api_key="your_api_key",
    secret_key="your_secret_key",
    auth_type="hmac"
)
```

#### RSA Signing
```python
from auth import generate_rsa_keypair

# Generate RSA key pair for testing
private_key_pem, public_key_pem = generate_rsa_keypair()

auth = BinanceAuth(
    api_key="your_api_key",
    private_key=private_key_pem,
    auth_type="rsa"
)
```

#### Ed25519 Signing
```python
from auth import generate_ed25519_keypair

# Generate Ed25519 key pair for testing
private_key_pem, public_key_pem = generate_ed25519_keypair()

auth = BinanceAuth(
    api_key="your_api_key",
    private_key=private_key_pem,
    auth_type="ed25519"
)
```

## 🧪 Development & Testing

### Run Tests

```bash
npm run test
```

This will:
1. Clean previous test artifacts
2. Generate a test client
3. Compile the Python client

### Test Module-Specific Generation

```bash
MODULE=spot npm run test:module
MODULE=umfutures npm run test:module
MODULE=cmfutures npm run test:module
```

### Generated Client Dependencies

The generated client requires:

```bash
pip install websockets pydantic cryptography python-dotenv
```

Or install from generated requirements.txt:

```bash
pip install -r requirements.txt
```

## 🔧 Template Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `moduleName` | Python module name | `binance-websocket-client` | Yes |
| `packageName` | Python package name | `spot` | No |
| `version` | Client version | `0.1.0` | No |
| `author` | Author name | `openxapi` | No |

## 📚 API Reference

### BinanceWebSocketClient

```python
class BinanceWebSocketClient:
    def __init__(
        self,
        testnet: bool = False,
        auth: Optional[BinanceAuth] = None,
        auto_reconnect: bool = True,
        ping_interval: int = 20,
        ping_timeout: int = 10
    )
    
    async def connect(self, uri: Optional[str] = None) -> None
    async def disconnect(self) -> None
    async def subscribe(self, channel: str, params: dict = None) -> None
    async def unsubscribe(self, channel: str) -> None
    def set_handler(self, pattern: str, handler: Callable) -> None
    def remove_handler(self, pattern: str) -> None
    def get_message_history(self, limit: Optional[int] = None) -> List[Dict]
```

### BinanceAuth

```python
class BinanceAuth:
    def __init__(
        self,
        api_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        private_key: Optional[Union[str, bytes]] = None,
        auth_type: str = "hmac"
    )
    
    def sign(self, message: str) -> str
    def create_signed_params(self, params: dict) -> dict
    def get_headers(self) -> dict
    
    @classmethod
    def from_env(cls, auth_type: str = "hmac") -> 'BinanceAuth'
```

## 🧩 Integration with OpenXAPI

The Python template is fully integrated with the OpenXAPI project:

- **Specification Source**: Uses specs from `../../../../specs/binance/asyncapi/`
- **Module Detection**: Automatically detects target module (spot, umfutures, cmfutures)
- **Build Integration**: Compatible with project-wide build system
- **Consistent Architecture**: Follows the same patterns as the Go template

### Generate for Different Modules

```bash
# Generate for different trading modules
asyncapi generate fromTemplate \
  ../../../../specs/binance/asyncapi/spot.yaml \
  ./ \
  --output ./spot-client \
  --force-write \
  -p packageName=spot

asyncapi generate fromTemplate \
  ../../../../specs/binance/asyncapi/umfutures.yaml \
  ./ \
  --output ./futures-client \
  --force-write \
  -p packageName=umfutures
```

## 🐛 Error Handling

```python
from client import WebSocketError, AuthenticationError

try:
    async with client:
        await client.subscribe('invalid@stream')
except WebSocketError as e:
    print(f"WebSocket error: {e}")
except AuthenticationError as e:
    print(f"Authentication error: {e}")
```

## 📋 Available npm Scripts

| Script | Description |
|--------|-------------|
| `npm run generate` | Generate client using default parameters |
| `npm run test` | Run complete test workflow |
| `npm run test:clean` | Clean test files |
| `npm run test:generate` | Generate test client only |
| `npm run test:build` | Compile test client only |
| `npm run example` | Generate and run example code |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite: `npm run test`
6. Submit a pull request

## 📄 License

This template follows the same license as the OpenXAPI project.

## 🆚 Comparison with Go Template

| Feature | Python Template | Go Template |
|---------|----------------|-------------|
| **Language** | Python 3.8+ | Go 1.21+ |
| **Async Model** | asyncio/await | Goroutines |
| **Type Safety** | Pydantic models | Go structs |
| **Authentication** | HMAC, RSA, Ed25519 | HMAC, RSA, Ed25519 |
| **WebSocket Library** | websockets | gorilla/websocket |
| **Package Management** | pip/requirements.txt | go.mod |
| **Template Engine** | React templates | React templates |
| **Module Support** | ✅ All modules | ✅ All modules |

## 🔗 Links

- [OpenXAPI Project](https://github.com/openxapi/openxapi)
- [AsyncAPI Specification](https://www.asyncapi.com/)
- [Binance WebSocket API](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-api)
- [Go Template](../go/) - Sister template for Go language

---

Generated by OpenXAPI AsyncAPI Python Template v0.1.0