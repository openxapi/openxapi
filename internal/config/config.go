package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sirupsen/logrus"
	"gopkg.in/yaml.v3"
)

type Config struct {
	ExchangeDir string              `yaml:"exchange_dir"`
	Settings    Settings            `yaml:"settings"`
	Exchanges   map[string]Exchange `yaml:"exchanges"`
}

type Exchange struct {
	Name        string          `yaml:"name"`
	Version     string          `yaml:"version"`
	Description string          `yaml:"description"`
	Docs        []Documentation `yaml:"docs"`
}

type Documentation struct {
	Type               string   `yaml:"type"`
	Servers            []string `yaml:"servers"`
	URLs               []string `yaml:"urls"`
	ProtectedEndpoints []string `yaml:"protected_endpoints"`
}

type Settings struct {
	UpdateInterval string `yaml:"update_interval"`
	OutputDir      string `yaml:"output_dir"`
	HistoryDir     string `yaml:"history_dir"`
	LogLevel       string `yaml:"log_level"`
}

// LoadConfig loads the configuration from a YAML file
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config file: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("parsing config file: %w", err)
	}

	// Load exchanges from the exchange directory
	config.Exchanges, err = loadExchanges(path, config.ExchangeDir)
	if err != nil {
		return nil, fmt.Errorf("loading exchanges: %w", err)
	}

	return &config, nil
}

func loadExchanges(path, dir string) (map[string]Exchange, error) {
	if dir == "" {
		return nil, fmt.Errorf("exchange directory is not set")
	}
	// If ExchangeDir is relative, join it with the base directory of the absolute path of the config file
	if !filepath.IsAbs(dir) {
		absPath, err := filepath.Abs(path)
		if err != nil {
			return nil, fmt.Errorf("converting exchange directory to absolute path: %w", err)
		}
		dir, err = filepath.Abs(filepath.Join(filepath.Dir(absPath), dir))
		if err != nil {
			return nil, fmt.Errorf("joining exchange directory to absolute path: %w", err)
		}
	}
	logrus.Debugf("ExchangeDir: %s", dir)

	exchanges := make(map[string]Exchange)
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("reading exchange directory: %w", err)
	}

	for _, file := range files {
		if !file.IsDir() {
			logrus.Debugf("Loading exchange: %s", file.Name())
			fpath := filepath.Join(dir, file.Name())
			// Read the file into Exchange struct
			var exchange Exchange
			data, err := os.ReadFile(fpath)
			if err != nil {
				return nil, fmt.Errorf("reading exchange file: %w", err)
			}
			if err := yaml.Unmarshal(data, &exchange); err != nil {
				return nil, fmt.Errorf("parsing exchange file: %w", err)
			}
			name := strings.Split(file.Name(), ".")[0]
			exchanges[name] = exchange
		}
	}

	return exchanges, nil
}
