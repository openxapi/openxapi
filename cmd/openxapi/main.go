package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/adshao/openxapi/internal/exchange/binance"
	"github.com/adshao/openxapi/internal/generator"
	"github.com/adshao/openxapi/internal/parser"
	"github.com/sirupsen/logrus"
	yaml "gopkg.in/yaml.v3"
)

var (
	configFile string
	logLevel   string
	useSamples bool
	samplesDir string
)

func init() {
	flag.StringVar(&configFile, "config", "configs/config.yaml", "Path to configuration file")
	flag.StringVar(&logLevel, "log-level", "info", "Logging level (debug, info, warn, error)")
	flag.BoolVar(&useSamples, "use-samples", false, "Use sample files instead of making HTTP requests")
	flag.StringVar(&samplesDir, "samples-dir", "", "Directory for sample files (default: samples/webpage/<exchange>)")
}

type Config struct {
	Exchanges map[string]Exchange `yaml:"exchanges"`
	Settings  Settings            `yaml:"settings"`
}

type Exchange struct {
	Name        string            `yaml:"name"`
	Version     string            `yaml:"version"`
	Description string            `yaml:"description"`
	Docs        []Documentation   `yaml:"docs"`
	BaseURLs    map[string]string `yaml:"base_urls"`
}

type Documentation struct {
	Type string   `yaml:"type"`
	URLs []string `yaml:"urls"`
}

type Settings struct {
	UpdateInterval string `yaml:"update_interval"`
	OutputDir      string `yaml:"output_dir"`
	HistoryDir     string `yaml:"history_dir"`
	LogLevel       string `yaml:"log_level"`
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
	config, err := loadConfig(configFile)
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
			logrus.Infof("Processing API type: %s", doc.Type)

			// Convert config Documentation to parser.Documentation
			parserDoc := parser.Documentation{
				Type: doc.Type,
				URLs: doc.URLs,
			}

			// Parse endpoints
			endpoints, err := p.Parse(ctx, parserDoc)
			if err != nil {
				logrus.Errorf("Failed to parse %s %s API: %v", exchangeName, doc.Type, err)
				continue
			}

			// Get base URL for this API type
			baseURL, ok := exchange.BaseURLs[doc.Type]
			if !ok {
				logrus.Errorf("No base URL found for %s %s API", exchangeName, doc.Type)
				continue
			}

			// Generate OpenAPI specification
			if err := gen.Generate(exchangeName, exchange.Version, doc.Type, endpoints, baseURL); err != nil {
				logrus.Errorf("Failed to generate OpenAPI spec for %s %s API: %v", exchangeName, doc.Type, err)
				continue
			}

			logrus.Infof("Successfully generated OpenAPI spec for %s %s API", exchangeName, doc.Type)
		}
	}

	logrus.Info("OpenXAPI completed")
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config file: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("parsing config file: %w", err)
	}

	return &config, nil
}

func createDirectories(settings Settings) error {
	dirs := []string{settings.OutputDir, settings.HistoryDir}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("creating directory %s: %w", dir, err)
		}
	}
	return nil
}
