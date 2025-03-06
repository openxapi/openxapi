package generator

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/adshao/openxapi/internal/parser"
	"github.com/getkin/kin-openapi/openapi3"
)

// Generator handles the generation of OpenAPI specifications
type Generator struct {
	outputDir string
}

// NewGenerator creates a new OpenAPI specification generator
func NewGenerator(outputDir string) *Generator {
	return &Generator{
		outputDir: outputDir,
	}
}

// Generate creates an OpenAPI specification from parsed endpoints
func (g *Generator) Generate(exchange string, endpoints []parser.Endpoint, baseURL string) error {
	spec := &openapi3.T{
		OpenAPI: "3.0.3",
		Info: &openapi3.Info{
			Title:       fmt.Sprintf("%s API", exchange),
			Description: fmt.Sprintf("OpenAPI specification for %s cryptocurrency exchange", exchange),
			Version:     "1.0.0",
		},
		Servers: openapi3.Servers{
			&openapi3.Server{
				URL:         baseURL,
				Description: fmt.Sprintf("%s API Server", exchange),
			},
		},
		Paths:      openapi3.Paths{},
		Components: &openapi3.Components{
			Schemas:    make(openapi3.Schemas),
			Responses: make(openapi3.Responses),
		},
	}

	// Convert endpoints to OpenAPI paths
	for _, endpoint := range endpoints {
		path := g.convertEndpointToPath(endpoint)
		spec.Paths[endpoint.Path] = path
	}

	// Ensure output directory exists
	if err := os.MkdirAll(g.outputDir, 0755); err != nil {
		return fmt.Errorf("creating output directory: %w", err)
	}

	// Write specification to file
	outputPath := filepath.Join(g.outputDir, fmt.Sprintf("%s.json", exchange))
	if err := g.writeSpec(spec, outputPath); err != nil {
		return fmt.Errorf("writing specification: %w", err)
	}

	return nil
}

// convertEndpointToPath converts a parser.Endpoint to an OpenAPI path
func (g *Generator) convertEndpointToPath(endpoint parser.Endpoint) *openapi3.PathItem {
	operation := &openapi3.Operation{
		Summary:     endpoint.Summary,
		Description: endpoint.Description,
		Tags:        endpoint.Tags,
		Parameters:  g.convertParameters(endpoint.Parameters),
		Responses:   g.convertResponses(endpoint.Responses),
	}

	if endpoint.RequestBody != nil {
		operation.RequestBody = g.convertRequestBody(endpoint.RequestBody)
	}

	pathItem := &openapi3.PathItem{}
	switch endpoint.Method {
	case "GET":
		pathItem.Get = operation
	case "POST":
		pathItem.Post = operation
	case "PUT":
		pathItem.Put = operation
	case "DELETE":
		pathItem.Delete = operation
	case "PATCH":
		pathItem.Patch = operation
	}

	return pathItem
}

// convertParameters converts parser parameters to OpenAPI parameters
func (g *Generator) convertParameters(params []parser.Parameter) openapi3.Parameters {
	result := make(openapi3.Parameters, 0, len(params))
	for _, param := range params {
		result = append(result, &openapi3.ParameterRef{
			Value: &openapi3.Parameter{
				Name:        param.Name,
				In:          param.In,
				Description: param.Description,
				Required:    param.Required,
				Schema:     g.convertSchema(param.Schema),
			},
		})
	}
	return result
}

// convertRequestBody converts a parser request body to an OpenAPI request body
func (g *Generator) convertRequestBody(body *parser.RequestBody) *openapi3.RequestBodyRef {
	content := make(openapi3.Content)
	for mediaType, mt := range body.Content {
		content[mediaType] = &openapi3.MediaType{
			Schema: g.convertSchema(mt.Schema),
		}
	}

	return &openapi3.RequestBodyRef{
		Value: &openapi3.RequestBody{
			Description: body.Description,
			Required:    body.Required,
			Content:     content,
		},
	}
}

// convertResponses converts parser responses to OpenAPI responses
func (g *Generator) convertResponses(responses map[string]parser.Response) openapi3.Responses {
	result := make(openapi3.Responses)
	for code, response := range responses {
		content := make(openapi3.Content)
		for mediaType, mt := range response.Content {
			content[mediaType] = &openapi3.MediaType{
				Schema: g.convertSchema(mt.Schema),
			}
		}

		result[code] = &openapi3.ResponseRef{
			Value: &openapi3.Response{
				Description: &response.Description,
				Content:     content,
			},
		}
	}
	return result
}

// convertSchema converts a parser schema to an OpenAPI schema
func (g *Generator) convertSchema(schema parser.Schema) *openapi3.SchemaRef {
	result := &openapi3.Schema{
		Type:        schema.Type,
		Format:      schema.Format,
		Description: schema.Description,
		Example:     schema.Example,
		Enum:        schema.Enum,
		Required:    schema.Required,
	}

	if schema.Items != nil {
		result.Items = g.convertSchema(*schema.Items)
	}

	if schema.Properties != nil {
		result.Properties = make(openapi3.Schemas)
		for name, prop := range schema.Properties {
			result.Properties[name] = g.convertSchema(prop)
		}
	}

	return &openapi3.SchemaRef{
		Value: result,
	}
}

// writeSpec writes the OpenAPI specification to a file
func (g *Generator) writeSpec(spec *openapi3.T, path string) error {
	data, err := json.MarshalIndent(spec, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling specification: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("writing specification file: %w", err)
	}

	return nil
} 