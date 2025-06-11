package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"
	"gopkg.in/yaml.v3"
)

type Config struct {
	ExchangeDir  string                 `yaml:"exchange_dir"`
	Settings     Settings               `yaml:"settings"`
	RestConfigs  map[string]RestConfig  `yaml:"rest_configs"`
	AsyncConfigs map[string]AsyncConfig `yaml:"async_configs"`
}

type RestConfig struct {
	Name        string          `yaml:"name"`
	Version     string          `yaml:"version"`
	Description string          `yaml:"description"`
	Docs        []Documentation `yaml:"docs"`
}

type AsyncConfig struct {
	Name        string               `yaml:"name"`
	Version     string               `yaml:"version"`
	Description string               `yaml:"description"`
	Docs        []AsyncDocumentation `yaml:"docs"`
}

type Documentation struct {
	Type               string     `yaml:"type"`
	Description        string     `yaml:"description"`
	Servers            []string   `yaml:"servers"`
	URLGroups          []URLGroup `yaml:"url_groups"`
	ProtectedEndpoints []string   `yaml:"protected_endpoints"`
}

type AsyncDocumentation struct {
	Type             string     `yaml:"type"`
	Description      string     `yaml:"description"`
	Servers          []string   `yaml:"servers"`
	URLGroups        []URLGroup `yaml:"url_groups"`
	ProtectedMethods []string   `yaml:"protected_methods"`
}

// URLGroup is a group of URLs that are parsed by the same parser
type URLGroup struct {
	Name         string    `yaml:"name"`
	Description  string    `yaml:"description"`
	URLs         []URLItem `yaml:"-"` // Custom unmarshaling
	DocType      string    `yaml:"doc_type"`
	SecurityType string    `yaml:"security_type"`
}

// URLItem represents either a string URL or a URLEntity
type URLItem struct {
	StringURL string
	Entity    *URLEntity
}

// URL returns the URL of the URLItem
func (u URLItem) URL() string {
	if u.Entity != nil {
		return u.Entity.URL
	}
	return u.StringURL
}

// UnmarshalYAML implements custom unmarshaling for URLGroup
func (g *URLGroup) UnmarshalYAML(value *yaml.Node) error {
	// Create a temporary struct to unmarshal the main fields
	type URLGroupTemp struct {
		Name         string    `yaml:"name"`
		Description  string    `yaml:"description"`
		URLs         yaml.Node `yaml:"urls"`
		DocType      string    `yaml:"doc_type"`
		SecurityType string    `yaml:"security_type"`
	}

	var temp URLGroupTemp
	if err := value.Decode(&temp); err != nil {
		return err
	}

	// Copy the simple fields
	g.Name = temp.Name
	g.Description = temp.Description
	g.DocType = temp.DocType
	g.SecurityType = temp.SecurityType

	// Handle the URLs field based on its type
	if temp.URLs.Kind == yaml.SequenceNode {
		for _, item := range temp.URLs.Content {
			switch item.Kind {
			case yaml.ScalarNode:
				// It's a simple string URL
				var url string
				if err := item.Decode(&url); err != nil {
					return err
				}
				g.URLs = append(g.URLs, URLItem{StringURL: url})
			case yaml.MappingNode:
				// It's a URLEntity
				var entity URLEntity
				if err := item.Decode(&entity); err != nil {
					return err
				}
				g.URLs = append(g.URLs, URLItem{Entity: &entity})
			default:
				return fmt.Errorf("unexpected node kind in URLs: %v", item.Kind)
			}
		}
	}

	return nil
}

// MarshalYAML implements custom marshaling for URLGroup
func (g URLGroup) MarshalYAML() (interface{}, error) {
	// Create a temporary struct that includes all fields except URLs
	type URLGroupTemp struct {
		Name         string      `yaml:"name"`
		Description  string      `yaml:"description"`
		URLs         interface{} `yaml:"urls"`
		DocType      string      `yaml:"doc_type"`
		SecurityType string      `yaml:"security_type"`
	}

	temp := URLGroupTemp{
		Name:         g.Name,
		Description:  g.Description,
		DocType:      g.DocType,
		SecurityType: g.SecurityType,
	}

	// Convert URLs to a slice of interfaces
	urls := make([]interface{}, len(g.URLs))
	for i, item := range g.URLs {
		if item.Entity != nil {
			urls[i] = item.Entity
		} else {
			urls[i] = item.StringURL
		}
	}
	temp.URLs = urls

	return temp, nil
}

type URLEntity struct {
	GroupName    string `yaml:"group_name"`
	URL          string `yaml:"url"`
	DocType      string `yaml:"doc_type"`
	SecurityType string `yaml:"security_type"`
	Protected    bool   `yaml:"protected"`
	OperationID  string `yaml:"operation_id"`
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
	config.RestConfigs, config.AsyncConfigs, err = loadRestConfigs(path, config.ExchangeDir)
	if err != nil {
		return nil, fmt.Errorf("loading rest configs: %w", err)
	}

	return &config, nil
}

func loadRestConfigs(path, dir string) (map[string]RestConfig, map[string]AsyncConfig, error) {
	if dir == "" {
		return nil, nil, fmt.Errorf("exchange directory is not set")
	}
	// If ExchangeDir is relative, join it with the base directory of the absolute path of the config file
	if !filepath.IsAbs(dir) {
		absPath, err := filepath.Abs(path)
		if err != nil {
			return nil, nil, fmt.Errorf("converting exchange directory to absolute path: %w", err)
		}
		dir, err = filepath.Abs(filepath.Join(filepath.Dir(absPath), dir))
		if err != nil {
			return nil, nil, fmt.Errorf("joining exchange directory to absolute path: %w", err)
		}
	}
	logrus.Debugf("ExchangeDir: %s", dir)

	restConfigs := make(map[string]RestConfig)
	asyncConfigs := make(map[string]AsyncConfig)
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, nil, fmt.Errorf("reading exchange directory: %w", err)
	}

	for _, file := range files {
		if file.IsDir() {
			logrus.Debugf("Loading exchange: %s", file.Name())
			fpath := filepath.Join(dir, file.Name())
			configFiles, err := os.ReadDir(fpath)
			if err != nil {
				return nil, nil, fmt.Errorf("reading exchange directory: %w", err)
			}
			for _, configFile := range configFiles {
				if configFile.IsDir() {
					continue
				}
				// Currently only support rest.yaml and websocket.yaml
				if configFile.Name() == "rest.yaml" {
					// Read the file into Exchange struct
					var restConfig RestConfig
					data, err := os.ReadFile(filepath.Join(fpath, configFile.Name()))
					if err != nil {
						return nil, nil, fmt.Errorf("reading exchange file: %w", err)
					}
					if err := yaml.Unmarshal(data, &restConfig); err != nil {
						return nil, nil, fmt.Errorf("parsing exchange file: %w", err)
					}
					restConfigs[file.Name()] = restConfig
				}
				if configFile.Name() == "websocket.yaml" {
					// Read the file into Exchange struct
					var asyncConfig AsyncConfig
					data, err := os.ReadFile(filepath.Join(fpath, configFile.Name()))
					if err != nil {
						return nil, nil, fmt.Errorf("reading exchange file: %w", err)
					}
					if err := yaml.Unmarshal(data, &asyncConfig); err != nil {
						return nil, nil, fmt.Errorf("parsing exchange file: %w", err)
					}
					asyncConfigs[file.Name()] = asyncConfig
				}
			}
		}
	}

	return restConfigs, asyncConfigs, nil
}
