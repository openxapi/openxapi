import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const moduleName = params.moduleName || 'binance-websocket-client';

  // Extract authentication types from channel messages
  const getAuthType = (messageName) => {
    const match = messageName.match(/\(([^)]+)\)\s*(Request|Response)$/);
    return match ? match[1] : 'NONE';
  };

  const authTypes = new Set();
  const channels = asyncapi.channels();
  for (const channelName of channels.keys()) {
    const channel = channels.get(channelName);
    if (channel && channel.hasMessages()) {
      const messages = channel.messages();
      for (const messageKey of messages.keys()) {
        const message = messages.get(messageKey);
        if (message && message.id() && message.id().includes('sendMessage')) {
          const authType = getAuthType(message.name());
          authTypes.add(authType);
        }
      }
    }
  }

  return (
    <File name="signing.go">
      <Text>package {packageName}</Text>
      <Text newLines={2}>
        {`import (
	"context"
	"crypto"
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"time"
)`}
      </Text>

      <Text newLines={2}>
        {`// AuthType represents the authentication type required for requests
type AuthType string

const (
	AuthTypeNone       AuthType = "NONE"        // Public market data - no authentication required
	AuthTypeTrade      AuthType = "TRADE"       // Trading on the exchange, placing and canceling orders
	AuthTypeUserData   AuthType = "USER_DATA"   // Private account information, such as order status and trading history
	AuthTypeUserStream AuthType = "USER_STREAM" // Managing User Data Stream subscriptions
)`}
      </Text>

      <Text newLines={2}>
        {`// KeyType represents the key type for authentication
type KeyType string

const (
	KeyTypeHMAC    KeyType = "HMAC"
	KeyTypeRSA     KeyType = "RSA"
	KeyTypeED25519 KeyType = "ED25519"
)`}
      </Text>

      <Text newLines={2}>
        {`// Auth provides Binance API key based authentication for WebSocket API
type Auth struct {
	APIKey           string
	KeyType          KeyType
	PrivateKeyPath   string        // The path to the private key
	PrivateKeyReader io.Reader     // Provide the private key using types which implement io.Reader interface
	Passphrase       string        // The passphrase to decrypt the private key, if the key is encrypted
	privateKey       crypto.PrivateKey
	secretKey        string
}`}
      </Text>

      <Text newLines={2}>
        {`// NewAuth creates a new Auth instance with the specified API key
func NewAuth(apiKey string) *Auth {
	return &Auth{
		APIKey: apiKey,
	}
}`}
      </Text>

      <Text newLines={2}>
        {`// SetSecretKey sets the secret key for HMAC authentication
func (a *Auth) SetSecretKey(secretKey string) {
	a.secretKey = secretKey
	a.KeyType = KeyTypeHMAC
}`}
      </Text>

      <Text newLines={2}>
        {`// SetPrivateKey accepts a private key byte array and sets it
func (a *Auth) SetPrivateKey(privateKey []byte) error {
	return a.parsePrivateKey(privateKey)
}`}
      </Text>

      <Text newLines={2}>
        {`// SetPrivateKeyPath sets the path to the private key file
func (a *Auth) SetPrivateKeyPath(path string) {
	a.PrivateKeyPath = path
}`}
      </Text>

      <Text newLines={2}>
        {`// SetPrivateKeyReader sets the private key reader
func (a *Auth) SetPrivateKeyReader(reader io.Reader) {
	a.PrivateKeyReader = reader
}`}
      </Text>

      <Text newLines={2}>
        {`// SetPassphrase sets the passphrase for encrypted private keys
func (a *Auth) SetPassphrase(passphrase string) {
	a.Passphrase = passphrase
}

// ContextWithValue returns a context with the Auth value attached
func (a *Auth) ContextWithValue(ctx context.Context) (context.Context, error) {
	if a.APIKey == "" {
		return nil, fmt.Errorf("API key is required")
	}
	return context.WithValue(ctx, ContextBinanceAuth, *a), nil
}`}
      </Text>

      <Text newLines={2}>
        {`// loadPrivateKey reads the private key from the file specified in the Auth.
// The key is loaded only when privateKey is not already set.
func (a *Auth) loadPrivateKey() (err error) {
	if a.privateKey != nil {
		return nil
	}
	var priv []byte
	keyReader := a.PrivateKeyReader
	if keyReader == nil {
		var file *os.File
		file, err = os.Open(a.PrivateKeyPath)
		if err != nil {
			return fmt.Errorf("cannot load private key '%s'. Error: %v", a.PrivateKeyPath, err)
		}
		keyReader = file
		defer func() {
			err = file.Close()
		}()
	}
	priv, err = io.ReadAll(keyReader)
	if err != nil {
		return err
	}
	return a.parsePrivateKey(priv)
}`}
      </Text>

      <Text newLines={2}>
        {`// parsePrivateKey decodes privateKey byte array to crypto.PrivateKey type.
func (a *Auth) parsePrivateKey(priv []byte) error {
	pemBlock, _ := pem.Decode(priv)
	if pemBlock == nil {
		// No PEM data has been found.
		return fmt.Errorf("file '%s' does not contain PEM data", a.PrivateKeyPath)
	}
	var privKey []byte
	var err error
	if x509.IsEncryptedPEMBlock(pemBlock) {
		// The PEM data is encrypted.
		privKey, err = x509.DecryptPEMBlock(pemBlock, []byte(a.Passphrase))
		if err != nil {
			// Failed to decrypt PEM block. Because of deficiencies in the encrypted-PEM format,
			// it's not always possible to detect an incorrect password.
			return err
		}
	} else {
		privKey = pemBlock.Bytes
	}
	switch pemBlock.Type {
	case "RSA PRIVATE KEY":
		if a.privateKey, err = x509.ParsePKCS1PrivateKey(privKey); err != nil {
			return err
		}
		a.KeyType = KeyTypeRSA
	case "EC PRIVATE KEY", "PRIVATE KEY":
		// https://tools.ietf.org/html/rfc5915 section 4.
		if a.privateKey, err = x509.ParsePKCS8PrivateKey(privKey); err != nil {
			return err
		}
		if _, ok := a.privateKey.(*rsa.PrivateKey); ok {
			a.KeyType = KeyTypeRSA
		} else if _, ok := a.privateKey.(ed25519.PrivateKey); ok {
			a.KeyType = KeyTypeED25519
		} else {
			return fmt.Errorf("private key '%s' is not supported", pemBlock.Type)
		}
	default:
		return fmt.Errorf("key '%s' is not supported", pemBlock.Type)
	}
	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// RequestSigner handles request signing for different authentication methods
type RequestSigner struct {
	auth *Auth
}`}
      </Text>

      <Text newLines={2}>
        {`// NewRequestSigner creates a new request signer with the given auth
func NewRequestSigner(auth *Auth) *RequestSigner {
	return &RequestSigner{
		auth: auth,
	}
}`}
      </Text>

      <Text newLines={2}>
        {`// EnsureInitialized ensures the auth is properly initialized
func (s *RequestSigner) EnsureInitialized() error {
	if s.auth == nil {
		return fmt.Errorf("auth not set")
	}
	
	if s.auth.KeyType == "" {
		if (len(s.auth.PrivateKeyPath) == 0 && s.auth.PrivateKeyReader == nil) && s.auth.privateKey == nil {
			return fmt.Errorf("private key path must be specified")
		}
		if len(s.auth.PrivateKeyPath) > 0 && s.auth.PrivateKeyReader != nil {
			return fmt.Errorf("specify only one of PrivateKeyPath or PrivateKeyReader")
		}
		if err := s.auth.loadPrivateKey(); err != nil {
			return err
		}
	}
	
	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// GetAuthTypeFromMessageName extracts the authentication type from a message name
func GetAuthTypeFromMessageName(messageName string) AuthType {
	// Extract content from parentheses at the end of the message name
	// Examples:
	// "Account Commission Rates (USER_DATA) Request" -> "USER_DATA"
	// "Current average price Request" -> "NONE" (no parentheses)
	
	if strings.Contains(messageName, "(USER_DATA)") {
		return AuthTypeUserData
	}
	if strings.Contains(messageName, "(TRADE)") {
		return AuthTypeTrade
	}
	if strings.Contains(messageName, "(USER_STREAM)") {
		return AuthTypeUserStream
	}
	return AuthTypeNone
}`}
      </Text>

      <Text newLines={2}>
        {`// RequiresSignature returns true if the authentication type requires a signature
func RequiresSignature(authType AuthType) bool {
	return authType == AuthTypeTrade || authType == AuthTypeUserData
}`}
      </Text>

      <Text newLines={2}>
        {`// SignRequest signs a request based on the authentication type and signing method
func (s *RequestSigner) SignRequest(params map[string]interface{}, authType AuthType) error {
	if err := s.EnsureInitialized(); err != nil {
		return err
	}

	// Add API key for all authenticated requests
	if authType != AuthTypeNone {
		params["apiKey"] = s.auth.APIKey
	}

	// Add timestamp for signed requests
	if RequiresSignature(authType) {
		params["timestamp"] = time.Now().UnixMilli()
	}

	// Generate signature for TRADE and USER_DATA requests
	if RequiresSignature(authType) {
		signature, err := s.generateSignature(params)
		if err != nil {
			return fmt.Errorf("failed to generate signature: %w", err)
		}
		params["signature"] = signature
	}

	return nil
}`}
      </Text>

      <Text newLines={2}>
        {`// generateSignature generates a signature for the request parameters
func (s *RequestSigner) generateSignature(params map[string]interface{}) (string, error) {
	// Create signature payload by sorting parameters alphabetically and formatting as key=value&key=value
	var keys []string
	for key := range params {
		if key != "signature" { // Exclude signature itself
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)

	var payloadParts []string
	for _, key := range keys {
		value := params[key]
		valueStr := fmt.Sprintf("%v", value)
		payloadParts = append(payloadParts, fmt.Sprintf("%s=%s", key, valueStr))
	}
	payload := strings.Join(payloadParts, "&")

	// Generate signature based on key type
	switch s.auth.KeyType {
	case KeyTypeHMAC:
		return s.generateHMACSignature(payload)
	case KeyTypeRSA:
		return s.generateRSASignature(payload)
	case KeyTypeED25519:
		return s.generateEd25519Signature(payload)
	default:
		return "", fmt.Errorf("unsupported key type: %s", s.auth.KeyType)
	}
}`}
      </Text>

      <Text newLines={2}>
        {`// generateHMACSignature generates an HMAC-SHA256 signature
func (s *RequestSigner) generateHMACSignature(payload string) (string, error) {
	if s.auth.secretKey == "" {
		return "", fmt.Errorf("secret key not set for HMAC signing")
	}

	h := hmac.New(sha256.New, []byte(s.auth.secretKey))
	h.Write([]byte(payload))
	signature := hex.EncodeToString(h.Sum(nil))
	return signature, nil
}`}
      </Text>

      <Text newLines={2}>
        {`// generateRSASignature generates an RSA-SHA256 signature
func (s *RequestSigner) generateRSASignature(payload string) (string, error) {
	privateKey, ok := s.auth.privateKey.(*rsa.PrivateKey)
	if !ok {
		return "", fmt.Errorf("invalid RSA private key")
	}

	hashed := sha256.Sum256([]byte(payload))
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, hashed[:])
	if err != nil {
		return "", fmt.Errorf("failed to sign with RSA: %w", err)
	}

	return base64.StdEncoding.EncodeToString(signature), nil
}`}
      </Text>

      <Text newLines={2}>
        {`// generateEd25519Signature generates an Ed25519 signature
func (s *RequestSigner) generateEd25519Signature(payload string) (string, error) {
	privateKey, ok := s.auth.privateKey.(ed25519.PrivateKey)
	if !ok {
		return "", fmt.Errorf("invalid Ed25519 private key")
	}

	signature := ed25519.Sign(privateKey, []byte(payload))
	return base64.StdEncoding.EncodeToString(signature), nil
}`}
      </Text>


    </File>
  );
} 