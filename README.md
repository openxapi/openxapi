# OpenXAPI

OpenXAPI is a Go program that automatically generates OpenAPI Specifications from various cryptocurrency exchange API documentation. It enables automatic SDK generation for multiple programming languages using the generated OpenAPI Specs.

## Features

- Automatic OpenAPI 3.0 specification generation from exchange API docs
- Support for multiple cryptocurrency exchanges
- Configurable API documentation URL management
- Change detection and automatic spec regeneration
- Version history tracking
- Multi-language SDK generation support
- Sample file support for offline development and testing

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
├── configs/              # Configuration files
└── samples/              # Sample API documentation files
    └── webpage/          # HTML samples of exchange documentation
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

### Using Sample Files

The program can save API documentation to sample files and use them for offline development and testing:

1. Generate sample files by running the program normally:
```bash
./openxapi
```

2. Use the generated sample files instead of making HTTP requests:
```bash
./openxapi --use-samples
```

3. Specify a custom directory for sample files:
```bash
./openxapi --use-samples --samples-dir=/path/to/samples
```

### Testing with Samples

Run tests with sample files:
```bash
make test-with-samples
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 