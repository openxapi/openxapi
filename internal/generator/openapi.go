package generator

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	parser "github.com/openxapi/openxapi/internal/parser/rest"
	"github.com/sirupsen/logrus"
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
	baseDir := filepath.Join(g.outputDir, exchange, "openapi", apiType)
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
				Schemas:         make(openapi3.Schemas),
				SecuritySchemes: make(openapi3.SecuritySchemes),
			},
		}
		endpointSpec.Paths.Set(endpoint.Path, pathItem)
		for _, schema := range endpoint.Schemas {
			endpointSpec.Components.Schemas[schema.Title] = g.convertSchema(schema)
		}
		if endpoint.SecuritySchemas != nil {
			for name, schema := range endpoint.SecuritySchemas {
				endpointSpec.Components.SecuritySchemes[name] = g.convertSecuritySchema(schema)
			}
		}
		if err := g.writeSpec(endpointSpec, pathItemPath); err != nil {
			return fmt.Errorf("writing endpoint spec: %w", err)
		}
	}

	return nil
}

// Generate creates an OpenAPI specification from parsed endpoints
func (g *Generator) Generate(exchange, version, title, apiType string, servers []string) error {
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
			Title:       title,
			Description: fmt.Sprintf("OpenAPI specification for %s exchange - %s API", strings.Title(exchange), strings.Title(apiType)),
			Version:     version,
		},
		Servers: openapiServers,
		Paths:   openapi3.NewPaths(),
		Components: &openapi3.Components{
			Schemas:         make(openapi3.Schemas),
			Responses:       make(openapi3.ResponseBodies),
			SecuritySchemes: make(openapi3.SecuritySchemes),
		},
	}

	// Read all endpoint specs from the endpoints directory
	baseDir := filepath.Join(g.outputDir, exchange, "openapi", apiType)
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
			return fmt.Errorf("opening endpoint spec %s: %w", file.Name(), err)
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
				logrus.Debugf("duplicate schema found: %s", k)
				continue
			}
			schemas = append(schemas, k)
			spec.Components.Schemas[k] = v
		}
		var securitySchemas []string
		for k, v := range endpointSpec.Components.SecuritySchemes {
			if slices.Contains(securitySchemas, k) {
				logrus.Debugf("duplicate security schema found: %s", k)
				continue
			}
			securitySchemas = append(securitySchemas, k)
			spec.Components.SecuritySchemes[k] = v
		}
	}

	outputDir := filepath.Join(g.outputDir, exchange, "openapi")
	// Ensure output directory exists
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("creating output directory: %w", err)
	}

	outputPath := filepath.Join(outputDir, fmt.Sprintf("%s.yaml", apiType))
	if err := g.writeSpec(spec, outputPath); err != nil {
		return fmt.Errorf("writing specification: %w", err)
	}

	return nil
}

// convertSchema converts a parser.Schema to an OpenAPI schema
func (g *Generator) convertSchema(schema *parser.Schema) *openapi3.SchemaRef {
	if schema.Ref != "" {
		return &openapi3.SchemaRef{
			Ref: schema.Ref,
		}
	}
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
	// Add request body to the operation
	if endpoint.RequestBody != nil {
		operation.RequestBody = g.convertRequestBody(endpoint.RequestBody, &endpoint.Schemas)
	}
	// Add security requirements to the operation
	if endpoint.Security != nil {
		operation.Security = g.convertSecurityRequirements(endpoint.Security)
	}

	pathItem := &openapi3.PathItem{}
	switch endpoint.Method {
	case parser.MethodGet:
		pathItem.Get = operation
	case parser.MethodPost:
		pathItem.Post = operation
	case parser.MethodPut:
		pathItem.Put = operation
	case parser.MethodDelete:
		pathItem.Delete = operation
	case parser.MethodPatch:
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
			if param.Schema.Type == "" && param.Schema.Title != "" {
				schema = toSchemaRef(param.Schema.Title)
			} else if param.Schema.Type == parser.ObjectType {
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
		if mt.Schema != nil {
			if mt.Schema.Type == "" && mt.Schema.Title == "" {
				schema = toSchemaRef(mt.Schema.Title)
			} else if mt.Schema.Type == parser.ObjectType {
				*schemas = append(*schemas, mt.Schema)
				schema = toSchemaRef(mt.Schema.Title)
			} else {
				schema = g.convertSchema(mt.Schema)
			}
			content[mediaType] = &openapi3.MediaType{
				Schema: schema,
			}
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
			if mt.Schema != nil {
				if mt.Schema.Type == "" && mt.Schema.Title != "" {
					schema = toSchemaRef(mt.Schema.Title)
				} else if mt.Schema.Type == parser.ObjectType {
					// FIXME: check title
					*schemas = append(*schemas, mt.Schema)
					schema = toSchemaRef(mt.Schema.Title)
				} else if mt.Schema.Type == parser.ArrayType {
					// FIXME: check title
					*schemas = append(*schemas, mt.Schema)
					schema = toSchemaRef(mt.Schema.Title)
					if mt.Schema.Items != nil && mt.Schema.Items.Type == parser.ObjectType {
						// Deep copy the item schema to avoid mutating the original schema
						itemSchema := mt.Schema.Items
						copiedItemSchema := *itemSchema
						*schemas = append(*schemas, &copiedItemSchema)
						mt.Schema.Items.Ref = toSchemaRef(mt.Schema.Items.Title).Ref
					}
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

func (g *Generator) convertSecurityRequirements(securityRequirements []map[string][]string) *openapi3.SecurityRequirements {
	var result openapi3.SecurityRequirements
	for _, requirement := range securityRequirements {
		securityRequirement := make(openapi3.SecurityRequirement)
		for name, scopes := range requirement {
			securityRequirement[name] = scopes
		}
		result = append(result, securityRequirement)
	}
	return &result
}

// convertSecuritySchema converts parser security schema to OpenAPI security schema
func (g *Generator) convertSecuritySchema(securitySchema *parser.SecuritySchema) *openapi3.SecuritySchemeRef {
	return &openapi3.SecuritySchemeRef{
		Value: &openapi3.SecurityScheme{
			Type: securitySchema.Type,
			In:   securitySchema.In,
			Name: securitySchema.Name,
		},
	}
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
