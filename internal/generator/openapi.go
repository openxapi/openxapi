package generator

import (
	"fmt"
	"github.com/adshao/openxapi/internal/parser"
	"github.com/getkin/kin-openapi/openapi3"
	yaml "gopkg.in/yaml.v3"
	"os"
	"path/filepath"
	"slices"
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
func (g *Generator) Generate(exchange string, version, apiType string, endpoints []parser.Endpoint, baseURL string) error {
	spec := &openapi3.T{
		OpenAPI: "3.0.3",
		Info: &openapi3.Info{
			Title:       fmt.Sprintf("%s %s API", exchange, apiType),
			Description: fmt.Sprintf("OpenAPI specification for %s cryptocurrency exchange - %s API", exchange, apiType),
			Version:     version,
		},
		Servers: openapi3.Servers{
			&openapi3.Server{
				URL:         baseURL,
				Description: fmt.Sprintf("%s %s API Server", exchange, apiType),
			},
		},
		Paths: openapi3.NewPaths(),
		Components: &openapi3.Components{
			Schemas:   make(openapi3.Schemas),
			Responses: make(openapi3.ResponseBodies),
		},
	}

	// Convert endpoints to OpenAPI paths
	for _, endpoint := range endpoints {
		path := g.convertEndpointToPath(endpoint)
		spec.Paths.Set(endpoint.Path, path)

		var schemaTitles []string
		for _, schema := range endpoint.Schemas {
			// If the schema is not in schemaTitles, add it
			if !slices.Contains(schemaTitles, schema.Title) {
				schemaTitles = append(schemaTitles, schema.Title)
				spec.Components.Schemas[schema.Title] = g.convertSchema(&schema)
			}
		}
	}

	// Ensure output directory exists
	if err := os.MkdirAll(g.outputDir, 0755); err != nil {
		return fmt.Errorf("creating output directory: %w", err)
	}

	// Write specification to file
	outputPath := filepath.Join(g.outputDir, fmt.Sprintf("%s_%s.yaml", exchange, apiType))
	if err := g.writeSpec(spec, outputPath); err != nil {
		return fmt.Errorf("writing specification: %w", err)
	}

	return nil
}

// convertSchema converts a parser.Schema to an OpenAPI schema
func (g *Generator) convertSchema(schema *parser.Schema) *openapi3.SchemaRef {
	result := &openapi3.Schema{
		Type:         &openapi3.Types{schema.Type},
		Format:       schema.Format,
		Description:  schema.Description,
		Enum:         schema.Enum,
		Default:      schema.Default,
		Example:      schema.Example,
		UniqueItems:  schema.UniqueItems,
		ExclusiveMin: schema.ExclusiveMin,
		ExclusiveMax: schema.ExclusiveMax,
		Nullable:     schema.Nullable,
		Deprecated:   schema.Deprecated,
		Min:          schema.Min,
		Max:          schema.Max,
		MultipleOf:   schema.MultipleOf,
		MinLength:    schema.MinLength,
		MaxLength:    schema.MaxLength,
		Pattern:      schema.Pattern,
		MinItems:     schema.MinItems,
		MaxItems:     schema.MaxItems,
		Required:     schema.Required,
	}
	if len(schema.OneOf) > 0 {
		result.OneOf = make([]*openapi3.SchemaRef, len(schema.OneOf))
		for i, oneOf := range schema.OneOf {
			result.OneOf[i] = g.convertSchema(oneOf)
		}
	}
	if schema.Items != nil {
		result.Items = g.convertSchema(schema.Items)
	}
	if schema.Properties != nil {
		result.Properties = make(openapi3.Schemas)
		for name, prop := range schema.Properties {
			result.Properties[name] = g.convertSchema(prop)
		}
	}
	if schema.AdditionalProperties != nil {
		result.AdditionalProperties = openapi3.AdditionalProperties{
			Schema: g.convertSchema(schema.AdditionalProperties),
		}
	}
	return &openapi3.SchemaRef{
		Value: result,
	}
}

// convertEndpointToPath converts a parser.Endpoint to an OpenAPI path
func (g *Generator) convertEndpointToPath(endpoint parser.Endpoint) *openapi3.PathItem {
	operation := &openapi3.Operation{
		Summary:     endpoint.Summary,
		Description: endpoint.Description,
		Tags:        endpoint.Tags,
		Parameters:  g.convertParameters(endpoint.Parameters),
		OperationID: endpoint.OperationID,
		Responses:   &openapi3.Responses{},
		Deprecated:  endpoint.Deprecated,
	}

	// Add responses to the operation
	for code, resp := range g.convertResponses(endpoint.Responses) {
		operation.Responses.Set(code, resp)
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
				Schema:      g.convertSchema(&param.Schema),
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
			Schema: g.convertSchema(&mt.Schema),
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
func (g *Generator) convertResponses(responses map[string]parser.Response) map[string]*openapi3.ResponseRef {
	result := make(map[string]*openapi3.ResponseRef)
	for code, response := range responses {
		content := make(openapi3.Content)
		for mediaType, mt := range response.Content {
			content[mediaType] = &openapi3.MediaType{
				Schema: g.convertSchema(&mt.Schema),
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

// writeSpec writes the OpenAPI specification to a file
func (g *Generator) writeSpec(spec *openapi3.T, path string) error {
	data, err := yaml.Marshal(spec)
	if err != nil {
		return fmt.Errorf("marshaling specification: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("writing specification file: %w", err)
	}

	return nil
}
