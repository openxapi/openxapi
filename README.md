# OpenXAPI - Open eXchange API

![OpenXAPI Logo](images/logo.svg)

### Write APIs by Specification.

### One Spec. All Exchanges. Any Language.

OpenXAPI provides standardized OpenAPI and AsyncAPI specifications for cryptocurrency exchanges and DeFi protocols, enabling seamless integration and SDK generation across multiple programming languages.

## Specifications

### REST API - OpenAPI Specification

OpenXAPI is a Go program that automatically generates OpenAPI Specifications from various cryptocurrency exchange API documentation. It enables automatic SDK generation for multiple programming languages using the generated OpenAPI Specs.

### WebSocket API - AsyncAPI Specification

OpenXAPI also maintains AsyncAPI Specifications for cryptocurrency exchanges and DeFi protocols.
So that you can use the same specification to generate websocket client SDKs for multiple programming languages.

## Features

### Everything in one place

- Automatic OpenAPI 3.0 specification generation from exchange API docs
- AsyncAPI specification for exchanges and DeFi protocols
- Multi-language SDK generation support

### Full coverage

- Support for multiple cryptocurrency exchanges and DeFi protocols
- Configurable API documentation URL management
- Change detection and automatic spec regeneration
- Version history tracking
- Sample file support for offline development and testing

## Supported Exchanges

| Exchange | Product | Sub Products | REST API | Websocket API |
|:--------:|-------|----------|:----------:|:------------:|
| <img src="./images/binance.jpg" width="100" /> | Spot | ✅ [Spot Trading](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-api-information) <br> ✅ [Margin Trading](https://developers.binance.com/docs/margin_trading/Introduction) <br> ✅ [Algo Trading](https://developers.binance.com/docs/algo/Introduction) <br> ✅ [Wallet](https://developers.binance.com/docs/wallet/Introduction) <br> ✅ [Copy Trading](https://developers.binance.com/docs/copy_trading/Introduction) <br> ✅ [Convert](https://developers.binance.com/docs/convert/Introduction) <br> ✅ [Sub Account](https://developers.binance.com/docs/sub_account/Introduction) <br>✅ [Binance Link](https://developers.binance.com/docs/binance_link/change-log) <br>✅ [Futures Data](https://developers.binance.com/docs/derivatives/futures-data/general-info) <br> ✅ [Portfolio Margin Pro](https://developers.binance.com/docs/derivatives/portfolio-margin-pro/general-info) <br>✅ [Staking](https://developers.binance.com/docs/staking/Introduction) <br>✅ [Dual Investment](https://developers.binance.com/docs/dual_investment/Introduction) <br>✅ [Mining](https://developers.binance.com/docs/mining/Introduction) <br>✅ [Crypto Loan](https://developers.binance.com/docs/crypto_loan/Introduction) <br>✅ [VIP Loan](https://developers.binance.com/docs/vip_loan/Introduction) <br>✅ [C2C](https://developers.binance.com/docs/c2c/Introduction) <br>✅ [Fiat](https://developers.binance.com/docs/fiat/Introduction) <br>✅ [NFT](https://developers.binance.com/docs/nft/Introduction) <br>✅ [Gift Card](https://developers.binance.com/docs/gift_card/Introduction) <br>✅ [Rebate](https://developers.binance.com/docs/rebate/Introduction) <br>✅ [Simple Earn](https://developers.binance.com/docs/simple_earn/Introduction) <br>✅ [Binance Pay History](https://developers.binance.com/docs/pay/Introduction) | [OpenAPI - REST API](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/spot.yaml) <br> [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/spot.yaml)| [AsyncAPI - Websocket API + User Data Streams](https://raw.githubusercontent.com/openxapi/openxapi/refs/heads/main/specs/binance/asyncapi/spot.yaml) <br> [AsyncAPI - Market Streams](https://raw.githubusercontent.com/openxapi/openxapi/refs/heads/main/specs/binance/asyncapi/spot-streams.yaml) |
| | USDS-M Futures | ✅ [USDS Margined Futures](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info) <br> ✅ [Binance Link](https://developers.binance.com/docs/binance_link/link-and-trade/futures) | [OpenAPI - REST API](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/umfutures.yaml) <br> [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/umfutures.yaml) | [AsyncAPI - Websocket API + User Data Streams](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/asyncapi/umfutures.yaml) <br> [AsyncAPI - Market Streams](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/asyncapi/umfutures-streams.yaml) |
| | COIN-M Futures | ✅ [COIN Margined Futures](https://developers.binance.com/docs/derivatives/coin-margined-futures/general-info) | [OpenAPI - REST API](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/cmfutures.yaml) <br> [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/cmfutures.yaml) | [AsyncAPI - Websocket API + User Data Streams](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/asyncapi/cmfutures.yaml) <br> [AsyncAPI - Market Streams](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/asyncapi/cmfutures-streams.yaml) |
| | Options | ✅ [Options](https://developers.binance.com/docs/derivatives/option/general-info) | [OpenAPI - REST API](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/options.yaml) <br> [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/options.yaml) | [AsyncAPI - Websocket API + User Data Streams](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/asyncapi/options.yaml) <br> [AsyncAPI - Market Streams](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/asyncapi/options-streams.yaml) |
| | Portfolio Margin | ✅ [Portfolio Margin](https://developers.binance.com/docs/derivatives/portfolio-margin/general-info) | [OpenAPI - REST API](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/pmargin.yaml), [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/pmargin.yaml) | [AsyncAPI - Websocket API + User Data Streams](https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/asyncapi/pmargin.yaml) |

## SDKs

| Exchange | Go | Python | JavaScript | Rust |
|:--------:|----|------|----------|----|
| <img src="./images/binance.jpg" width="100" /> | [Github](https://github.com/openxapi/binance-go) <br> [![GitHub Tag](https://img.shields.io/github/v/tag/openxapi/binance-go)](https://github.com/openxapi/binance-go) | [Github](https://github.com/openxapi/binance-py) <br> [![PyPI - Version](https://img.shields.io/pypi/v/openxapi-binance)](https://pypi.org/project/openxapi-binance/) | [Github](https://github.com/openxapi/binance-js) <br> [![NPM Version](https://img.shields.io/npm/v/%40openxapi%2Fbinance)](https://www.npmjs.com/package/@openxapi/binance) | [Github](https://github.com/openxapi/binance-rs) <br> [![Crates.io Version](https://img.shields.io/crates/v/openxapi-binance)](https://crates.io/crates/openxapi-binance) |

## Project Structure

```
.
├── bin/                    # Compiled binaries
│   └── openxapi           # Main executable
├── cmd/                    # Command-line applications
│   └── openxapi/           # Main application entry point
│       └── main.go
├── configs/                # Configuration files
│   ├── config.yaml         # Main configuration file
│   └── exchanges/          # Exchange-specific configurations
│       ├── binance/        # Binance exchange configs
│       │   ├── rest.yaml   # REST API configuration
│       │   └── websocket.yaml # WebSocket API configuration
│       └── okx/            # OKX exchange configs
│           └── restapi.yaml
├── generator-configs/      # SDK generator configurations
│   ├── binance/           # Binance-specific generator configs
│   │   ├── asyncapi/      # AsyncAPI generator configs (Go WebSocket SDKs)
│   │   └── openapi/       # OpenAPI generator configs (REST SDKs)
│   │       ├── go/        # Go-specific configurations
│   │       ├── js/        # JavaScript-specific configurations
│   │       ├── python/    # Python-specific configurations
│   │       └── rust/      # Rust-specific configurations
│   └── okx/               # OKX-specific generator configs
├── history/                # Version history of generated specs (empty)
├── images/                 # Project images and assets
│   ├── binance.jpg        # Binance logo
│   └── logo.svg           # Project logo
├── internal/               # Private application code
│   ├── config/            # Configuration management
│   ├── exchange/          # Exchange-specific implementations
│   │   ├── binance/       # Binance exchange parsers
│   │   │   ├── rest/      # REST API parsers
│   │   │   └── websocket/ # WebSocket API parsers
│   │   └── okx/           # OKX exchange parsers
│   │       ├── rest/      # REST API parsers
│   │       └── websocket/ # WebSocket API parsers
│   ├── generator/         # Specification generation logic
│   │   ├── asyncapi.go    # AsyncAPI 3.0 spec generation
│   │   └── openapi.go     # OpenAPI 3.0 spec generation
│   └── parser/            # Generic parsing interfaces
│       ├── rest/          # REST API parsing interfaces
│       └── websocket/     # WebSocket API parsing interfaces
├── samples/                # Sample API documentation files
│   ├── binance/           # Binance documentation samples
│   │   ├── rest/          # REST API documentation samples
│   │   │   ├── spot/      # Spot trading samples
│   │   │   ├── umfutures/ # USD-M futures samples
│   │   │   ├── cmfutures/ # COIN-M futures samples
│   │   │   ├── options/   # Options samples
│   │   │   └── pmargin/   # Portfolio margin samples
│   │   └── websocket/     # WebSocket API documentation samples
│   └── okx/               # OKX documentation samples
│       └── rest/          # OKX REST API samples
├── specs/                  # Generated specifications
│   ├── binance/           # Binance specifications
│   │   ├── asyncapi/      # AsyncAPI 3.0 specifications
│   │   │   ├── spot.yaml          # Spot WebSocket API
│   │   │   ├── spot-streams.yaml  # Spot market streams
│   │   │   ├── umfutures.yaml     # USD-M futures WebSocket API
│   │   │   ├── umfutures-streams.yaml # USD-M futures streams
│   │   │   ├── cmfutures.yaml     # COIN-M futures WebSocket API
│   │   │   ├── cmfutures-streams.yaml # COIN-M futures streams
│   │   │   ├── options.yaml       # Options WebSocket API
│   │   │   ├── options-streams.yaml # Options streams
│   │   │   ├── pmargin.yaml       # Portfolio margin WebSocket API
│   │   │   └── {module}/          # Individual operation specs
│   │   └── openapi/       # OpenAPI 3.0 specifications
│   │       ├── spot.yaml          # Spot REST API
│   │       ├── umfutures.yaml     # USD-M futures REST API
│   │       ├── cmfutures.yaml     # COIN-M futures REST API
│   │       ├── options.yaml       # Options REST API
│   │       └── pmargin.yaml       # Portfolio margin REST API
│   └── okx/               # OKX specifications
│       └── openapi/
│           └── rest.yaml  # OKX REST API
├── templates/              # Template files for SDK generation
│   ├── binance/           # Binance-specific templates
│   │   ├── asyncapi/      # AsyncAPI/WebSocket SDK templates
│   │   │   └── go/        # Go WebSocket SDK templates (React-based)
│   │   └── openapi/       # OpenAPI/REST SDK templates
│   │       ├── go/        # Go REST SDK templates (Mustache)
│   │       ├── js/        # JavaScript REST SDK templates (Mustache)
│   │       ├── python/    # Python REST SDK templates (Mustache)
│   │       └── rust/      # Rust REST SDK templates (Mustache)
│   └── okx/               # OKX-specific templates
│       └── openapi/
├── go.mod                  # Go module definition
├── go.sum                  # Go module dependencies checksum
├── Makefile                # Build and development commands
├── CLAUDE.md               # Development guide and project instructions
└── LICENSE                 # Project license
```

### Key Directories and Their Purposes

#### Core Application
- **`cmd/`**: Contains the main application entry points
- **`internal/`**: Houses the core application logic
  - **`config/`**: Manages application configuration
  - **`exchange/`**: Exchange-specific implementations and parsers
  - **`generator/`**: OpenAPI 3.0 and AsyncAPI 3.0 specification generation logic
  - **`parser/`**: Generic parsing interfaces for REST and WebSocket APIs

#### Configuration and Setup
- **`configs/`**: Configuration files for exchange URLs and settings
  - **`exchanges/`**: Exchange-specific API configuration files
- **`generator-configs/`**: SDK generator-specific configurations for different languages
- **`templates/`**: Template files used in SDK generation
  - REST SDKs use **Mustache** templates
  - WebSocket SDKs use **React** templates

#### Generated Content
- **`specs/`**: Generated OpenAPI 3.0 and AsyncAPI 3.0 specifications
  - **`openapi/`**: REST API specifications
  - **`asyncapi/`**: WebSocket API specifications with separate files for API operations and market streams
- **`samples/`**: Cached webpage samples of exchange documentation for offline development
- **`history/`**: Version history tracking (currently unused)

#### Development and Build
- **`bin/`**: Compiled executable binaries
- **`images/`**: Project logos and visual assets

## Getting Started

### Prerequisites

- Go 1.21 or higher
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/openxapi/openxapi.git
cd openxapi
```

2. Install dependencies:
```bash
go mod download
```

3. Build the project:
```bash
make build
```

## Working with Specifications

OpenXAPI generates two types of specifications for cryptocurrency exchange APIs:

- **OpenAPI 3.0 Specifications** for REST API endpoints
- **AsyncAPI 3.0 Specifications** for WebSocket API endpoints

Both specifications are automatically generated from exchange API documentation and can be used to generate SDKs for multiple programming languages.

## Generate OpenAPI Specifications (REST APIs)

OpenAPI specifications define REST API endpoints, request/response schemas, authentication methods, and parameter validation rules.

### Initial Generation

1. Configure exchange API documentation URLs in `configs/exchanges/{exchange}/rest.yaml`
2. Generate specifications for all exchanges:
```bash
./openxapi
```

3. Generate specifications for a specific exchange:
```bash
make generate-rest-spec EXCHANGE=binance
```

> **NOTE**: Initial generation scrapes live exchange documentation, which may take several minutes. The process saves documentation samples locally for faster subsequent generations.

### Subsequent Generations (Recommended)

Use cached sample files for faster, offline generation:

```bash
# Generate all specifications
./openxapi

# Generate specific exchange REST specifications
make generate-rest-spec EXCHANGE=binance

# Generate all specifications for specific exchange
make generate-spec EXCHANGE=binance
```

### Generated Files Structure

```
specs/
└── {exchange}/
    └── openapi/
        ├── {module}.yaml          # Combined specification
        └── {module}/             # Individual endpoint specifications
            ├── endpoint1.yaml
            ├── endpoint2.yaml
            └── ...
```

**Example for Binance:**
```
specs/binance/openapi/
├── spot.yaml              # Combined Spot REST API
├── umfutures.yaml         # Combined USD-M Futures REST API
├── cmfutures.yaml         # Combined COIN-M Futures REST API
├── options.yaml           # Combined Options REST API
├── pmargin.yaml           # Combined Portfolio Margin REST API
└── spot/                  # Individual Spot endpoints
    ├── get_api_v3_account.yaml
    ├── post_api_v3_order.yaml
    └── ...
```

### Validation

Validate generated OpenAPI specifications:

```bash
# Validate specific exchange REST specifications
make validate-rest-spec EXCHANGE=binance

# Validate using external tools
swagger-codegen validate -i specs/binance/openapi/spot.yaml
```

### Manual Maintenance

When automatic generation produces incorrect specifications:

1. **Identify the problematic endpoint**:
   ```bash
   # Find the specific endpoint file
   ls specs/binance/openapi/spot/
   ```

2. **Protect from automatic regeneration**:
   Edit `configs/exchanges/binance/rest.yaml`:
   ```yaml
   protected_endpoints:
     - "DELETE /api/v3/openOrders"
   ```

3. **Manually edit the specification**:
   ```bash
   # Edit the endpoint specification
   vim specs/binance/openapi/spot/delete_api_v3_openOrders.yaml
   ```

4. **Regenerate combined specification**:
   ```bash
   make generate-rest-spec EXCHANGE=binance
   ```

## Generate AsyncAPI Specifications (WebSocket APIs)

AsyncAPI specifications define WebSocket operations, message schemas, authentication, and real-time event handling for streaming APIs.

### WebSocket API Types

OpenXAPI generates two types of WebSocket specifications:

1. **API Operations**: Request/response operations (user data streams, account operations)
2. **Market Streams**: Real-time market data streams (price feeds, order books, trades)

### Initial Generation

1. Configure WebSocket documentation URLs in `configs/exchanges/{exchange}/websocket.yaml`
2. Generate WebSocket specifications:
```bash
# Generate all WebSocket specifications
make generate-ws-spec EXCHANGE=binance

# Generate all specifications (REST + WebSocket)
make generate-spec EXCHANGE=binance
```

### Generated Files Structure

```
specs/
└── {exchange}/
    └── asyncapi/
        ├── {module}.yaml          # API operations specification
        ├── {module}-streams.yaml  # Market streams specification
        └── {module}/             # Individual operation specifications
            ├── operation1.yaml
            ├── operation2.yaml
            └── ...
```

**Example for Binance:**
```
specs/binance/asyncapi/
├── spot.yaml                 # Spot WebSocket API operations
├── spot-streams.yaml         # Spot market data streams
├── umfutures.yaml           # USD-M Futures WebSocket API
├── umfutures-streams.yaml   # USD-M Futures market streams
├── cmfutures.yaml           # COIN-M Futures WebSocket API
├── cmfutures-streams.yaml   # COIN-M Futures market streams
├── options.yaml             # Options WebSocket API
├── options-streams.yaml     # Options market streams
├── pmargin.yaml             # Portfolio Margin WebSocket API
└── spot/                    # Individual Spot operations
    ├── session.logon.yaml
    ├── order.place.yaml
    ├── userDataStream.subscribe.yaml
    └── ...
```

### WebSocket Specification Features

**API Operations (`{module}.yaml`)**:
- Authentication methods (HMAC-SHA256, RSA, Ed25519)
- Request/response message schemas
- User data stream management
- Account and trading operations
- Error handling and status codes

**Market Streams (`{module}-streams.yaml`)**:
- Real-time price feeds
- Order book updates
- Trade streams
- Kline/candlestick data
- Ticker information
- Market depth streams

### Validation

Validate generated AsyncAPI specifications:

```bash
# Validate specific exchange WebSocket specifications
make validate-ws-spec EXCHANGE=binance

# Validate using AsyncAPI CLI
asyncapi validate specs/binance/asyncapi/spot.yaml
```

### Configuration Management

**REST API Configuration (`configs/exchanges/{exchange}/rest.yaml`)**:
```yaml
name: "binance_spot"
version: "1.0.0"
docs:
  - type: "rest"
    servers: ["https://api.binance.com"]
    url_groups:
      - name: "spot_trading"
        urls: ["https://developers.binance.com/docs/..."]
    protected_endpoints: ["POST /api/v3/order"]
```

**WebSocket API Configuration (`configs/exchanges/{exchange}/websocket.yaml`)**:
```yaml
name: "binance_websocket"
version: "1.0.0"
docs:
  - type: "spot"
    servers:
      mainnet: ["wss://stream.binance.com:9443"]
      testnet: ["wss://testnet.binance.vision"]
    url_groups:
      - name: "spot_websocket"
        doc_type: "spot"
        urls: ["https://developers.binance.com/docs/..."]
```

## Generate SDKs from Specifications

### REST SDK Generation (OpenAPI)

Generate REST SDKs using [OpenAPI Generator](https://openapi-generator.tech/):

```bash
# Generate Go SDK for Binance Spot REST API
make generate-rest-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=../binance-go/rest

# Generate Python SDK
make generate-rest-sdk EXCHANGE=binance LANGUAGE=python OUTPUT_DIR=../binance-py/rest

# Generate JavaScript SDK
make generate-rest-sdk EXCHANGE=binance LANGUAGE=js OUTPUT_DIR=../binance-js/rest

# Generate Rust SDK
make generate-rest-sdk EXCHANGE=binance LANGUAGE=rust OUTPUT_DIR=../binance-rs/rest
```

### WebSocket SDK Generation (AsyncAPI)

Generate WebSocket SDKs using [AsyncAPI Generator](https://www.asyncapi.com/tools/generator):

```bash
# Generate Go WebSocket SDK for Binance
make generate-ws-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=../binance-go/ws

# Generate for specific module
make generate-ws-sdk EXCHANGE=binance MODULE=spot LANGUAGE=go OUTPUT_DIR=../binance-go/ws/spot
```

### Supported Languages and Exchanges

**REST SDKs (OpenAPI)**:
- **Languages**: `go`, `python`, `js`, `rust`
- **Exchanges**: `binance`, `okx`
- **Template Engine**: Mustache

**WebSocket SDKs (AsyncAPI)**:
- **Languages**: `go` (more languages coming soon)
- **Exchanges**: `binance`
- **Template Engine**: React with TypeScript

### Customizing Generated SDKs

**For REST SDKs**:
1. Edit Mustache templates in `templates/{exchange}/openapi/{language}/`
2. Regenerate SDK:
   ```bash
   make generate-rest-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=../binance-go/rest
   ```

**For WebSocket SDKs**:
1. Edit React templates in `templates/{exchange}/asyncapi/{language}/`
2. Regenerate SDK:
   ```bash
   make generate-ws-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=../binance-go/ws
   ```

### SDK Features

**REST SDK Features**:
- Type-safe request/response models
- Automatic request signing and authentication
- Rate limiting and retry mechanisms
- Comprehensive error handling
- Debug logging and request tracing

**WebSocket SDK Features**:
- Automatic connection management and reconnection
- Message type safety with generated models
- Authentication handling (HMAC, RSA, Ed25519)
- Stream subscription management
- Event-driven architecture with callbacks
- Built-in error handling and recovery

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Make sure to `make format && make test` before committing your changes.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 
