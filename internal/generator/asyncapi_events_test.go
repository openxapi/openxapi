package generator

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEnsureEventTypeConst_EventWrapper(t *testing.T) {
	g := &Generator{}

	schema := &AsyncAPISchema{
		Properties: map[string]*AsyncAPISchema{
			"event": {
				Properties: map[string]*AsyncAPISchema{
					"e": {
						Type: "string",
						Enum: []interface{}{"executionReport"},
					},
				},
			},
		},
	}

	g.ensureEventTypeConst(schema, "executionReport")

	eventSchema := schema.Properties["event"]
	require.NotNil(t, eventSchema)
	eProperty := eventSchema.Properties["e"]
	require.NotNil(t, eProperty)
	require.Equal(t, "executionReport", eProperty.Const)
	require.Nil(t, eProperty.Enum)
}

func TestEnsureEventTypeConst_RootField(t *testing.T) {
	g := &Generator{}

	schema := &AsyncAPISchema{
		Properties: map[string]*AsyncAPISchema{
			"e": {
				Type:    "string",
				Example: "listStatus",
			},
		},
	}

	g.ensureEventTypeConst(schema, "listStatus")

	eProperty := schema.Properties["e"]
	require.NotNil(t, eProperty)
	require.Equal(t, "listStatus", eProperty.Const)
}

func TestEnsureEventTypeConst_PreservesExistingConst(t *testing.T) {
	g := &Generator{}

	schema := &AsyncAPISchema{
		Properties: map[string]*AsyncAPISchema{
			"event": {
				Properties: map[string]*AsyncAPISchema{
					"e": {
						Type:  "string",
						Const: "balanceUpdate",
					},
				},
			},
		},
	}

	g.ensureEventTypeConst(schema, "executionReport")

	eProperty := schema.Properties["event"].Properties["e"]
	require.Equal(t, "balanceUpdate", eProperty.Const)
}
