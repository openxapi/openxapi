//go:build ignore

package wstest

import (
	"context"
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	spotws "github.com/openxapi/binance-go/ws/spot"
	"github.com/openxapi/binance-go/ws/spot/models"
)

// TestResult holds the result of a single test
type TestResult struct {
	TestName    string
	Success     bool
	Error       error
	Duration    time.Duration
	RateLimit   *RateLimitInfo
	Description string
}

// RateLimitInfo holds rate limit information from responses
type RateLimitInfo struct {
	Weight    int
	Remaining int
	ResetTime time.Time
}

// TestSuite manages all test execution
type TestSuite struct {
	results   []TestResult
	mutex     sync.Mutex
	startTime time.Time
	rateLimit *RateLimitManager
}

// SharedClientManager manages shared WebSocket clients across tests
type SharedClientManager struct {
	clients   map[string]*spotws.Client
	mutex     sync.RWMutex
	cleanupFn func()
}

var (
	sharedClients *SharedClientManager
	once          sync.Once
)

// RateLimitManager helps manage API call frequency
type RateLimitManager struct {
	lastCall    time.Time
	callCount   int
	mutex       sync.Mutex
	minInterval time.Duration
}

// KeyType represents different authentication key types
type KeyType int

const (
	KeyTypeHMAC KeyType = iota
	KeyTypeRSA
	KeyTypeED25519
)

func (k KeyType) String() string {
	switch k {
	case KeyTypeHMAC:
		return "HMAC"
	case KeyTypeRSA:
		return "RSA"
	case KeyTypeED25519:
		return "Ed25519"
	default:
		return "Unknown"
	}
}

// AuthType represents different authorization levels
type AuthType int

const (
	AuthTypeNONE AuthType = iota
	AuthTypeUSER_DATA
	AuthTypeUSER_STREAM
	AuthTypeTRADE
)

func (a AuthType) String() string {
	switch a {
	case AuthTypeNONE:
		return "NONE"
	case AuthTypeUSER_DATA:
		return "USER_DATA"
	case AuthTypeUSER_STREAM:
		return "USER_STREAM"
	case AuthTypeTRADE:
		return "TRADE"
	default:
		return "Unknown"
	}
}

// TestConfig holds configuration for different test scenarios
type TestConfig struct {
	Name        string
	KeyType     KeyType
	AuthType    AuthType
	APIKey      string
	SecretKey   string
	PrivateKey  string
	Description string
}

// Global test suite instance
var testSuite *TestSuite

func init() {
	testSuite = &TestSuite{
		results:   make([]TestResult, 0),
		startTime: time.Now(),
		rateLimit: &RateLimitManager{
			minInterval: 2 * time.Second, // Conservative rate limiting to prevent IP banning
		},
	}
}

func getTestConfigs() []TestConfig {
	configs := []TestConfig{}

	// NONE Authorization - Public endpoints (no auth required)
	configs = append(configs, TestConfig{
		Name:        "Public-NoAuth",
		KeyType:     KeyTypeHMAC, // Doesn't matter for public endpoints
		AuthType:    AuthTypeNONE,
		Description: "Test public endpoints that don't require authentication",
	})

	// HMAC Authentication Tests
	if apiKey := os.Getenv("BINANCE_API_KEY"); apiKey != "" {
		if secretKey := os.Getenv("BINANCE_SECRET_KEY"); secretKey != "" {
			configs = append(configs, TestConfig{
				Name:        "HMAC-UserData",
				KeyType:     KeyTypeHMAC,
				AuthType:    AuthTypeUSER_DATA,
				APIKey:      apiKey,
				SecretKey:   secretKey,
				Description: "Test USER_DATA endpoints with HMAC authentication",
			})

			configs = append(configs, TestConfig{
				Name:        "HMAC-Trade",
				KeyType:     KeyTypeHMAC,
				AuthType:    AuthTypeTRADE,
				APIKey:      apiKey,
				SecretKey:   secretKey,
				Description: "Test TRADE endpoints with HMAC authentication",
			})
		}
	}

	// RSA Authentication Tests
	if apiKey := os.Getenv("BINANCE_RSA_API_KEY"); apiKey != "" {
		if privateKeyPath := os.Getenv("BINANCE_RSA_PRIVATE_KEY_PATH"); privateKeyPath != "" {
			if _, err := os.Stat(privateKeyPath); err == nil {
				configs = append(configs, TestConfig{
					Name:        "RSA-UserData",
					KeyType:     KeyTypeRSA,
					AuthType:    AuthTypeUSER_DATA,
					APIKey:      apiKey,
					PrivateKey:  privateKeyPath,
					Description: "Test USER_DATA endpoints with RSA authentication",
				})

				configs = append(configs, TestConfig{
					Name:        "RSA-Trade",
					KeyType:     KeyTypeRSA,
					AuthType:    AuthTypeTRADE,
					APIKey:      apiKey,
					PrivateKey:  privateKeyPath,
					Description: "Test TRADE endpoints with RSA authentication",
				})
			}
		}
	}

	// Ed25519 Authentication Tests
	if apiKey := os.Getenv("BINANCE_ED25519_API_KEY"); apiKey != "" {
		if privateKeyPath := os.Getenv("BINANCE_ED25519_PRIVATE_KEY_PATH"); privateKeyPath != "" {
			if _, err := os.Stat(privateKeyPath); err == nil {
				configs = append(configs, TestConfig{
					Name:        "Ed25519-UserData",
					KeyType:     KeyTypeED25519,
					AuthType:    AuthTypeUSER_DATA,
					APIKey:      apiKey,
					PrivateKey:  privateKeyPath,
					Description: "Test USER_DATA endpoints with Ed25519 authentication",
				})

				configs = append(configs, TestConfig{
					Name:        "Ed25519-Trade",
					KeyType:     KeyTypeED25519,
					AuthType:    AuthTypeTRADE,
					APIKey:      apiKey,
					PrivateKey:  privateKeyPath,
					Description: "Test TRADE endpoints with Ed25519 authentication",
				})
			}
		}
	}

	return configs
}

// Helper functions for test setup
func setupClient(config TestConfig) (*spotws.Client, error) {
	client := spotws.NewClient()

	// Set to testnet server
	err := client.SetActiveServer("testnet1")
	if err != nil {
		return nil, fmt.Errorf("failed to set testnet server: %w", err)
	}

	// Set auth if provided
	if config.APIKey != "" {
		auth := &spotws.Auth{
			APIKey: config.APIKey,
		}
		if config.SecretKey != "" {
			auth.SetSecretKey(config.SecretKey)
		}
		if config.PrivateKey != "" {
			auth.PrivateKeyPath = config.PrivateKey
		}
		client.SetAuth(auth)
	}

	// Register essential event handlers to prevent "No handler found" errors
	// These handlers are needed for any WebSocket operations that might trigger events
	client.HandleEventStreamTerminated(func(event *models.EventStreamTerminated) error {
		// Silent handler to prevent "No handler found" log messages
		return nil
	})

	client.HandleOutboundAccountPosition(func(event *models.OutboundAccountPosition) error {
		// Silent handler for account position events
		return nil
	})

	client.HandleBalanceUpdate(func(event *models.BalanceUpdate) error {
		// Silent handler for balance update events
		return nil
	})

	client.HandleExecutionReport(func(event *models.ExecutionReport) error {
		// Silent handler for execution report events
		return nil
	})

	client.HandleListStatus(func(event *models.ListStatus) error {
		// Silent handler for list status events
		return nil
	})

	client.HandleListenKeyExpired(func(event *models.ListenKeyExpired) error {
		// Silent handler for listen key expired events
		return nil
	})

	client.HandleExternalLockUpdate(func(event *models.ExternalLockUpdate) error {
		// Silent handler for external lock update events
		return nil
	})

	// Connect to the WebSocket server
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err = client.Connect(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to WebSocket: %w", err)
	}

	return client, nil
}

func runWithTimeout(t *testing.T, name string, timeout time.Duration, testFunc func() error) {
	t.Helper()

	start := time.Now()
	done := make(chan error, 1)

	go func() {
		done <- testFunc()
	}()

	select {
	case err := <-done:
		duration := time.Since(start)
		if err != nil {
			t.Errorf("%s failed after %v: %v", name, duration, err)
		} else {
			t.Logf("%s passed in %v", name, duration)
		}
	case <-time.After(timeout):
		t.Errorf("%s timed out after %v", name, timeout)
	}
}

// initSharedClients initializes the shared client manager
func initSharedClients() {
	once.Do(func() {
		sharedClients = &SharedClientManager{
			clients: make(map[string]*spotws.Client),
		}

		// Register cleanup function to disconnect all clients at program exit
		sharedClients.cleanupFn = func() {
			sharedClients.mutex.Lock()
			defer sharedClients.mutex.Unlock()

			for configName, client := range sharedClients.clients {
				if client != nil {
					client.Disconnect()
					delete(sharedClients.clients, configName)
				}
			}
		}
	})
}

// getOrCreateSharedClient gets or creates a shared client for the given config
func getOrCreateSharedClient(t *testing.T, config TestConfig) *spotws.Client {
	initSharedClients()

	sharedClients.mutex.RLock()
	client, exists := sharedClients.clients[config.Name]
	sharedClients.mutex.RUnlock()

	if exists && client != nil {
		return client
	}

	// Need to create a new client
	sharedClients.mutex.Lock()
	defer sharedClients.mutex.Unlock()

	// Double-check in case another goroutine created it
	if client, exists := sharedClients.clients[config.Name]; exists && client != nil {
		return client
	}

	// Create new client
	newClient, err := setupClient(config)
	if err != nil {
		t.Logf("Failed to setup shared client for %s: %v", config.Name, err)
		return nil
	}

	sharedClients.clients[config.Name] = newClient

	// Don't register cleanup here - let TestMain handle it
	// This prevents premature disconnection during subtests

	return newClient
}

// disconnectSharedClient disconnects and removes a shared client
func disconnectSharedClient(configName string) {
	if sharedClients == nil {
		return
	}

	sharedClients.mutex.Lock()
	defer sharedClients.mutex.Unlock()

	if client, exists := sharedClients.clients[configName]; exists && client != nil {
		client.Disconnect()
		delete(sharedClients.clients, configName)
	}
}

// disconnectAllSharedClients disconnects all shared clients
func disconnectAllSharedClients() {
	if sharedClients == nil {
		return
	}

	if sharedClients.cleanupFn != nil {
		sharedClients.cleanupFn()
	}
}

// generateSignature creates signature for the query string based on key type
func generateSignature(config TestConfig, queryString string) (string, error) {
	switch config.KeyType {
	case KeyTypeHMAC:
		h := hmac.New(sha256.New, []byte(config.SecretKey))
		h.Write([]byte(queryString))
		return hex.EncodeToString(h.Sum(nil)), nil
	case KeyTypeED25519:
		// Load Ed25519 private key from file
		privateKeyBytes, err := ioutil.ReadFile(config.PrivateKey)
		if err != nil {
			return "", fmt.Errorf("failed to read Ed25519 private key: %w", err)
		}

		var privateKey ed25519.PrivateKey

		// Try to parse as PEM first
		block, _ := pem.Decode(privateKeyBytes)
		if block != nil {
			// Parse PEM-encoded key
			parsedKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
			if err != nil {
				return "", fmt.Errorf("failed to parse Ed25519 PEM private key: %w", err)
			}

			ed25519Key, ok := parsedKey.(ed25519.PrivateKey)
			if !ok {
				return "", fmt.Errorf("private key is not Ed25519")
			}
			privateKey = ed25519Key
		} else {
			// Handle raw hex or base64 formats
			keyStr := strings.TrimSpace(string(privateKeyBytes))
			keyStr = strings.ReplaceAll(keyStr, "\n", "")
			keyStr = strings.ReplaceAll(keyStr, "\r", "")
			keyStr = strings.ReplaceAll(keyStr, " ", "")

			// Try hex first (32 bytes = 64 hex chars for seed, 64 bytes = 128 hex chars for full key)
			if len(keyStr) == 64 {
				// 32-byte seed format
				seedBytes, err := hex.DecodeString(keyStr)
				if err != nil {
					return "", fmt.Errorf("failed to decode Ed25519 seed as hex: %w", err)
				}
				privateKey = ed25519.NewKeyFromSeed(seedBytes)
			} else if len(keyStr) == 128 {
				// 64-byte full key format
				keyBytes, err := hex.DecodeString(keyStr)
				if err != nil {
					return "", fmt.Errorf("failed to decode Ed25519 private key as hex: %w", err)
				}
				privateKey = ed25519.PrivateKey(keyBytes)
			} else {
				// Try base64
				keyBytes, err := base64.StdEncoding.DecodeString(keyStr)
				if err != nil {
					return "", fmt.Errorf("failed to decode Ed25519 private key as base64: %w", err)
				}

				if len(keyBytes) == 32 {
					// 32-byte seed
					privateKey = ed25519.NewKeyFromSeed(keyBytes)
				} else if len(keyBytes) == 64 {
					// 64-byte full key
					privateKey = ed25519.PrivateKey(keyBytes)
				} else {
					return "", fmt.Errorf("invalid Ed25519 key length: %d bytes (expected 32 or 64)", len(keyBytes))
				}
			}
		}

		// Verify we have a valid private key
		if len(privateKey) != ed25519.PrivateKeySize {
			return "", fmt.Errorf("invalid Ed25519 private key size: %d bytes (expected %d)", len(privateKey), ed25519.PrivateKeySize)
		}

		// Sign the query string
		signature := ed25519.Sign(privateKey, []byte(queryString))

		// Log for debugging (remove in production)
		// fmt.Printf("Debug: Signing query string '%s' with Ed25519 key\n", queryString)
		// fmt.Printf("Debug: Signature length: %d bytes\n", len(signature))

		// Use base64 encoding to match the WebSocket SDK implementation
		return base64.StdEncoding.EncodeToString(signature), nil
	case KeyTypeRSA:
		// For RSA, we'd need to implement RSA signing, but session.logon only supports Ed25519
		return "", fmt.Errorf("RSA signing not supported for session.logon")
	default:
		return "", fmt.Errorf("unsupported key type: %v", config.KeyType)
	}
}

func (rm *RateLimitManager) Wait() {
	rm.mutex.Lock()
	defer rm.mutex.Unlock()

	now := time.Now()
	if elapsed := now.Sub(rm.lastCall); elapsed < rm.minInterval {
		sleepTime := rm.minInterval - elapsed
		time.Sleep(sleepTime)
	}

	rm.lastCall = time.Now()
	rm.callCount++
}

// Test function template - creates individual clients but with rate limiting
func testEndpoint(t *testing.T, config TestConfig, testName string, testFunc func(*spotws.Client, TestConfig) error) {
	testEndpointWithTimeout(t, config, testName, testFunc, 10*time.Second)
}

// Test function template with configurable timeout
func testEndpointWithTimeout(t *testing.T, config TestConfig, testName string, testFunc func(*spotws.Client, TestConfig) error, timeout time.Duration) {
	t.Helper()

	// Rate limit connection attempts to prevent IP banning
	testSuite.rateLimit.Wait()

	client, err := setupClient(config)
	if err != nil {
		t.Fatalf("Failed to setup client: %v", err)
	}
	defer client.Disconnect()

	runWithTimeout(t, testName, timeout, func() error {
		return testFunc(client, config)
	})
}

// Utility function to get current price for testing
func getCurrentPrice(client *spotws.Client, symbol string) (float64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	responseChan := make(chan *models.TickerPriceResponse, 1)
	errChan := make(chan error, 1)

	err := client.SendTickerPrice(ctx,
		models.NewTickerPriceRequest().SetSymbol(symbol),
		func(response *models.TickerPriceResponse, err error) error {
			if err != nil {
				errChan <- err
			} else {
				responseChan <- response
			}
			return err
		})

	if err != nil {
		return 0, fmt.Errorf("failed to send ticker price request: %w", err)
	}

	select {
	case response := <-responseChan:
		if response.Result.Price != "" {
			return strconv.ParseFloat(response.Result.Price, 64)
		}
		return 0, fmt.Errorf("empty price in response")
	case err := <-errChan:
		return 0, err
	case <-ctx.Done():
		return 0, fmt.Errorf("ticker price timeout")
	}
}
