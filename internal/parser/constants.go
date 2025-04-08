package parser

// OpenAPI types
const (
	ObjectType        = "object"
	ArrayType         = "array"
	IntegerType       = "integer"
	NumberType        = "number"
	StringType        = "string"
	BooleanType       = "boolean"
	NullType          = "null"
	ArrayOfStringType = "array_of_string"
	ArrayOfArrayType  = "array_of_array"
	ArrayOfObjectType = "array_of_object"
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

// Security types
const (
	SecurityTypeApiKey = "apiKey"
)

// Security locations
const (
	SecurityLocationHeader = "header"
	SecurityLocationQuery  = "query"
	SecurityLocationCookie = "cookie"
)

// Content types
const (
	ContentTypeFormUrlencoded = "application/x-www-form-urlencoded"
	ContentTypeJSON           = "application/json"
)
