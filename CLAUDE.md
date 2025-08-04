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
    ├── document_parser.go     # WebSocket documentation parsing (factory pattern)
    └── *_document_parser.go   # Specialized parsers (umfutures, etc.)
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

### WebSocket Event Handler Naming Convention

**CRITICAL**: All WebSocket SDK templates must follow consistent event handler naming patterns for intuitive, predictable APIs across all modules.

#### Event Handler Patterns
- **Event Handlers**: `Handle{EventName}Event` for actual real-time events
- **Response Handlers**: `Handle{ResponseType}` for subscription confirmations and responses  
- **Error Handlers**: `Handle{ErrorType}` for error handling

#### Examples by Category

**✅ Event Handlers (with 'Event' suffix):**
```go
// Trading and market events - these are real-time streaming data
func (c *Client) HandleAggregateTradeEvent(handler AggregateTradeHandler)
func (c *Client) HandleKlineEvent(handler KlineHandler)
func (c *Client) HandleTickerEvent(handler TickerHandler)
func (c *Client) HandleDepthEvent(handler DepthHandler)

// Account and order events - real-time account updates
func (c *Client) HandleBalanceUpdateEvent(handler BalanceUpdateHandler)
func (c *Client) HandleExecutionReportEvent(handler ExecutionReportHandler)
func (c *Client) HandleMarginAccountUpdateEvent(handler MarginAccountUpdateHandler)

// Portfolio margin events
func (c *Client) HandleConditionalOrderTradeUpdateEvent(handler ConditionalOrderTradeUpdateHandler)
func (c *Client) HandleRiskLevelChangeEvent(handler RiskLevelChangeHandler)
```

**✅ Response Handlers (without 'Event' suffix):**
```go
// Subscription management - these are confirmations, not events
func (c *Client) HandleSubscriptionResponse(handler SubscriptionResponseHandler)

// Session management responses
func (c *Client) HandleSessionLogonResponse(handler SessionLogonResponseHandler)
```

**✅ Error Handlers (without 'Event' suffix):**
```go
// Error handling - these are errors, not events
func (c *Client) HandleStreamError(handler StreamErrorHandler)
func (c *Client) HandlePmarginError(handler PmarginErrorHandler)
```

#### Model Name Consistency
Event handler types must reference models with matching 'Event' suffix:
```go
// Handler type definitions must match actual generated model names
type AggregateTradeHandler func(*models.AggregateTradeEvent) error  // ✅ Correct
type TickerHandler func(*models.TickerEvent) error                  // ✅ Correct

// NOT this (missing Event suffix in model reference):
type AggregateTradeHandler func(*models.AggregateTrade) error        // ❌ Wrong
```

#### Module Consistency Requirements
- **All modules** (spot, umfutures, cmfutures, options, pmargin) must follow the same pattern
- **Dynamic generation** in stream handlers must use `Handle{EventName}` prefix, not `On{EventName}`
- **Template inheritance** ensures consistency across similar modules

#### Implementation Files
Apply this convention in all WebSocket handler templates:
- `templates/binance/asyncapi/go/components/SpotStreamsWebSocketHandlers.js`
- `templates/binance/asyncapi/go/components/UmfuturesStreamsWebSocketHandlers.js`  
- `templates/binance/asyncapi/go/components/CmfuturesStreamsWebSocketHandlers.js`
- `templates/binance/asyncapi/go/components/OptionsStreamsWebSocketHandlers.js`
- `templates/binance/asyncapi/go/components/PmarginWebSocketHandlers.js`
- `templates/binance/asyncapi/go/components/ModularWebSocketHandlers.js`

**Benefits:**
- **Intuitive API**: Developers can predict method names based on whether it's an event, response, or error
- **Type Safety**: Clear distinction between event handlers and response handlers
- **Consistency**: Same patterns across all exchanges and modules
- **Maintainability**: Easy to identify the purpose of each handler method

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
- **Info**: General operational information (high-level progress, completion status)
- **Debug**: Detailed debugging information (method-level processing, response parsing details)

**Guidelines for Log Levels:**
- Use `logrus.Infof` for high-level progress that users want to see during normal operation
- Use `logrus.Debugf` for detailed processing information that's only useful during debugging
- Avoid repetitive INFO messages - if a message repeats many times, consider using DEBUG level
- Examples of appropriate INFO logs: "Processing WebSocket API type: umfutures", "Successfully generated WebSocket OpenAPI spec"
- Examples of DEBUG logs: "Method X has response message: true", "Extracted Y methods from URL Z"

### Error Wrapping Pattern
```go
if err != nil {
    return fmt.Errorf("operation description: %w", err)
}
```

## Testing Strategy

### Test Categories
1. **Unit Tests**: Individual component testing (in main repository)
2. **Integration Tests**: End-to-end workflow testing (in `github.com/openxapi/integration-tests`)
3. **Parser Tests**: Documentation parsing validation
4. **Generation Tests**: Spec generation verification

### Test Data Management
- Use real samples from `samples/` directory
- Mock external HTTP calls in unit tests
- Validate generated specs against OpenAPI/AsyncAPI 3.0 schemas

### Integration Tests Repository
Integration tests have been moved to a dedicated repository:
- **Repository**: `github.com/openxapi/integration-tests`
- **Structure**: Organized by exchange and API type
- **Benefits**: Better separation of concerns, independent test execution
- **Usage**: Clone and run tests independently from main OpenXAPI project

## Debugging WebSocket Integration Test Failures

When WebSocket integration tests fail, follow this systematic debugging approach to identify root causes for `binance` exchange and websocket `spot` module:

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
**Location**: Integration tests repository at `github.com/openxapi/integration-tests`
- Integration tests have been moved to a dedicated repository
- Clone from: `https://github.com/openxapi/integration-tests`
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
- Auth parameters (`apiKey`, `signature`, `timestamp`) are included in AsyncAPI specs as documented in the official API documentation
- Parameters are automatically added by the signing system during request processing
- Authentication type detection improved to distinguish public vs authenticated endpoints
- Parameter validation excludes auth parameters from error messages since they are auto-added

#### Type Conversion and Precision Handling
- `LONG` types from API documentation are now correctly converted to `integer` with `int64` format in AsyncAPI specs
- `timestamp` and `recvWindow` parameters are properly typed as integers instead of strings
- Go client uses `structToMap` with `json.UseNumber()` to preserve integer precision without scientific notation
- Signing logic correctly generates Unix millisecond timestamps as `int64` values

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

## CRITICAL DEVELOPMENT RULES

### Spec Generation Principle
**NEVER modify generated specification files directly.** All changes must be made in parser code so they are automatically generated.

**Key Guidelines:**
1. **Generated specs are OUTPUT ONLY** - Never manually edit files in `specs/` directory
2. **Fix parser code instead** - All spec corrections must be implemented in parser logic
3. **Regenerate after changes** - Always run generation commands after parser modifications
4. **Automation is key** - Specs must be reproducible and consistent through automated generation

### Malformed JSON Handling Principle
**ALWAYS clean malformed JSON through parser code first.** When encountering JSON parsing errors, follow this systematic approach:

**Key Guidelines:**
1. **Parser cleaning first** - Use and enhance the `cleanResponseLine` function in `internal/exchange/binance/websocket/document_parser.go`
2. **Apply comprehensive cleaning** - Ensure JSON cleaning handles missing commas, trailing commas, comments, and invalid characters  
3. **Multi-stage cleaning** - Apply JSON cleaning at both HTML extraction and schema parsing stages
4. **Find invalid characters** - If parser code cannot fix malformed JSON, identify the specific invalid characters or syntax errors
5. **Manual documentation fixes ONLY as last resort** - Only manually fix JSON in API documentation samples if parser-based cleaning fails
6. **Always verify with user** - Double-check any manual documentation fixes before applying them
7. **Update parser for future issues** - Enhance cleaning logic to handle similar malformed JSON patterns automatically

**Common Binance JSON Issues to Handle:**
- Missing commas before comments: `"field": "value" // comment "nextField": "value"`
- Trailing commas in arrays/objects: `["item1", "item2",]` or `{"key": "value",}`
- Comments in JSON: `// This is a comment` or `# This is also a comment`
- Invisible Unicode characters and escape sequences

### Module Isolation Principle
**NEVER modify shared code that affects existing working modules.** When adding support for new modules (like umfutures), ensure changes are isolated and do not impact existing functionality (like spot).

**Key Guidelines:**
1. **Spot module is COMPLETE** - Do not modify any code that could affect spot AsyncAPI spec generation
2. **Use inheritance and overrides** - Create specialized parsers that inherit from base classes but override specific methods
3. **Parse from documentation first** - Extract parameter types from official API documentation rather than hardcoding type mappings
4. **Module-specific implementations** - Add umfutures-specific logic only in umfutures-specific files
5. **Validate isolation** - Always test that changes don't affect existing spec generation

### Before Making Changes
1. Identify if the change affects shared code (document_parser.go, base classes)
2. If yes, create module-specific overrides instead
3. Test that existing specs remain unchanged
4. Parse actual API documentation to understand correct types and parameters
5. **CRITICAL**: Only modify parser code, never generated spec files

### WebSocket Response Detection Principle
**NEVER use hardcoded specific CSS class names for HTML parsing.** When implementing response detection logic, use general CSS class patterns and heuristics that work across different documentation formats.

**Key Guidelines:**
1. **Use general CSS patterns** - Detect method headers using general class patterns (e.g., "anchor", "sticky", "nav") rather than specific class names
2. **Implement heuristics** - Use multiple criteria to distinguish real method headers from descriptive sub-headers
3. **Avoid hardcoded specific class names** - Never check for specific CSS class names like `anchorWithStickyNavbar_fMI7`
4. **Use pattern matching for classes** - Look for class name patterns (e.g., classes containing "sticky" or "nav") instead of exact matches
5. **Test across exchanges** - Ensure detection logic works for different exchange documentation formats
6. **Document patterns** - Clearly document the heuristics used for future maintainability

**Common Method Header Patterns:**
- Method names with dots: `order.place`, `ticker.24hr`
- Method names with parentheses: `New Order (TRADE)`
- Simple single words: `allOrders`, `klines`
- Headers with anchor and navigation-related classes

**Good CSS Class Detection Patterns:**
- General class checks: `HasClass("anchor")`
- Pattern matching in class lists: `strings.Contains(classList, "sticky")`
- Multiple class combination validation: `hasAnchor && hasStickyNav`

**Anti-patterns to Avoid:**
- Hardcoded specific class checks: `HasClass("anchorWithStickyNavbar_fMI7")`
- Exchange-specific class names that break cross-exchange compatibility
- Brittle detection logic that depends on exact class name matches

## WebSocket Parser Implementation for USD-M Futures (umfutures)

### Factory Pattern for WebSocket Document Parsers

The WebSocket parser now uses a factory pattern similar to the REST parser to handle different API types:

```go
func (p *DocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedMethods []string) ([]parser.Channel, error) {
    switch urlEntity.DocType {
    case "spot":
        sp := &SpotDocumentParser{DocumentParser: p}
        return sp.Parse(r, urlEntity, protectedMethods)
    case "derivatives":
        uf := &UmfuturesDocumentParser{SpotDocumentParser: &SpotDocumentParser{DocumentParser: p}}
        return uf.Parse(r, urlEntity, protectedMethods)
    default:
        sp := &SpotDocumentParser{DocumentParser: p}
        return sp.Parse(r, urlEntity, protectedMethods)
    }
}
```

### UmfuturesDocumentParser Implementation

**Location**: `internal/exchange/binance/websocket/umfutures_document_parser.go`

The UmfuturesDocumentParser extends SpotDocumentParser and adds derivatives-specific parsing logic:

1. **Inheritance Pattern**: Inherits from SpotDocumentParser to reuse common WebSocket parsing logic
2. **Header Detection**: Handles different header patterns (h1, h2) common in derivatives documentation
3. **General Description Filtering**: Skips general documentation headers like "Introduction", "Overview", etc.
4. **Derivatives-Specific Content**: Handles API Description and Request Weight sections
5. **Method Reuse**: Leverages parent methods for extracting parameters, JSON schemas, and correlation IDs

### Generated Outputs

The implementation successfully generates:
- `specs/binance/asyncapi/umfutures.yaml` - Main AsyncAPI specification
- `specs/binance/asyncapi/umfutures/` - Individual method specifications
- Complete AsyncAPI 3.0 compliant specifications for all USD-M Futures WebSocket methods

### Testing Commands

```bash
# Generate WebSocket specs including umfutures
make generate-ws-spec EXCHANGE=binance

# Generate SDK for umfutures WebSocket API
make generate-ws-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=${PWD}/../binance-go/ws
```

### AI Assistant Development Rule: Loop Detection
**NEVER repeat the same command or action multiple times without progress.** If you find yourself stuck in a loop executing the same command repeatedly, STOP immediately and rethink your approach.

**Key Guidelines:**
1. **Recognize repetition patterns** - If you've run the same command 2-3 times with the same result, stop and analyze
2. **Change approach immediately** - Try a different command, check a different file, or ask for clarification
3. **Debug systematically** - Use different tools (LS, Read, Bash) to gather new information
4. **Break the cycle** - Step back and reconsider the problem from a different angle
5. **Ask for help** - If stuck, explain what you've tried and ask the user for guidance

**Example of breaking a loop:**
- Instead of repeating `cat go.mod` multiple times, try `pwd` to check location
- Instead of running the same npm command, check package.json or try a different approach
- Instead of reading the same file repeatedly, read a different related file

### Debugging Missing Response Fields in OpenAPI/AsyncAPI Specs
**When OpenAPI or AsyncAPI YAML specs don't have response fields parsed**, and you can't find any issues in the parser code, the root cause is often malformed JSON in the Binance API documentation. This applies to both REST (OpenAPI) and WebSocket (AsyncAPI) specifications. Follow this systematic debugging approach:

**Key Guidelines:**
1. **Suspect malformed JSON first** - If response fields are missing from generated specs, check for invalid JSON syntax in the documentation
2. **Print each JSON line for debugging** - Add debug logging to print each line of the JSON being parsed to identify syntax errors
3. **Common JSON syntax issues to check**:
   - Missing commas between fields: `"field1": "value1" "field2": "value2"` (missing comma)
   - Trailing commas in objects or arrays: `{"field": "value",}` or `["item1", "item2",]`
   - Incorrect quotes: Using single quotes `'` instead of double quotes `"`
   - Unescaped quotes inside strings: `"field": "value with "quotes" inside"`
   - Comments in JSON: `// comment` or `/* comment */` (JSON doesn't support comments)
   - Invalid escape sequences or Unicode characters

**Debugging Steps:**
```go
// For REST/OpenAPI parsers (e.g., in document_parser.go):
logrus.Debugf("Parsing JSON line %d: %s", lineNum, line)

// For WebSocket/AsyncAPI parsers (e.g., in websocket/document_parser.go):
logrus.Debugf("Parsing response JSON: %s", jsonString)

// Or temporarily add println for immediate debugging:
fmt.Printf("DEBUG: JSON line: %q\n", jsonString)
```

**Example Debug Output to Look For:**
```
DEBUG: JSON line: "{"field1": "value1" "field2": "value2"}"  // Missing comma
DEBUG: JSON line: "{"field": "value",}"                       // Trailing comma
DEBUG: JSON line: "{'field': 'value'}"                        // Wrong quotes
```

**Resolution:**
- Once you identify the malformed JSON, enhance the appropriate cleaning function:
  - For REST/OpenAPI: Update cleaning logic in `internal/exchange/binance/rest/document_parser.go`
  - For WebSocket/AsyncAPI: Update `cleanResponseLine` function in `internal/exchange/binance/websocket/document_parser.go`
- Always fix through parser code, never manually edit the documentation samples
- Add the new cleaning pattern to handle similar issues automatically in the future
- The same malformed JSON patterns often appear in both REST and WebSocket documentation

### Adding New Module Support (e.g., cmfutures for Binance)

**When adding support for a new module**, follow these systematic steps to ensure proper integration:

**Step-by-Step Process:**

1. **Add Configuration** (`configs/exchanges/binance/websocket.yaml`):
   - Group modules by the same server URL for efficient organization
   - Add `url_group` for the new module with all relevant documentation URLs
   - Include appropriate `doc_type` if it differs from default (e.g., `derivatives` for futures)
   - Example:
   ```yaml
   - type: cmfutures
     servers:
       mainnet:
         - wss://dstream.binancefuture.com/ws
       testnet:
         - wss://testnet.binancefuture.com/ws
     url_groups:
       - name: coin_futures
         description: COIN-M Futures API
         doc_type: derivatives
         urls:
           - https://developers.binance.com/docs/derivatives/coin-margined-futures/...
   ```

2. **Generate Specs with Current Parser**:
   - Run: `make generate-ws-spec EXCHANGE=binance`
   - Check if specs are generated in `specs/binance/asyncapi/{module_name}/`
   - If parser needs modifications, create module-specific parser following the factory pattern

3. **Verify Spec Content**:
   - Compare generated specs with API documentation
   - Ensure all methods, parameters, and response schemas match exactly
   - Check for missing response fields (may indicate malformed JSON in docs)
   - Validate parameter types and requirements

4. **Add Templates** (`templates/binance/asyncapi/go/`):
   - Copy existing module templates as a starting point
   - Customize for module-specific requirements
   - Ensure proper server naming and configuration

5. **Generate and Validate SDK**:
   - Run: `make generate-ws-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=${PWD}/../binance-go/ws`
   - Check for compilation errors
   - Verify SDK content matches spec definitions
   - Test authentication methods if applicable

**Important Considerations:**
- Always check if existing parsers can handle the new module before creating custom ones
- Group modules with the same server URL to avoid duplication
- Ensure `doc_type` is set correctly for specialized parsing (e.g., `derivatives`)
- Test thoroughly to ensure no impact on existing modules

### Systematic Documentation Review Principle
**ALWAYS follow a systematic approach when reviewing multiple API documentation URLs to ensure complete accuracy and coverage.** When creating or updating AsyncAPI/OpenAPI specifications from documentation sources, follow this disciplined process:

**Key Guidelines:**
1. **Create a TODO.md tracking file** - List all documentation URLs with status tracking (❌ Not reviewed, 🔄 In progress, ✅ Completed and implemented)
2. **Review documents sequentially** - Start with document #1 and proceed systematically through each URL
3. **Extract complete information** - For each document, gather all details including:
   - Exact stream patterns and naming conventions
   - Complete response structures with ALL fields and data types
   - Update frequencies and timing information
   - Field descriptions with actual examples
   - Any special characteristics or limitations
4. **Update specification files immediately** - After reviewing each document, update the relevant YAML specification file with accurate information
5. **Mark as completed only after implementation** - Only mark documents as ✅ in TODO.md after the information has been properly implemented in the specification file
6. **Use actual examples from documentation** - Replace generic examples with real examples from the official documentation
7. **Verify field accuracy** - Ensure all field names, types, and constraints match the official documentation exactly

**Systematic Review Process:**
```bash
# 1. Create TODO.md with all documentation URLs
# 2. For each document:
WebFetch(url) -> Extract complete details -> Update YAML spec -> Mark as completed in TODO.md
# 3. Continue until all documents are ✅ completed
```

**Example TODO.md Structure:**
```markdown
# API Documentation Review

## Status Legend
- ❌ Not reviewed
- 🔄 In progress  
- ✅ Completed and implemented in {spec-file}.yaml

## Documentation URLs to Review

1. ❌ **Document Name**
   - URL: https://example.com/docs/...
   - Status: Not reviewed
   - Notes: Need to extract specific information

2. ✅ **Document Name**
   - URL: https://example.com/docs/...
   - Status: Completed and implemented in spec.yaml
   - Notes: ✅ All details verified and implemented
```

**Quality Checks:**
- Verify all field names match official documentation exactly
- Ensure data types and formats are correct
- Update examples to use real values from documentation
- Check that all stream patterns and naming conventions are accurate
- Validate that update frequencies and timing information is correct

**Anti-patterns to Avoid:**
- Skipping documents or reviewing out of order
- Marking documents as complete before implementing in YAML
- Using generic examples instead of real documentation examples
- Making assumptions about field names or types without verification
- Incomplete extraction of information from documentation sources

This guide provides the essential context for understanding and contributing to the OpenXAPI project. For specific implementation details, refer to the source code and existing tests. 