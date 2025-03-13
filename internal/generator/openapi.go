package generator

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"

	"github.com/adshao/openxapi/internal/parser"
	"github.com/getkin/kin-openapi/openapi3"
	yaml "gopkg.in/yaml.v3"
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

// GenerateEndpoints generates an OpenAPI specification for each endpoint
func (g *Generator) GenerateEndpoints(exchange, version, apiType string, endpoints []parser.Endpoint) error {
	baseDir := filepath.Join(g.outputDir, exchange, apiType)
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return fmt.Errorf("creating directory: %w", err)
	}

	for _, endpoint := range endpoints {
		if endpoint.Protected {
			continue
		}
		pathItemPath := filepath.Join(baseDir, fmt.Sprintf("%s%s.yaml", strings.ToLower(endpoint.Method), strings.ReplaceAll(endpoint.Path, "/", "_")))
		pathItem := g.convertEndpointToPathItem(&endpoint)
		// Write spec to file so that we can restore from the file content later
		endpointSpec := &openapi3.T{
			Info:  &openapi3.Info{},
			Paths: openapi3.NewPaths(),
			Components: &openapi3.Components{
				Schemas: make(openapi3.Schemas),
			},
		}
		endpointSpec.Paths.Set(endpoint.Path, pathItem)
		for _, schema := range endpoint.Schemas {
			endpointSpec.Components.Schemas[schema.Title] = g.convertSchema(schema)
		}
		if err := g.writeSpec(endpointSpec, pathItemPath); err != nil {
			return fmt.Errorf("writing endpoint spec: %w", err)
		}
	}

	return nil
}

// Generate creates an OpenAPI specification from parsed endpoints
func (g *Generator) Generate(exchange, version, apiType string, servers []string) error {
	if len(servers) == 0 {
		return fmt.Errorf("no servers found for %s %s API", exchange, apiType)
	}
	openapiServers := make(openapi3.Servers, len(servers))
	for i, server := range servers {
		openapiServers[i] = &openapi3.Server{
			URL:         server,
			Description: fmt.Sprintf("%s %s API Server", strings.Title(exchange), strings.Title(apiType)),
		}
	}
	spec := &openapi3.T{
		OpenAPI: "3.0.3",
		Info: &openapi3.Info{
			Title:       fmt.Sprintf("%s %s API", strings.Title(exchange), strings.Title(apiType)),
			Description: fmt.Sprintf("OpenAPI specification for %s cryptocurrency exchange - %s API", strings.Title(exchange), strings.Title(apiType)),
			Version:     version,
		},
		Servers: openapiServers,
		Paths: openapi3.NewPaths(),
		Components: &openapi3.Components{
			Schemas:   make(openapi3.Schemas),
			Responses: make(openapi3.ResponseBodies),
		},
	}

	// Read all endpoint specs from the endpoints directory
	baseDir := filepath.Join(g.outputDir, exchange, apiType)
	// Read all files in the paths directory
	files, err := os.ReadDir(baseDir)
	if err != nil {
		return fmt.Errorf("reading paths directory: %w", err)
	}
	// Sort files by name
	sort.Slice(files, func(i, j int) bool {
		return files[i].Name() < files[j].Name()
	})

	for _, file := range files {
		// Read each pathItem spec, load yaml file into map[string]*openapi3.PathItem
		endpointSpec, err := openapi3.NewLoader().LoadFromFile(filepath.Join(baseDir, file.Name()))
		if err != nil {
			return fmt.Errorf("opening endpoint spec: %w", err)
		}

		// Update spec with paths
		for k, v := range endpointSpec.Paths.Map() {
			if pathItem := spec.Paths.Value(k); pathItem != nil {
				if v.Get != nil {
					if pathItem.Get != nil {
						return fmt.Errorf("duplicate path: GET %s", k)
					}
					pathItem.Get = v.Get
				}
				if v.Post != nil {
					if pathItem.Post != nil {
						return fmt.Errorf("duplicate path: POST %s", k)
					}
					pathItem.Post = v.Post
				}
				if v.Put != nil {
					if pathItem.Put != nil {
						return fmt.Errorf("duplicate path: PUT %s", k)
					}
					pathItem.Put = v.Put
				}
				if v.Delete != nil {
					if pathItem.Delete != nil {
						return fmt.Errorf("duplicate path: DELETE %s", k)
					}
					pathItem.Delete = v.Delete
				}
				if v.Patch != nil {
					if pathItem.Patch != nil {
						return fmt.Errorf("duplicate path: PATCH %s", k)
					}
					pathItem.Patch = v.Patch
				}
			} else {
				spec.Paths.Set(k, v)
			}
		}

		var schemas []string
		for k, v := range endpointSpec.Components.Schemas {
			if slices.Contains(schemas, k) {
				return fmt.Errorf("duplicate schema: %s", k)
			}
			schemas = append(schemas, k)
			spec.Components.Schemas[k] = v
		}
	}

	// Ensure output directory exists
	if err := os.MkdirAll(g.outputDir, 0755); err != nil {
		return fmt.Errorf("creating output directory: %w", err)
	}

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

// convertEndpointToPathItem converts a parser.Endpoint to an OpenAPI path item
func (g *Generator) convertEndpointToPathItem(endpoint *parser.Endpoint) *openapi3.PathItem {
	operation := &openapi3.Operation{
		Summary:     endpoint.Summary,
		Description: endpoint.Description,
		Tags:        endpoint.Tags,
		Parameters:  g.convertParameters(endpoint.Parameters, &endpoint.Schemas),
		OperationID: endpoint.OperationID,
		Responses:   &openapi3.Responses{},
		Deprecated:  endpoint.Deprecated,
	}
	// Add responses to the operation
	for code, resp := range g.convertResponses(endpoint.Responses, &endpoint.Schemas) {
		operation.Responses.Set(code, resp)
	}
	if endpoint.RequestBody != nil {
		operation.RequestBody = g.convertRequestBody(endpoint.RequestBody, &endpoint.Schemas)
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
func (g *Generator) convertParameters(params []*parser.Parameter, schemas *[]*parser.Schema) openapi3.Parameters {
	result := make(openapi3.Parameters, 0, len(params))
	for _, param := range params {
		var schema *openapi3.SchemaRef
		if param.Schema != nil {
			if param.Schema.Type == parser.ObjectType {
				*schemas = append(*schemas, param.Schema)
				schema = toSchemaRef(param.Schema.Title)
			}
			if schema == nil {
				schema = g.convertSchema(param.Schema)
			}
		}
		result = append(result, &openapi3.ParameterRef{
			Value: &openapi3.Parameter{
				Name:        param.Name,
				In:          param.In,
				Description: param.Description,
				Required:    param.Required,
				Schema:      schema,
			},
		})
	}
	return result
}

func toSchemaRef(name string) *openapi3.SchemaRef {
	return &openapi3.SchemaRef{
		Ref: fmt.Sprintf("#/components/schemas/%s", name),
	}
}

// convertRequestBody converts a parser request body to an OpenAPI request body
func (g *Generator) convertRequestBody(body *parser.RequestBody, schemas *[]*parser.Schema) *openapi3.RequestBodyRef {
	content := make(openapi3.Content)
	for mediaType, mt := range body.Content {
		var schema *openapi3.SchemaRef
		if mt.Schema != nil && mt.Schema.Type == parser.ObjectType {
			*schemas = append(*schemas, mt.Schema)
			schema = toSchemaRef(mt.Schema.Title)
		} else {
			schema = g.convertSchema(mt.Schema)
		}
		content[mediaType] = &openapi3.MediaType{
			Schema: schema,
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
func (g *Generator) convertResponses(responses map[string]*parser.Response, schemas *[]*parser.Schema) map[string]*openapi3.ResponseRef {
	result := make(map[string]*openapi3.ResponseRef)
	for code, response := range responses {
		content := make(openapi3.Content)
		for mediaType, mt := range response.Content {
			var schema *openapi3.SchemaRef
			if mt.Schema != nil && mt.Schema.Type == parser.ObjectType {
				*schemas = append(*schemas, mt.Schema)
				schema = toSchemaRef(mt.Schema.Title)
			} else if mt.Schema.Type == parser.ArrayType {
				if mt.Schema.Items != nil && mt.Schema.Items.Type == parser.ObjectType {
					*schemas = append(*schemas, mt.Schema.Items)
					schema = g.convertSchema(mt.Schema)
					schema.Value.Items = toSchemaRef(mt.Schema.Items.Title)
				}
			}
			if schema == nil {
				schema = g.convertSchema(mt.Schema)
			}
			content[mediaType] = &openapi3.MediaType{
				Schema: schema,
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
