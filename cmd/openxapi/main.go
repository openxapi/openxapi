package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/openxapi/openxapi/internal/config"
	"github.com/openxapi/openxapi/internal/exchange/binance"
	"github.com/openxapi/openxapi/internal/generator"
	"github.com/openxapi/openxapi/internal/parser"
	"github.com/sirupsen/logrus"
)

var (
	configFile string
	logLevel   string
	useSamples bool
	samplesDir string
	exchange   string
	docType    string
	specTypes  stringsFlag
	showHelp   bool
	outputDir  string
)

type stringsFlag []string

func (s *stringsFlag) String() string {
	return strings.Join(*s, ", ")
}

func (s *stringsFlag) Set(value string) error {
	*s = append(*s, value)
	return nil
}

func init() {
	flag.StringVar(&configFile, "config", "configs/config.yaml", "Path to configuration file")
	flag.StringVar(&logLevel, "log-level", "info", "Logging level (debug, info, warn, error)")
	flag.BoolVar(&useSamples, "use-samples", false, "Use sample files instead of making HTTP requests")
	flag.StringVar(&samplesDir, "samples-dir", "", "Directory for sample files (default: samples/<exchange>)")
	flag.StringVar(&exchange, "exchange", "", "Filter by exchange name")
	flag.StringVar(&docType, "doc-type", "", "Filter by documentation type")
	flag.Var(&specTypes, "spec-types", "Filter by specification types")
	flag.StringVar(&outputDir, "output-dir", "./specs", "Output directory")
	flag.BoolVar(&showHelp, "h,help", false, "Show help")
}

func main() {
	flag.Parse()

	if showHelp {
		flag.Usage()
		os.Exit(0)
	}

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
	if outputDir == "" {
		outputDir = config.Settings.OutputDir
	}
	gen := generator.NewGenerator(outputDir)

	// Process each exchange
	ctx := context.Background()
	for exchangeName, restConfig := range config.RestConfigs {
		// Skip if exchange filter is set and doesn't match
		if exchange != "" && exchange != exchangeName {
			continue
		}

		logrus.Infof("Processing exchange: %s", exchangeName)

		exchangeSamplesDir := samplesDir
		if exchangeSamplesDir == "" {
			exchangeSamplesDir = fmt.Sprintf("samples/%s", exchangeName)
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
		for _, doc := range restConfig.Docs {
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
				os.Exit(1)
			}

			// Generate OpenAPI specification for each endpoint
			if err := gen.GenerateEndpoints(exchangeName, restConfig.Version, doc.Type, endpoints); err != nil {
				logrus.Errorf("Failed to generate OpenAPI endpoint specs for %s %s API: %v", exchangeName, doc.Type, err)
				os.Exit(1)
			}

			// Generate OpenAPI specification
			if err := gen.Generate(exchangeName, restConfig.Version, doc.Description, doc.Type, doc.Servers); err != nil {
				logrus.Errorf("Failed to generate OpenAPI spec for %s %s API: %v", exchangeName, doc.Type, err)
				os.Exit(1)
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
