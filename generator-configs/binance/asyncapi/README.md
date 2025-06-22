# AsyncAPI Generator Configurations

This directory contains dedicated generator configuration files for different modules (spot, futures, etc.) that override the default generator configuration in `templates/binance/asyncapi/go/package.json`.

## How It Works

1. **Default Configuration**: The base generator configuration is defined in `templates/binance/asyncapi/go/package.json`
2. **Module-Specific Overrides**: If a dedicated config file exists for a module (e.g., `go/spot.json`), it will override/extend the base configuration
3. **Automatic Detection**: The build system automatically detects and uses dedicated configs when available

## Usage

### Using the Makefile

```bash
# Generate WebSocket SDK for all modules
make generate-ws-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=./output

# The Makefile will automatically:
# 1. Check if generator-configs/binance/asyncapi/go/[module].json exists
# 2. If yes, use the dedicated config for that module
# 3. If no, use the default template configuration
```

### Using npm scripts directly

```bash
cd templates/binance/asyncapi/go

# Generate with spot-specific configuration
MODULE=spot npm run generate:module

# Generate with futures-specific configuration  
MODULE=futures npm run generate:module

# Test with module-specific configuration
MODULE=spot npm run test:module
MODULE=futures npm run test:module
```

## Configuration File Format

Each module config file should contain a JSON object with a `generator` property that follows the AsyncAPI generator configuration schema:

```json
{
  "generator": {
    "renderer": "react",
    "apiVersion": "v3", 
    "generator": ">=1.10.0 <2.0.0",
    "supportedProtocols": ["ws", "wss"],
    "parameters": {
      "server": {
        "description": "The server you want to use in the code.",
        "required": true
      },
      "moduleName": {
        "description": "The Go module name for the generated client.",
        "required": true,
        "default": "binance-spot-websocket-client"
      },
      "packageName": {
        "description": "The Go package name for the generated client.", 
        "required": false,
        "default": "spot"
      },
      "enableSpotSpecificFeatures": {
        "description": "Enable spot trading specific features.",
        "required": false,
        "default": true
      }
    }
  }
}
```

## Available Modules

- **spot**: Spot trading WebSocket client
- **futures**: Futures trading WebSocket client (with leverage support)

## Adding New Modules

1. Create a new config file: `generator-configs/binance/asyncapi/go/[module-name].json`
2. Define module-specific parameters and defaults
3. The build system will automatically use the dedicated config when generating that module

## Configuration Merging

The system uses deep merging to combine configurations:

1. **Base Configuration**: From `templates/binance/asyncapi/go/package.json`
2. **Module Configuration**: From `generator-configs/binance/asyncapi/go/[module].json`
3. **Merged Result**: Module config overrides/extends base config

## Environment Variables

You can still override parameters using environment variables:

```bash
# Override module name for spot
MODULE=spot MODULE_NAME=my-custom-spot-client npm run generate:module

# Override package name for futures
MODULE=futures PACKAGE_NAME=my-futures-pkg npm run generate:module
```

## Utilities  

### merge-config.js

The `templates/binance/asyncapi/go/merge-config.js` utility script handles configuration merging:

```bash
# View merged config for spot module
node templates/binance/asyncapi/go/merge-config.js spot

# View base config (no merging)
node templates/binance/asyncapi/go/merge-config.js
``` 