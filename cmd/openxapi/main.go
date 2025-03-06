package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"
	"gopkg.in/yaml.v3"
)

var (
	configFile string
	logLevel   string
)

func init() {
	flag.StringVar(&configFile, "config", "configs/exchanges.yaml", "Path to configuration file")
	flag.StringVar(&logLevel, "log-level", "info", "Logging level (debug, info, warn, error)")
}

type Config struct {
	Exchanges map[string]Exchange `yaml:"exchanges"`
	Settings  Settings           `yaml:"settings"`
}

type Exchange struct {
	Name        string            `yaml:"name"`
	Description string            `yaml:"description"`
	Docs        []Documentation   `yaml:"docs"`
	VersionCheck VersionCheck     `yaml:"version_check"`
	BaseURLs    map[string]string `yaml:"base_urls"`
}

type Documentation struct {
	URL    string `yaml:"url"`
	Type   string `yaml:"type"`
	Format string `yaml:"format"`
}

type VersionCheck struct {
	Selector string `yaml:"selector"`
}

type Settings struct {
	UpdateInterval string `yaml:"update_interval"`
	OutputDir     string `yaml:"output_dir"`
	HistoryDir    string `yaml:"history_dir"`
	LogLevel      string `yaml:"log_level"`
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

	// TODO: Implement main logic
	logrus.Info("OpenXAPI started")
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
