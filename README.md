# OpenXAPI - Open eXchange API

![OpenXAPI Logo](images/logo.svg)

### Write APIs in Specification.

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

| Exchange | Product | Module | Supported | REST API | Websocket API | SDKs |
|:--------:|:-------:|:------:|:----------:|:----------:|:------------:|:----:|
| Binance | Spot Trading | | ✅ | [Spec](./specs/binance/openapi/spot.yaml) [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/spot.yaml)| | [Go](https://github.com/openxapi/binance-go) |
| | Derivatives Trading | USDS-M Futures | ✅ | [Spec](./specs/binance/openapi/umfutures.yaml) [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/umfutures.yaml) | | [Go](https://github.com/openxapi/binance-go) |
| | | COIN-M Futures | ✅ | [Spec](./specs/binance/openapi/cmfutures.yaml) [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/cmfutures.yaml) | | [Go](https://github.com/openxapi/binance-go) |
| | | Options | ✅ | [Spec](./specs/binance/openapi/options.yaml) [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/options.yaml) | | [Go](https://github.com/openxapi/binance-go) |
| | | Portfolio Margin | ✅ | [Spec](./specs/binance/openapi/pmargin.yaml) [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/pmargin.yaml) | | [Go](https://github.com/openxapi/binance-go) |
| | | Portfolio Margin Pro | ✅ | [Spec](./specs/binance/openapi/pmarginpro.yaml) [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/pmarginpro.yaml) | | [Go](https://github.com/openxapi/binance-go) |
| | | Futures Data | ✅ | [Spec](./specs/binance/openapi/futuresdata.yaml) [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/futuresdata.yaml) | | [Go](https://github.com/openxapi/binance-go) |
| | Margin Trading | | ✅ | [Spec](./specs/binance/openapi/margin.yaml) [Swagger](https://swagger.openxapi.com?url=https://raw.githubusercontent.com/openxapi/openxapi/main/specs/binance/openapi/margin.yaml) | | [Go](https://github.com/openxapi/binance-go) |

## Project Structure

```
.
├── bin/                    # Compiled binaries
├── cmd/                    # Command-line applications
│   └── openxapi/           # Main application entry point
├── configs/                # Configuration files
│   └── config.yaml         # Exchange API documentation URLs and settings
├── generator-configs/      # OpenAPI Generator-specific configurations
├── history/                # Version history of generated specs
├── internal/               # Private application code
│   ├── config/             # Configuration management
│   ├── exchange/           # Exchange-specific implementations
│   ├── generator/          # OpenAPI spec generation logic
│   └── parser/             # API documentation parsers
├── samples/                # Sample API documentation files
│   └── binance/            # HTML samples of binance exchange documentation
├── specs/                  # Generated OpenAPI specifications
├── templates/              # Template files for spec generation
├── go.mod                  # Go module definition
├── go.sum                  # Go module dependencies checksum
└── Makefile                # Build and development commands
```

Key directories and their purposes:

- `cmd/`: Contains the main application entry points
- `internal/`: Houses the core application logic
  - `config/`: Manages application configuration
  - `exchange/`: Exchange-specific implementations and parsers
  - `generator/`: OpenAPI specification generation logic
  - `parser/`: Documentation parsing and extraction
- `configs/`: Configuration files for exchange URLs and settings
- `generator-configs/`: OpenAPI Generator-specific configurations
- `history/`: Tracks version history of generated specifications
- `samples/`: Contains webpage samples of exchange documentation
- `specs/`: Stores generated OpenAPI specifications
- `templates/`: Template files used in SDK generation

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

The program can save API documentation to sample files and use them for regenerate the OpenAPI specification offline, that said, you don't need to access the HTTP API documentation online, this is the recommended way to generate the OpenAPI specification after the first generation:

```bash
./openxapi --use-samples
```

Specify a custom directory for sample files:
```bash
./openxapi --use-samples --samples-dir=/path/to/samples
```

### Mannual maintenance on OpenAPI Specification

If you find there are some issues on the generated OpenAPI specification, please check with the exchange's official API documentation, because we try to parse the API documentation from the exchange's website automatically, there are some API documentation that is not structured well, so we need to maintain the OpenAPI specification manually.

Please follow the steps below to mannually update the OpenAPI specification:

1. Find the OpenAPI specification for an exchange in `specs/` directory, for example, `specs/binance/spot/delete_api_v3_openOrders.yaml`.
2. Add the endpoint to the `protected_endpoints` section in `configs/exchanges/binance.yaml`, this will make sure the endpoint will be ignored by the automatic generation.
3. Update the OpenAPI specification in `specs/binance/spot/delete_api_v3_openOrders.yaml`.
4. Regenerate the OpenAPI specification by the steps in [Generate OpenAPI Specification](#generate-openapi-specification) section.

## Generate SDKs for OpenAPI Specification

We use [OpenAPI Generator](https://openapi-generator.tech/) to generate SDKs for OpenAPI Specification.

Following is an example of generating Go SDK for Binance Spot REST API:

```bash
openapi-generator-cli generate \
  -g go \
  -c generator-configs/binance/go/spot.yaml \
  -o ../binance-go/spot
```

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
