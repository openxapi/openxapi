package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/openxapi/openxapi/internal/config"
	binanceRest "github.com/openxapi/openxapi/internal/exchange/binance/rest"
	binanceWs "github.com/openxapi/openxapi/internal/exchange/binance/websocket"
	okxRest "github.com/openxapi/openxapi/internal/exchange/okx/rest"
	okxWs "github.com/openxapi/openxapi/internal/exchange/okx/websocket"
	"github.com/openxapi/openxapi/internal/generator"
	restParser "github.com/openxapi/openxapi/internal/parser/rest"
	wsParser "github.com/openxapi/openxapi/internal/parser/websocket"
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
	logLevelExplicit bool // Track if log-level was explicitly set via command line
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
	flag.BoolVar(&useSamples, "use-samples", true, "Use sample files instead of making HTTP requests")
	flag.StringVar(&samplesDir, "samples-dir", "", "Directory for sample files (default: samples/<exchange>)")
	flag.StringVar(&exchange, "exchange", "", "Filter by exchange name")
	flag.StringVar(&docType, "doc-type", "", "Filter by documentation type")
	flag.Var(&specTypes, "spec-type", "Filter by specification types (rest, ws)")
	flag.StringVar(&outputDir, "output-dir", "./specs", "Output directory")
	flag.BoolVar(&showHelp, "h,help", false, "Show help")
}

func main() {
	flag.Parse()

	// Track if log-level was explicitly set
	flag.Visit(func(f *flag.Flag) {
		if f.Name == "log-level" {
			logLevelExplicit = true
		}
	})

	if showHelp {
		flag.Usage()
		os.Exit(0)
	}

	// Read configuration first to get default settings
	config, err := config.LoadConfig(configFile)
	if err != nil {
		logrus.Fatalf("Failed to load configuration: %v", err)
	}

	// Setup logging - use command line argument if explicitly provided, otherwise use config file setting
	effectiveLogLevel := logLevel

	// If log-level was not explicitly set via command line and config has a setting, use config
	if !logLevelExplicit && config.Settings.LogLevel != "" {
		effectiveLogLevel = config.Settings.LogLevel
	}

	level, err := logrus.ParseLevel(effectiveLogLevel)
	if err != nil {
		fmt.Printf("Invalid log level: %v\n", err)
		os.Exit(1)
	}
	logrus.SetLevel(level)

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
	if specTypes == nil || slices.Contains(specTypes, "rest") {
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
			exchangeSamplesDir = fmt.Sprintf("%s/rest", exchangeSamplesDir)

			// Create exchange-specific parser
			var p restParser.Parser
			switch exchangeName {
			case "binance":
				if useSamples {
					p = binanceRest.NewParser(binanceRest.WithSamples(useSamples), binanceRest.WithSamplesDir(exchangeSamplesDir))
					logrus.Infof("Using sample files from %s", exchangeSamplesDir)
				} else {
					p = binanceRest.NewParser()
				}
			case "okx":
				if useSamples {
					p = okxRest.NewParser(okxRest.WithSamples(useSamples), okxRest.WithSamplesDir(exchangeSamplesDir))
					logrus.Infof("Using sample files from %s", exchangeSamplesDir)
				} else {
					p = okxRest.NewParser()
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
				parserDoc := restParser.Documentation{
					Documentation: doc,
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
	}

	if specTypes == nil || slices.Contains(specTypes, "ws") {
		for exchangeName, asyncConfig := range config.AsyncConfigs {
			// Skip if exchange filter is set and doesn't match
			if exchange != "" && exchange != exchangeName {
				continue
			}

			logrus.Infof("Processing WebSocket exchange: %s", exchangeName)

			exchangeSamplesDir := samplesDir
			if exchangeSamplesDir == "" {
				exchangeSamplesDir = fmt.Sprintf("samples/%s", exchangeName)
			}
			exchangeSamplesDir = fmt.Sprintf("%s/websocket", exchangeSamplesDir)

			// Create exchange-specific WebSocket parser
			var wsP wsParser.Parser
			switch exchangeName {
			case "binance":
				if useSamples {
					wsP = binanceWs.NewParser(binanceWs.WithSamples(useSamples), binanceWs.WithSamplesDir(exchangeSamplesDir))
					logrus.Infof("Using WebSocket sample files from %s", exchangeSamplesDir)
				} else {
					wsP = binanceWs.NewParser()
				}
			case "okx":
				if useSamples {
					wsP = okxWs.NewParser(okxWs.WithSamples(useSamples), okxWs.WithSamplesDir(exchangeSamplesDir))
					logrus.Infof("Using WebSocket sample files from %s", exchangeSamplesDir)
				} else {
					wsP = okxWs.NewParser()
				}
			default:
				logrus.Warnf("Unsupported WebSocket exchange: %s", exchangeName)
				continue
			}

			// Process each WebSocket API type
			for _, doc := range asyncConfig.Docs {
				// Skip if doc type filter is set and doesn't match
				if docType != "" && docType != doc.Type {
					continue
				}

				logrus.Infof("Processing WebSocket API type: %s", doc.Type)

				// Convert config Documentation to parser.Documentation
				parserDoc := wsParser.Documentation{
					AsyncDocumentation: doc,
				}

				// Parse WebSocket endpoints
				endpoints, err := wsP.Parse(ctx, parserDoc)
				if err != nil {
					logrus.Errorf("Failed to parse %s %s WebSocket API: %v", exchangeName, doc.Type, err)
					os.Exit(1)
				}

				// Generate WebSocket OpenAPI specification for each endpoint
				if err := gen.GenerateWebSocketEndpoints(exchangeName, asyncConfig.Version, doc.Type, endpoints); err != nil {
					logrus.Errorf("Failed to generate WebSocket OpenAPI endpoint specs for %s %s API: %v", exchangeName, doc.Type, err)
					os.Exit(1)
				}

				// Generate WebSocket OpenAPI specification
				if err := gen.GenerateWebSocket(exchangeName, asyncConfig.Version, doc.Description, doc.Type, doc.Servers); err != nil {
					logrus.Errorf("Failed to generate WebSocket OpenAPI spec for %s %s API: %v", exchangeName, doc.Type, err)
					os.Exit(1)
				}

				logrus.Infof("Successfully generated WebSocket OpenAPI spec for %s %s API", exchangeName, doc.Type)
			}
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
