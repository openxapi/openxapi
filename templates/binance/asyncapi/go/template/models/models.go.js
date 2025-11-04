import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const moduleName = params.moduleName || 'binance-websocket-client';

  return (
    <File name="models.go">
      <Text>package models</Text>
      <Text newLines={2}>
        {`import (
\t"bytes"
\t"encoding/json"
\t"fmt"
\t"reflect"
\t"sync"
)

// MessageType represents the type of a WebSocket message
type MessageType string

// OneOfType represents a type that can hold one of multiple possible types
type OneOfType interface {
\tGetType() string
\tGetValue() interface{}
}

// ResponseRegistry manages all possible response types
type ResponseRegistry struct {
\ttypes   map[string]reflect.Type
\tcreators map[string]func() interface{}
\tmu      sync.RWMutex
}

// NewResponseRegistry creates a new response registry
func NewResponseRegistry() *ResponseRegistry {
\treturn &ResponseRegistry{
\t\ttypes:   make(map[string]reflect.Type),
\t\tcreators: make(map[string]func() interface{}),
\t}
}

// RegisterType registers a response type for dynamic parsing
func (r *ResponseRegistry) RegisterType(typeName string, typeInstance interface{}, creator func() interface{}) {
\tr.mu.Lock()
\tr.types[typeName] = reflect.TypeOf(typeInstance)
\tr.creators[typeName] = creator
\tr.mu.Unlock()
}

// CreateInstance creates a new instance of the registered type
func (r *ResponseRegistry) CreateInstance(typeName string) (interface{}, error) {
\tr.mu.RLock()
\tcreator, exists := r.creators[typeName]
\tr.mu.RUnlock()
\t
\tif !exists {
\t\treturn nil, fmt.Errorf("unknown type: %s", typeName)
\t}
\t
\treturn creator(), nil
}

// GetType returns the reflect.Type for a registered type name
func (r *ResponseRegistry) GetType(typeName string) (reflect.Type, bool) {
\tr.mu.RLock()
\ttyp, exists := r.types[typeName]
\tr.mu.RUnlock()
\treturn typ, exists
}

// ListTypes returns all registered type names
func (r *ResponseRegistry) ListTypes() []string {
\tr.mu.RLock()
\tnames := make([]string, 0, len(r.types))
\tfor name := range r.types {
\t\tnames = append(names, name)
\t}
\tr.mu.RUnlock()
\treturn names
}

// Global response registry instance
var GlobalRegistry = NewResponseRegistry()

// Common message parsing utilities
var (
\t// MessageTypeMap maps message IDs to their corresponding Go types
\tMessageTypeMap = make(map[string]reflect.Type)
)

// RegisterMessageType registers a message type for dynamic parsing
func RegisterMessageType(messageID string, messageType interface{}) {
\tMessageTypeMap[messageID] = reflect.TypeOf(messageType)
}

// ParseMessage parses a JSON message into the specified struct type
func ParseMessage[T any](data []byte, target *T) error {
\treturn json.Unmarshal(data, target)
}

// ParseDynamicMessage parses a message based on its ID
func ParseDynamicMessage(messageID string, data []byte) (interface{}, error) {
\tmsgType, exists := MessageTypeMap[messageID]
\tif !exists {
\t\treturn nil, fmt.Errorf("unknown message type: %s", messageID)
\t}
\t
\t// Create a new instance of the message type
\tmsg := reflect.New(msgType).Interface()
\terr := json.Unmarshal(data, msg)
\tif err != nil {
\t\treturn nil, fmt.Errorf("failed to parse message: %w", err)
\t}
\t
\treturn msg, nil
}

// ParseOneOfResult attempts to parse a oneOf result based on type detection
func ParseOneOfResult(data []byte) (interface{}, string, error) {
\tvar raw map[string]interface{}
\tif err := json.Unmarshal(data, &raw); err != nil {
\t\treturn nil, "", err
\t}
\t
\t// Check for event type field (common in Binance WebSocket events)
\tif eventType, exists := raw["e"]; exists {
\t\tif eventTypeStr, ok := eventType.(string); ok {
\t\t\t// Map event types to struct types
\t\t\tresponseType := mapEventTypeToStruct(eventTypeStr)
\t\t\tif responseType != "" {
\t\t\t\tinstance, err := GlobalRegistry.CreateInstance(responseType)
\t\t\t\tif err != nil {
\t\t\t\t\treturn nil, "", err
\t\t\t\t}
\t\t\t\t
\t\t\t\tif err := json.Unmarshal(data, instance); err != nil {
\t\t\t\t\treturn nil, "", err
\t\t\t\t}
\t\t\t\t
\t\t\t\treturn instance, responseType, nil
\t\t\t}
\t\t}
\t}
\t
\treturn nil, "", fmt.Errorf("unable to determine oneOf type")
}

// mapEventTypeToStruct maps Binance event types to Go struct types
func mapEventTypeToStruct(eventType string) string {
\t// This function is populated from event types declared in the AsyncAPI spec.
\t// When the spec omits explicit event identifiers, return empty string.
\treturn ""
}

// RegisterAllEventTypes registers all known event types with the global registry
func RegisterAllEventTypes() {
\t// Event types are registered here when provided by the specification.
}

// MessageValidator interface for messages that can validate themselves
type MessageValidator interface {
\tValidate() error
}

// ValidateMessage validates a message if it implements MessageValidator
func ValidateMessage(msg interface{}) error {
\tif validator, ok := msg.(MessageValidator); ok {
\t\treturn validator.Validate()
\t}
\treturn nil
}

// ResponseTypeDetector interface for responses that can identify their own type
type ResponseTypeDetector interface {
\tDetectType() string
}

// DetectResponseType attempts to detect the type of a response
func DetectResponseType(msg interface{}) string {
\tif detector, ok := msg.(ResponseTypeDetector); ok {
\t\treturn detector.DetectType()
\t}
\treturn fmt.Sprintf("%T", msg)
}

// init function to register all event types on package load
func init() {
\t// This will be called when the package is loaded
\t// Individual model files will call their registration functions
}

// MessageID represents a request/response id that can be either:
// - 64-bit signed integer
// - alphanumeric string (max length 36)
// - null
type MessageID struct {
\ti64   *int64
\tstr   *string
\tisNull bool
}

// NewMessageIDInt64 creates a MessageID from int64
func NewMessageIDInt64(v int64) MessageID { return MessageID{i64: &v} }

// NewMessageIDString creates a MessageID from string (<=36 chars)
func NewMessageIDString(v string) MessageID { return MessageID{str: &v} }

// NewMessageIDNull creates a null MessageID
func NewMessageIDNull() MessageID { return MessageID{isNull: true} }

// String returns a canonical string form used for correlation maps
func (m MessageID) String() string {
\tif m.isNull { return "" }
\tif m.str != nil { return *m.str }
\tif m.i64 != nil { return fmt.Sprintf("%d", *m.i64) }
\treturn ""
}

// MarshalJSON encodes MessageID as number, string, or null
func (m MessageID) MarshalJSON() ([]byte, error) {
\tif m.isNull { return []byte("null"), nil }
\tif m.str != nil { return json.Marshal(*m.str) }
\tif m.i64 != nil { return json.Marshal(*m.i64) }
\treturn []byte("null"), nil
}

// UnmarshalJSON decodes MessageID from number, string, or null
func (m *MessageID) UnmarshalJSON(b []byte) error {
\t// reset
\t*m = MessageID{}
\t// Handle null
\tif len(b) == 0 || string(b) == "null" { m.isNull = true; return nil }
\tdec := json.NewDecoder(bytes.NewReader(b))
\tdec.UseNumber()
\tvar v interface{}
\tif err := dec.Decode(&v); err != nil { return err }
\tswitch t := v.(type) {
\tcase json.Number:
\t\ti, err := t.Int64()
\t\tif err != nil { return fmt.Errorf("invalid id number: %w", err) }
\t\tm.i64 = &i
\t\treturn nil
\tcase string:
\t\tif len(t) > 36 { return fmt.Errorf("id string too long: %d", len(t)) }
\t\tm.str = &t
\t\treturn nil
\tdefault:
\t\treturn fmt.Errorf("invalid id type: %T", v)
\t}
}

// ValInt64 returns the int64 value and true if MessageID holds an integer; otherwise returns 0, false
func (m MessageID) ValInt64() (int64, bool) {
    if m.i64 != nil {
        return *m.i64, true
    }
    return 0, false
}

// ValString returns the string value and true if MessageID holds a string; otherwise returns "", false
func (m MessageID) ValString() (string, bool) {
    if m.str != nil {
        return *m.str, true
    }
    return "", false
}

// ValNull reports whether MessageID is explicitly null
func (m MessageID) ValNull() bool { return m.isNull }
`}
      </Text>
    </File>
  );
}
