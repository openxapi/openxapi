package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/adshao/openxapi/internal/config"
	"github.com/adshao/openxapi/internal/exchange/binance"
	"github.com/adshao/openxapi/internal/generator"
	"github.com/adshao/openxapi/internal/parser"
	"github.com/sirupsen/logrus"
)

var (
	configFile   string
	logLevel     string
	useSamples   bool
	samplesDir   string
	exchangeFlag string
	docType      string
)

func init() {
	flag.StringVar(&configFile, "config", "configs/config.yaml", "Path to configuration file")
	flag.StringVar(&logLevel, "log-level", "info", "Logging level (debug, info, warn, error)")
	flag.BoolVar(&useSamples, "use-samples", false, "Use sample files instead of making HTTP requests")
	flag.StringVar(&samplesDir, "samples-dir", "", "Directory for sample files (default: samples/webpage/<exchange>)")
	flag.StringVar(&exchangeFlag, "exchange", "", "Filter by exchange name")
	flag.StringVar(&docType, "doc-type", "", "Filter by documentation type")
}

func main() {
	flag.Parse()

	// Setup logging
	level, err := logrus.ParseLevel(logLevel)
	if err != nil {
		fmt.Printf("Invalid log level: %v\n", err)
		os.Exit(1)
	}
	logrus.SetLevel(level)

	// Read configuration
	config, err := config.LoadConfig(configFile)
	if err != nil {
		logrus.Fatalf("Failed to load configuration: %v", err)
	}

	// Create necessary directories
	if err := createDirectories(config.Settings); err != nil {
		logrus.Fatalf("Failed to create directories: %v", err)
	}

	// Create OpenAPI generator
	gen := generator.NewGenerator(config.Settings.OutputDir)

	// Process each exchange
	ctx := context.Background()
	for exchangeName, exchange := range config.Exchanges {
		// Skip if exchange filter is set and doesn't match
		if exchangeFlag != "" && exchangeFlag != exchangeName {
			continue
		}

		logrus.Infof("Processing exchange: %s", exchangeName)

		exchangeSamplesDir := samplesDir
		if exchangeSamplesDir == "" {
			exchangeSamplesDir = fmt.Sprintf("samples/webpage/%s", exchangeName)
		}

		// Create exchange-specific parser
		var p parser.Parser
		switch exchangeName {
		case "binance":
			if useSamples {
				p = binance.NewParserWithOptions(useSamples, exchangeSamplesDir)
				logrus.Infof("Using sample files from %s", exchangeSamplesDir)
			} else {
				p = binance.NewParser()
			}
		default:
			logrus.Warnf("Unsupported exchange: %s", exchangeName)
			continue
		}

		// Process each API type
		for _, doc := range exchange.Docs {
			// Skip if doc type filter is set and doesn't match
			if docType != "" && docType != doc.Type {
				continue
			}

			logrus.Infof("Processing API type: %s", doc.Type)

			// Convert config Documentation to parser.Documentation
			parserDoc := parser.Documentation{
				Type:               doc.Type,
				URLs:               doc.URLs,
				ProtectedEndpoints: doc.ProtectedEndpoints,
			}

			// Parse endpoints
			endpoints, err := p.Parse(ctx, parserDoc)
			if err != nil {
				logrus.Errorf("Failed to parse %s %s API: %v", exchangeName, doc.Type, err)
				continue
			}

			// Generate OpenAPI specification for each endpoint
			if err := gen.GenerateEndpoints(exchangeName, exchange.Version, doc.Type, endpoints); err != nil {
				logrus.Errorf("Failed to generate OpenAPI endpoint specs for %s %s API: %v", exchangeName, doc.Type, err)
				continue
			}

			// Generate OpenAPI specification
			if err := gen.Generate(exchangeName, exchange.Version, doc.Type, doc.Servers); err != nil {
				logrus.Errorf("Failed to generate OpenAPI spec for %s %s API: %v", exchangeName, doc.Type, err)
				continue
			}

			logrus.Infof("Successfully generated OpenAPI spec for %s %s API", exchangeName, doc.Type)
		}
	}

	logrus.Info("OpenXAPI completed")
}

func createDirectories(settings config.Settings) error {
	dirs := []string{settings.OutputDir, settings.HistoryDir}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("creating directory %s: %w", dir, err)
		}
	}
	return nil
}
