package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"
	"gopkg.in/yaml.v3"
)

type Config struct {
	ExchangeDir string                `yaml:"exchange_dir"`
	Settings    Settings              `yaml:"settings"`
	RestConfigs map[string]RestConfig `yaml:"rest_configs"`
}

type RestConfig struct {
	Name        string          `yaml:"name"`
	Version     string          `yaml:"version"`
	Description string          `yaml:"description"`
	Docs        []Documentation `yaml:"docs"`
}

type Documentation struct {
	Type               string   `yaml:"type"`
	Description        string   `yaml:"description"`
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
	config.RestConfigs, err = loadRestConfigs(path, config.ExchangeDir)
	if err != nil {
		return nil, fmt.Errorf("loading rest configs: %w", err)
	}

	return &config, nil
}

func loadRestConfigs(path, dir string) (map[string]RestConfig, error) {
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

	restConfigs := make(map[string]RestConfig)
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("reading exchange directory: %w", err)
	}

	for _, file := range files {
		if file.IsDir() {
			logrus.Debugf("Loading exchange: %s", file.Name())
			fpath := filepath.Join(dir, file.Name())
			configFiles, err := os.ReadDir(fpath)
			if err != nil {
				return nil, fmt.Errorf("reading exchange directory: %w", err)
			}
			for _, configFile := range configFiles {
				if configFile.IsDir() {
					continue
				}
				// Currently only support restapi.yaml
				if configFile.Name() != "restapi.yaml" {
					continue
				}
				// Read the file into Exchange struct
				var restConfig RestConfig
				data, err := os.ReadFile(filepath.Join(fpath, configFile.Name()))
				if err != nil {
					return nil, fmt.Errorf("reading exchange file: %w", err)
				}
				if err := yaml.Unmarshal(data, &restConfig); err != nil {
					return nil, fmt.Errorf("parsing exchange file: %w", err)
				}
				restConfigs[file.Name()] = restConfig
			}
		}
	}

	return restConfigs, nil
}
