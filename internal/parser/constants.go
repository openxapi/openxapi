package parser

// OpenAPI types
const (
	ObjectType  = "object"
	ArrayType   = "array"
	IntegerType = "integer"
	NumberType  = "number"
	StringType  = "string"
	BooleanType = "boolean"
	NullType    = "null"
)

// HTTP methods
const (
	MethodGet     = "GET"
	MethodPost    = "POST"
	MethodPut     = "PUT"
	MethodDelete  = "DELETE"
	MethodPatch   = "PATCH"
	MethodHead    = "HEAD"
	MethodOptions = "OPTIONS"
)

// Content types
const (
	ContentTypeFormUrlencoded = "application/x-www-form-urlencoded"
	ContentTypeJSON           = "application/json"
)
