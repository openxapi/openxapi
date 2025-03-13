package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Exchanges map[string]Exchange `yaml:"exchanges"`
	Settings  Settings            `yaml:"settings"`
}

type Exchange struct {
	Name        string            `yaml:"name"`
	Version     string            `yaml:"version"`
	Description string            `yaml:"description"`
	Docs        []Documentation   `yaml:"docs"`
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

	return &config, nil
}
