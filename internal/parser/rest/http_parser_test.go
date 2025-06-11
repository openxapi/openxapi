package parser

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/openxapi/openxapi/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateSampleFilename(t *testing.T) {
	p := &HTTPParser{
		Client:     nil,
		UseSamples: false,
		SamplesDir: "",
	}

	tests := []struct {
		url      string
		expected string
	}{
		{
			url:      "https://binance-docs.github.io/apidocs/spot/en/",
			expected: "https_binance-docs.github.io_apidocs_spot_en_.html",
		},
		{
			url:      "https://binance-docs.github.io/apidocs/spot/en",
			expected: "https_binance-docs.github.io_apidocs_spot_en.html",
		},
		{
			url:      "https://binance-docs.github.io/apidocs/spot/en/index.html",
			expected: "index.html",
		},
		{
			url:      "https://binance-docs.github.io/apidocs/spot/en/?param=value",
			expected: "https_binance-docs.github.io_apidocs_spot_en__param_value.html",
		},
		{
			url:      "https://example.com",
			expected: "example.com",
		},
	}

	for _, test := range tests {
		result := p.generateSampleFilename(test.url)
		assert.Equal(t, test.expected, result, "URL: %s", test.url)
	}
}

func TestSaveAndReadSample(t *testing.T) {
	// Create a temporary directory for test samples
	tempDir, err := os.MkdirTemp("", "binance-test-samples")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create a parser with the temp directory
	p := &HTTPParser{
		Client:     nil,
		UseSamples: true,
		SamplesDir: tempDir,
	}

	// Test content
	testContent := "<html><body><h1>Test Sample</h1></body></html>"

	// Save the test content to a sample file
	samplePath := filepath.Join(tempDir, "test-sample.html")
	r, err := p.saveResponseToSample(strings.NewReader(testContent), samplePath)
	require.NoError(t, err)

	// Read the content from the reader
	content, err := io.ReadAll(r)
	require.NoError(t, err)
	assert.Equal(t, testContent, string(content))

	// Read the sample file
	r2, err := p.readSampleFile(samplePath)
	require.NoError(t, err)

	// Read the content from the reader
	content2, err := io.ReadAll(r2)
	require.NoError(t, err)
	assert.Equal(t, testContent, string(content2))
}

func TestParseWithSamples(t *testing.T) {
	// Skip this test if we're not running with samples
	if os.Getenv("TEST_WITH_SAMPLES") != "1" {
		t.Skip("Skipping test that requires sample files. Set TEST_WITH_SAMPLES=1 to run.")
	}

	// Create a mock document parser
	mockDocParser := &MockHTTPDocumentParser{}

	// Create a parser that uses samples
	p := &HTTPParser{
		Client:     nil,
		UseSamples: true,
		SamplesDir: "",
		DocParser:  mockDocParser,
	}

	// Create a test documentation
	doc := Documentation{
		Documentation: config.Documentation{
			Type: "spot",
			URLGroups: []config.URLGroup{
				{
					Name: "spot",
					URLs: []config.URLItem{
						{
							StringURL: "https://binance-docs.github.io/apidocs/spot/en/",
						},
					},
				},
			},
		},
	}

	// Parse the documentation
	ctx := context.Background()
	_, err := p.Parse(ctx, doc)
	// We expect an error since we're not actually reading a real file
	assert.Error(t, err)
}

// MockHTTPDocumentParser is a mock implementation of HTTPDocumentParser for testing
type MockHTTPDocumentParser struct{}

func (m *MockHTTPDocumentParser) Parse(r io.Reader, urlEntity *config.URLEntity, protectedEndpoints []string) ([]Endpoint, error) {
	return []Endpoint{}, nil
}
