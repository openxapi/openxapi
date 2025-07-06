# OpenXAPI - Claude Development Guide

## Project Overview

OpenXAPI is a Go-based tool that automatically generates OpenAPI 3.0 and AsyncAPI 3.0 specifications from cryptocurrency exchange API documentation. It enables seamless SDK generation for multiple programming languages (Go, Python, JavaScript, Rust) across various exchanges.

### Core Functionality
- **Documentation Scraping**: Automatically fetches and parses exchange API documentation
- **Specification Generation**: Creates OpenAPI 3.0 and AsyncAPI 3.0 specs from parsed documentation
- **Multi-Language SDK Generation**: Generates client SDKs using OpenAPI Generator

## Architecture Overview

### Core Components

```
openxapi/
├── cmd/                    # CLI entry points
├── internal/               # Core business logic
│   ├── config/            # Configuration management
│   │   └── config.yaml    # Main configuration
│   ├── exchange/          # Exchange-specific parsers
│   │   ├── binance/       # Binance REST & WebSocket parsers
│   │   └── okx/           # OKX parsers
│   ├── generator/         # OpenAPI/AsyncAPI 3.0 spec generators
│   └── parser/            # Generic parsing interfaces
│       ├── rest/          # REST API parsing
│       └── websocket/     # WebSocket API parsing
├── configs/               # Configuration files
├── samples/               # Offline API documentation
├── specs/                 # Generated specifications
└── templates/             # SDK generation templates
```

### Key Design Patterns

1. **Interface-Based Architecture**: Core parsing logic uses interfaces for extensibility
2. **Exchange Abstraction**: Each exchange implements common parsing interfaces
3. **Template-Driven Generation**: Uses Mustache templates for REST SDK generation, and React templates for WebSocket SDK generation
4. **Sample-First Development**: Prioritizes offline samples for consistent generation

## Configuration System

### Main Config (`configs/config.yaml`)
```yaml
exchange_dir: "configs/exchanges"
settings:
  update_interval: "24h"
  output_dir: "specs"
  history_dir: "history"
  log_level: "info"
```

### Exchange-Specific Configs (`configs/exchanges/{exchange}/{api_type}.yaml`)
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

## Development Commands

### Core Operations
```bash
# Build the project
make build

# Generate specifications for all exchanges
./openxapi

# Generate OpenAPI/AsyncAPI spec for specific exchange
make generate-spec EXCHANGE=binance

# Generate OpenAPI spec for specific exchange
make generate-rest-spec EXCHANGE=binance

# Validate REST spec for specific exchange
make validate-rest-spec EXCHANGE=binance

# Validate AsyncAPI spec for specific exchange
make validate-ws-spec EXCHANGE=binance

# Generate REST SDK for specific language and exchange
make generate-rest-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=${PWD}/../binance-go/rest

# Generate WebSocket SDK for specific language and exchange
make generate-ws-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=${PWD}/../binance-go/ws

# Run tests
make test

# Format code
make format

# Check code quality
make lint

# Check code quality
make vet
```

### Environment Setup
```bash
# Prerequisites
go version  # Requires Go 1.21+
git --version

# Install dependencies
go mod download

# Install OpenAPI Generator, please refer to https://openapi-generator.tech/docs/installation
# Install AsyncAPI CLI, please refer to https://www.asyncapi.com/docs/tools/generator/installation-guide
```

## Code Organization Principles

### Exchange Implementation Pattern

Each exchange follows this structure:
```
internal/exchange/{exchange}/
├── rest/
│   ├── parser.go              # Main parser implementation
│   ├── document_parser.go     # HTML/documentation parsing
│   └── *_parser.go           # Specialized parsers (derivatives, margin, etc.)
└── websocket/
    ├── parser.go              # WebSocket parser
    └── document_parser.go     # WebSocket documentation parsing
```

### Parser Interface Implementation
```go
type Parser interface {
    Parse(ctx context.Context, doc Documentation) ([]Endpoint, error)
    CheckVersion(ctx context.Context, doc Documentation) (bool, time.Time, error)
}
```

### Endpoint Structure
```go
type Endpoint struct {
    Path              string
    Method            string
    OperationID       string
    Summary           string
    Description       string
    Parameters        []*Parameter
    RequestBody       *RequestBody
    Responses         map[string]*Response
    Security          []map[string][]string
    Protected         bool
    Schemas           []*Schema
    SecuritySchemas   map[string]*SecuritySchema
}
```

## Template System

### SDK Generation Templates
- **Location**: `templates/{exchange}/{api_type}/{language}/`
- **Engine**: Mustache templating for REST SDK generation, and React templates for WebSocket SDK generation
- **Customization**: Each language/exchange combination has tailored templates

### Template Categories
1. **API Templates**: Core API client generation for REST SDK
2. **Model Templates**: Data structure generation
3. **Configuration Templates**: Client configuration files
4. **Documentation Templates**: Generated SDK documentation

## Sample Management Strategy

### Purpose
- Enable offline development
- Provide consistent test data
- Reduce API calls during development
- Support CI/CD environments

### File Organization
```
samples/{exchange}/{api_type}/
├── {escaped_url_filename}.html
└── {group_name}/
    └── {page_specific_files}.html
```

### Usage Patterns
1. **First Run**: Scrapes live documentation, saves samples
2. **Subsequent Runs**: Uses samples by default
3. **Force Update**: Use `--no-samples` flag to scrape fresh data

## Error Handling Conventions

### Logging Levels
- **Error**: Critical failures that stop processing
- **Warn**: Issues that don't stop processing but need attention
- **Info**: General operational information
- **Debug**: Detailed debugging information

### Error Wrapping Pattern
```go
if err != nil {
    return fmt.Errorf("operation description: %w", err)
}
```

## Testing Strategy

### Test Categories
1. **Unit Tests**: Individual component testing
2. **Integration Tests**: End-to-end workflow testing
3. **Parser Tests**: Documentation parsing validation
4. **Generation Tests**: Spec generation verification

### Test Data Management
- Use real samples from `samples/` directory
- Mock external HTTP calls in unit tests
- Validate generated specs against OpenAPI/AsyncAPI 3.0 schemas

## Debugging WebSocket Integration Test Failures

When WebSocket integration tests fail, follow this systematic debugging approach to identify root causes for binance exchange and websocket spot module:

### 1. Check Original API Documentation
**Location**: `samples/binance/websocket/spot/` 
- Verify parameter requirements from official Binance WebSocket API docs
- Identify mandatory vs optional parameters  
- Confirm expected parameter count for each endpoint
- Check for parameter format requirements (STRING, INT, ENUM, etc.)

### 2. Verify AsyncAPI Specification Generation  
**Location**: `specs/binance/asyncapi/spot/`
- Ensure AsyncAPI specs correctly reflect the API documentation
- Validate parameter definitions match source documentation
- Check for missing or extra parameters in the spec
- Verify parameter types and constraints are accurate

### 3. Inspect Generated Client Code
**Location**: `templates/binance/asyncapi/go/`
- Review generated Go models for correct parameter structures
- Check if template generation is adding/omitting parameters incorrectly
- Verify request serialization logic in client templates
- Ensure authentication parameter handling is correct
- **Critical**: Check `structToMap` function for number precision issues (int64 values becoming scientific notation)

### 4. Fix Integration Test Code
**Location**: Test files and integration tests
- Only after confirming steps 1-3 are correct
- Update test parameter usage to match API requirements
- Fix request construction and parameter passing

### Common Test Failure Patterns

#### Parameter Count Mismatches
**Symptom**: "Not all sent parameters were read; read 'X' parameter(s) but was sent 'Y'"
**Root Causes**: 
- Template serialization issue - check if client is sending extra fields like `id`, `method` in `params`
- Number precision loss in `structToMap` conversion
**Debug**: 
1. Check API docs for exact parameter count
2. Verify AsyncAPI spec parameter definitions  
3. Inspect generated request serialization logic

#### Signature Validation Errors (-1022)
**Symptom**: "Signature for this request is not valid"
**Root Causes**:
- Number precision loss: int64 values converted to scientific notation (e.g., `1.2569099453e+10`)
- Incorrect parameter ordering in signature payload
- Wrong timestamp format or parameter values
**Debug**:
1. Check if `structToMap` is preserving int64 precision
2. Verify signature payload parameter ordering (alphabetical)
3. Ensure timestamp is Unix milliseconds format

#### Authentication Parameter Issues
**Symptom**: "method X requires parameters but none provided: [apiKey signature timestamp]"
**Root Cause**: Empty params object prevents authentication system from adding required fields
**Solution**: Initialize empty params structure so auth system can populate it

#### Missing Required Parameters
**Symptom**: "Parameter 'X' was empty" or validation errors
**Root Cause**: Test not setting required parameters
**Debug**: Check API docs for mandatory parameter list

### Key Technical Fixes Applied

#### Authentication Parameter Handling
- Auth parameters (`apiKey`, `signature`, `timestamp`) are excluded from AsyncAPI specs
- Parameters are automatically added by the signing system, not included in models
- Authentication type detection improved to distinguish public vs authenticated endpoints

## Common Development Scenarios

### Adding New Exchange Support

1. **Create Exchange Structure**:
   ```bash
   mkdir -p internal/exchange/{new_exchange}/rest
   mkdir -p internal/exchange/{new_exchange}/websocket
   ```

2. **Implement Parsers**:
   - Implement `Parser` interface
   - Create exchange-specific document parser
   - Add configuration in `configs/exchanges/{exchange}/`

3. **Add Templates**:
   - Copy and customize from similar exchange
   - Test SDK generation

4. **Update Documentation**:
   - Add to supported exchanges list
   - Document any special requirements

### Debugging Parsing Issues

1. **Enable Debug Logging**:
   ```bash
   ./openxapi -log-level debug
   ```

2. **Inspect Samples**:
   - Check `samples/{exchange}/` for saved HTML
   - Verify URL structures match expected patterns

3. **Test Individual Components**:
   ```bash
   go test -v ./internal/exchange/{exchange}/rest/
   ```

### Updating OpenAPI Specifications

1. **Manual Override Process**:
   - Add endpoint to `protected_endpoints` in exchange config
   - Manually edit spec in `specs/{exchange}/openapi/{api_type}/`
   - Regenerate combined spec

2. **Template Customization**:
   - Modify templates in `templates/{exchange}/`
   - Regenerate SDKs to test changes

## Security Considerations

### API Key Management
- Never commit API keys or secrets
- Use environment variables for authentication
- Implement secure authentication in generated SDKs

### Rate Limiting
- Respect exchange rate limits during scraping
- Implement backoff strategies
- Use samples to minimize API calls

## Performance Optimization

### Concurrent Processing
- Parse multiple URLs concurrently
- Batch similar operations
- Use worker pools for CPU-intensive tasks

### Memory Management
- Stream large HTML documents
- Clean up resources promptly
- Monitor memory usage during processing

## Troubleshooting Guide

### Common Issues

1. **"command not found" errors**:
   - Ensure Go is installed and in PATH
   - Verify binary is built: `make build`

2. **Parsing failures**:
   - Check if exchange updated their documentation format
   - Verify URL accessibility
   - Examine saved samples for changes

3. **SDK generation issues**:
   - Ensure OpenAPI Generator is installed
   - Check template compatibility
   - Verify generated spec validity

4. **Configuration errors**:
   - Validate YAML syntax
   - Check file paths are correct
   - Ensure required fields are present

## Contributing Guidelines

### Code Standards
- Follow Go best practices and idioms
- Use meaningful variable and function names  
- Include comprehensive error handling
- Write tests for new functionality
- Document exported functions and types

### Pull Request Process
1. Create feature branch from main
2. Implement changes with tests
3. Run `make format && make test`
4. Submit PR with clear description
5. Address review feedback

### Commit Message Format
```
type(scope): description

Examples:
feat(binance): add support for futures API
fix(parser): handle malformed HTML gracefully
docs(readme): update installation instructions
```

## Project Maintenance

### Regular Tasks
- Monitor exchange API documentation changes
- Update dependencies regularly
- Refresh sample data periodically
- Validate generated SDKs against live APIs

### Release Process
1. Update version numbers
2. Generate fresh specifications
3. Test SDK generation
4. Update documentation
5. Create GitHub release

---

## Quick Reference

### Key Files
- `configs/config.yaml` - Main configuration
- `internal/config/config.go` - Configuration structs
- `internal/generator/openapi.go` - Spec generation logic for REST SDK
- `internal/generator/asyncapi.go` - Spec generation logic for WebSocket SDK
- `internal/parser/rest/http_parser.go` - HTTP parsing logic for REST API Documentation
- `internal/parser/websocket/http_parser.go` - WebSocket parsing logic for WebSocket API Documentation

### Important Interfaces
- `parser.Parser` - Main parsing interface
- `parser.HTTPDocumentParser` - Document parsing interface
- `generator.Generator` - Specification generation

## Known Issues

### WebSocket UserDataStream Subscribe/Unsubscribe Error (FIXED)
**Error**: "Not all sent parameters were read; read '0' parameter(s) but was sent '1'"
**Cause**: The UserDataStream.subscribe and UserDataStream.unsubscribe methods don't accept any parameters, but the generated client was creating an empty params field for authentication.
**Solution**: Fixed in WebSocketHandlers.js template to skip params creation for userDataStream methods. Template now includes special case handling:
```javascript
if (requestMap["method"] == "userDataStream.subscribe" || requestMap["method"] == "userDataStream.unsubscribe") {
    // These methods require authentication but don't accept any parameters
    // Skip params creation - authentication is handled at the WebSocket connection level
}
```

### Binance WebSocket API Specific Issues

#### PERCENT_PRICE_BY_SIDE Filter
**Error**: "Filter failure: PERCENT_PRICE_BY_SIDE" (error -1013)
**Cause**: Order price is too far from current market price
**Solution**: Fetch current market price and place orders within acceptable percentage range (e.g., 5% from current price)

#### SessionLogon Authentication
**Error**: "Signature for this request is not valid" (error -1022)
**Cause**: WebSocket session.logon requires Ed25519 keys with proper signature generation, not HMAC-SHA256
**Solution**: Implement Ed25519 signature generation for session.logon requests. The test code was incorrectly using HMAC-SHA256 for all key types. Fixed by updating generateSignature function to handle Ed25519 keys:

```go
case KeyTypeED25519:
    // Load Ed25519 private key from file and decode (hex or base64)
    privateKey := ed25519.PrivateKey(privateKeyBytes)
    signature := ed25519.Sign(privateKey, []byte(queryString))
    return hex.EncodeToString(signature), nil
```

The fix handles multiple Ed25519 key formats:
- PEM-encoded PKCS8 keys (parsed with x509.ParsePKCS8PrivateKey)
- 32-byte seed format (hex/base64) using ed25519.NewKeyFromSeed
- 64-byte full key format (hex/base64) used directly as ed25519.PrivateKey

The error "ed25519: bad private key length: 48" indicated a PEM-encoded key that needed proper parsing rather than raw byte decoding.

#### OCO Order Parameters
**Error**: "Parameter 'aboveTimeInForce' sent when not required" (error -1106)
**Cause**: LIMIT_MAKER orders don't require timeInForce parameter
**Solution**: Only send timeInForce for order types that require it (e.g., STOP_LOSS_LIMIT)

#### OCO Order Price Rules
**Error**: "A limit order in a buy OCO must be below" (error -1165)
**Cause**: For buy OCO orders, limit price must be below current market price, stop price must be above
**Solution**: Fetch current market price and set limit price below it, stop price above it

#### UserDataStream Authentication
**Error**: "WebSocket session not authenticated. Recommendation: use 'session.logon'" (error -1193)
**Cause**: UserDataStream subscribe/unsubscribe requires session.logon which only works with Ed25519 keys
**Solution**: Skip UserDataStream tests when using HMAC/RSA keys, or use Ed25519 keys for WebSocket session authentication

This guide provides the essential context for understanding and contributing to the OpenXAPI project. For specific implementation details, refer to the source code and existing tests. 