import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'spot';
  const moduleName = params.moduleName || 'binance-websocket-client';

  return (
    <File name="requirements.txt">
      <Text>{`# Generated requirements for Binance ${packageName.toUpperCase()} WebSocket Client
# Core dependencies
asyncio-mqtt>=0.11.0
websockets>=11.0.0
pydantic>=2.0.0
python-dotenv>=1.0.0

# Authentication and cryptography
cryptography>=41.0.0

# Development and testing dependencies (optional)
pytest>=7.0.0
pytest-asyncio>=0.21.0
black>=23.0.0
flake8>=6.0.0
mypy>=1.0.0

# Documentation dependencies (optional)
sphinx>=7.0.0
sphinx-rtd-theme>=1.0.0
`}</Text>
    </File>
  );
}