import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';

  return (
    <File name="signing_test.go">
      <Text>package {packageName}</Text>
      <Text newLines={2}>
        {`import (
	"testing"
	"reflect"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
)`}
      </Text>

      <Text newLines={2}>
        {`func TestGetAuthTypeFromMessageName(t *testing.T) {
	tests := []struct {
		name         string
		messageName  string
		expectedAuth AuthType
	}{
		{
			name:         "USER_DATA authentication",
			messageName:  "Account Commission Rates (USER_DATA) Request",
			expectedAuth: AuthTypeUserData,
		},
		{
			name:         "TRADE authentication",
			messageName:  "Place new order (TRADE) Request",
			expectedAuth: AuthTypeTrade,
		},
		{
			name:         "USER_STREAM authentication",
			messageName:  "Start User Data Stream (USER_STREAM) Request",
			expectedAuth: AuthTypeUserStream,
		},
		{
			name:         "NONE authentication",
			messageName:  "Current average price Request",
			expectedAuth: AuthTypeNone,
		},
		{
			name:         "No parentheses",
			messageName:  "Exchange information Request",
			expectedAuth: AuthTypeNone,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := GetAuthTypeFromMessageName(tt.messageName)
			if result != tt.expectedAuth {
				t.Errorf("GetAuthTypeFromMessageName() = %v, want %v", result, tt.expectedAuth)
			}
		})
	}
}`}
      </Text>

      <Text newLines={2}>
        {`func TestRequiresSignature(t *testing.T) {
	tests := []struct {
		name     string
		authType AuthType
		expected bool
	}{
		{
			name:     "USER_DATA requires signature",
			authType: AuthTypeUserData,
			expected: true,
		},
		{
			name:     "TRADE requires signature",
			authType: AuthTypeTrade,
			expected: true,
		},
		{
			name:     "USER_STREAM does not require signature",
			authType: AuthTypeUserStream,
			expected: false,
		},
		{
			name:     "NONE does not require signature",
			authType: AuthTypeNone,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := RequiresSignature(tt.authType)
			if result != tt.expected {
				t.Errorf("RequiresSignature() = %v, want %v", result, tt.expected)
			}
		})
	}
}`}
      </Text>

      <Text newLines={2}>
        {`func TestHMACSignature(t *testing.T) {
	creds := NewAuth("test-api-key")
	creds.SetSecretKey("test-secret-key")
	signer := NewRequestSigner(creds)

	params := map[string]interface{}{
		"symbol":      "BTCUSDT",
		"side":        "SELL",
		"type":        "LIMIT",
		"timeInForce": "GTC",
		"quantity":    "0.01000000",
		"price":       "52000.00",
		"timestamp":   int64(1645423376532),
	}

	err := signer.SignRequest(params, AuthTypeTrade)
	if err != nil {
		t.Fatalf("SignRequest() error = %v", err)
	}

	// Check that signature was added
	if _, exists := params["signature"]; !exists {
		t.Error("SignRequest() did not add signature parameter")
	}

	// Check that API key was added
	if apiKey, exists := params["apiKey"]; !exists || apiKey != "test-api-key" {
		t.Error("SignRequest() did not add correct API key")
	}

	// Check that timestamp was updated
	if _, exists := params["timestamp"]; !exists {
		t.Error("SignRequest() did not add timestamp")
	}
}`}
      </Text>

      <Text newLines={2}>
        {`func TestRSASignature(t *testing.T) {
	// Generate test RSA key pair
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("Failed to generate RSA key: %v", err)
	}

	// Convert to PEM format
	privKeyBytes := x509.MarshalPKCS1PrivateKey(privateKey)
	pemBlock := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: privKeyBytes,
	}
	pemData := pem.EncodeToMemory(pemBlock)

	creds := NewAuth("test-api-key")
	if err := creds.SetPrivateKey(pemData); err != nil {
		t.Fatalf("Failed to set RSA private key: %v", err)
	}
	signer := NewRequestSigner(creds)

	params := map[string]interface{}{
		"symbol":      "BTCUSDT",
		"side":        "SELL",
		"type":        "LIMIT",
		"timeInForce": "GTC",
		"quantity":    "0.01000000",
		"price":       "52000.00",
		"timestamp":   int64(1645423376532),
	}

	err = signer.SignRequest(params, AuthTypeTrade)
	if err != nil {
		t.Fatalf("SignRequest() error = %v", err)
	}

	// Check that signature was added
	if signature, exists := params["signature"]; !exists {
		t.Error("SignRequest() did not add signature parameter")
	} else if signature == "" {
		t.Error("SignRequest() added empty signature")
	}
}`}
      </Text>

      <Text newLines={2}>
        {`func TestEd25519Signature(t *testing.T) {
	// Generate test Ed25519 key pair
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate Ed25519 key: %v", err)
	}

	// Convert to PKCS8 PEM format
	privKeyBytes, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		t.Fatalf("Failed to marshal Ed25519 private key: %v", err)
	}
	pemBlock := &pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: privKeyBytes,
	}
	pemData := pem.EncodeToMemory(pemBlock)

	creds := NewAuth("test-api-key")
	if err := creds.SetPrivateKey(pemData); err != nil {
		t.Fatalf("Failed to set Ed25519 private key: %v", err)
	}
	signer := NewRequestSigner(creds)

	params := map[string]interface{}{
		"symbol":      "BTCUSDT",
		"side":        "SELL",
		"type":        "LIMIT",
		"timeInForce": "GTC",
		"quantity":    "0.01000000",
		"price":       "52000.00",
		"timestamp":   int64(1645423376532),
	}

	err = signer.SignRequest(params, AuthTypeTrade)
	if err != nil {
		t.Fatalf("SignRequest() error = %v", err)
	}

	// Check that signature was added
	if signature, exists := params["signature"]; !exists {
		t.Error("SignRequest() did not add signature parameter")
	} else if signature == "" {
		t.Error("SignRequest() added empty signature")
	}
}`}
      </Text>

      <Text newLines={2}>
        {`func TestSignRequestWithNoCredentials(t *testing.T) {
	// Test with nil auth instead of nil signer
	signer := NewRequestSigner(nil)

	params := map[string]interface{}{
		"symbol": "BTCUSDT",
	}

	err := signer.SignRequest(params, AuthTypeTrade)
	if err == nil {
		t.Error("SignRequest() should return error when auth is nil")
	}
}`}
      </Text>

      <Text newLines={2}>
        {`func TestNoneAuthType(t *testing.T) {
	creds := NewAuth("test-api-key")
	creds.SetSecretKey("test-secret-key")
	signer := NewRequestSigner(creds)

	params := map[string]interface{}{
		"symbol": "BTCUSDT",
	}

	originalParams := make(map[string]interface{})
	for k, v := range params {
		originalParams[k] = v
	}

	err := signer.SignRequest(params, AuthTypeNone)
	if err != nil {
		t.Fatalf("SignRequest() error = %v", err)
	}

	// For NONE auth type, no changes should be made
	if !reflect.DeepEqual(params, originalParams) {
		t.Error("SignRequest() should not modify params for NONE auth type")
	}
}`}
      </Text>

      <Text newLines={2}>
        {`func BenchmarkHMACSignature(b *testing.B) {
	creds := NewAuth("test-api-key")
	creds.SetSecretKey("test-secret-key")
	signer := NewRequestSigner(creds)

	params := map[string]interface{}{
		"symbol":      "BTCUSDT",
		"side":        "SELL",
		"type":        "LIMIT",
		"timeInForce": "GTC",
		"quantity":    "0.01000000",
		"price":       "52000.00",
		"timestamp":   int64(1645423376532),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// Reset params for each iteration
		testParams := make(map[string]interface{})
		for k, v := range params {
			testParams[k] = v
		}
		
		err := signer.SignRequest(testParams, AuthTypeTrade)
		if err != nil {
			b.Fatalf("SignRequest() error = %v", err)
		}
	}
}`}
      </Text>
    </File>
  );
} 