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

## Generate OpenAPI Specification

### For the first time

1. Configure exchange API documentation URLs in `configs/config.yaml`
2. Run the OpenAPI specification generator:
```bash
./openxapi
```

> NOTE: This command will scrape the exchange's website and parse the API documentation from the website, so it may take a while to complete. Only run this command when you want to use the latest API documentation instead of the sample files.

The generated OpenAPI specification will be saved in `specs/` directory.

### For the subsequent generations - Use sample files

The program can save API documentation to sample files and use them for regenerate the OpenAPI specification offline by default, that said, you don't need to access the HTTP API documentation online, this is the recommended way to generate the OpenAPI specification after the first generation:

```bash
./openxapi
```

Or simply use `make` command:
```bash
make generate-spec EXCHANGE=binance
```

### Mannual maintenance on OpenAPI Specification

If you find there are some issues on the generated OpenAPI specification, please check with the exchange's official API documentation, because we try to parse the API documentation from the exchange's website automatically, there are some API documentation that is not structured well, so we need to maintain the OpenAPI specification manually.

Please follow the steps below to mannually update the OpenAPI specification:

1. Find the OpenAPI specification for an exchange in `specs/` directory, for example, `specs/binance/openapi/spot/delete_api_v3_openOrders.yaml`.
2. Add the endpoint to the `protected_endpoints` section in `configs/exchanges/binance/rest.yaml`, this will make sure the endpoint will be ignored by the automatic generation.
3. Update the OpenAPI specification in `specs/binance/openapi/spot/delete_api_v3_openOrders.yaml`.
4. Regenerate the OpenAPI specification by the steps in [Generate OpenAPI Specification](#generate-openapi-specification) section.

## Generate SDKs for OpenAPI Specification

We use [OpenAPI Generator](https://openapi-generator.tech/) to generate SDKs for OpenAPI Specification.

Following is an example of generating Go SDK for Binance Spot REST API:

```bash
make generate-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=../binance-go
```

* Supported languages: `go`, `python`, `js`, `rust`
* Supported exchanges: `binance`

### Update the SDK code

If you need to update the genereated SDK code, do not edit the generated code directly. Instead, update the templates in `templates/` and regenerate the SDK code.

After updating the templates, you can regenerate the SDK code by the steps in [Generate SDKs for OpenAPI Specification](#generate-sdks-for-openapi-specification) section.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Make sure to `make format && make test` before committing your changes.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 
