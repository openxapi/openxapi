# OpenXAPI

OpenXAPI is a Go program that automatically generates OpenAPI Specifications from various cryptocurrency exchange API documentation. It enables automatic SDK generation for multiple programming languages using the generated OpenAPI Specs.

## Features

- Automatic OpenAPI 3.0 specification generation from exchange API docs
- Support for multiple cryptocurrency exchanges
- Configurable API documentation URL management
- Change detection and automatic spec regeneration
- Version history tracking
- Multi-language SDK generation support

## Project Structure

```
.
├── cmd/                    # Command-line applications
│   └── openxapi/          # Main application
├── internal/              # Private application code
│   ├── config/           # Configuration management
│   ├── parser/           # API documentation parsers
│   ├── generator/        # OpenAPI spec generation
│   └── exchange/         # Exchange-specific implementations
├── pkg/                   # Public library code
│   └── models/           # Shared data models
└── configs/              # Configuration files
```

## Getting Started

### Prerequisites

- Go 1.21 or higher
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/adshao/openxapi.git
cd openxapi
```

2. Install dependencies:
```bash
go mod download
```

3. Build the project:
```bash
go build ./cmd/openxapi
```

## Usage

1. Configure exchange API documentation URLs in `configs/exchanges.yaml`
2. Run the OpenAPI specification generator:
```bash
./openxapi generate
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 