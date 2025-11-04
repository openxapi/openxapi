import { File, Text } from '@asyncapi/generator-react-sdk';

function toPascalCase(str) {
  if (!str) return '';
  // Insert a space before capital letters to split camelCase, then split by non-alphanumerics
  const spaced = String(str).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced
    .split(/[^a-zA-Z0-9]+|\s+/)
    .filter(Boolean)
    .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');
}

function toSnakeCase(str) {
  return (str || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '')
}

function resolveRef(root, ref) {
  if (!ref || typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let cur = root;
  for (const p of parts) {
    if (!cur) return null;
    cur = cur[p];
  }
  return cur || null;
}

function findComponentMessageRef(obj) {
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    for (const k of Object.keys(cur)) {
      const v = cur[k];
      if (k === '$ref' && typeof v === 'string' && v.startsWith('#/components/messages/')) {
        return v;
      }
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

function normalizeDescription(desc) {
  if (!desc) return '';
  return String(desc).replace(/\(.*?\)/g, ' ').trim();
}

function deriveGoFieldName(key, schema, isEvent, usedNames) {
  const explicit = schema && (schema['x-go-name'] || schema['x-go-Name'] || schema['x-go_name']);
  let candidate;
  if (explicit) {
    candidate = toPascalCase(explicit);
  } else if (isEvent && schema && schema.description) {
    candidate = toPascalCase(normalizeDescription(schema.description));
  } else {
    candidate = toPascalCase(key);
  }
  // Ensure exported and valid identifier: if starts with non-letter, prefix with 'X'
  if (!/^[A-Za-z]/.test(candidate)) {
    candidate = 'X' + candidate;
  }
  if (!/^[A-Z]/.test(candidate)) {
    candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }
  if (!usedNames) return candidate;
  let base = candidate; let i = 2;
  while (usedNames.has(candidate)) { candidate = base + i; i++; }
  usedNames.add(candidate);
  return candidate;
}

export default function ({ asyncapi, params }) {
  const files = [];
  const root = (typeof asyncapi.json === 'function') ? asyncapi.json() : {};
  const channels = (root && root.channels) ? root.channels : {};
  const generatedRefs = new Set();
  const generatedSchemas = new Set();
  const componentMessages = (root && root.components && root.components.messages) ? root.components.messages : {};
  const componentSchemas = (root && root.components && root.components.schemas) ? root.components.schemas : {};
  const componentMessageNamesPascal = new Set(Object.keys(componentMessages || {}).map(k => toPascalCase(k)));

  // Build a stable string key for deep-equality comparison (sorted keys)
  function stableStringify(obj) {
    const seen = new WeakSet();
    const helper = (val) => {
      if (val && typeof val === 'object') {
        if (seen.has(val)) return '"__cycle__"';
        seen.add(val);
        if (Array.isArray(val)) return `[${val.map(helper).join(',')}]`;
        const keys = Object.keys(val).sort();
        return `{${keys.map(k => JSON.stringify(k)+':'+helper(val[k])).join(',')}}`;
      }
      return JSON.stringify(val);
    };
    return helper(obj);
  }

  // Map of component schema deep signature -> schemaName for dereferenced matching
  const schemaSignatureToName = (() => {
    const map = new Map();
    Object.entries(componentSchemas || {}).forEach(([name, sch]) => {
      // Only consider plain schema objects
      if (!sch || typeof sch !== 'object') return;
      map.set(stableStringify(sch), name);
    });
    return map;
  })();

  // Emit a struct model for a named component schema under #/components/schemas
function emitSchemaModel(schemaName, forceEvent = false) {
    if (!schemaName || generatedSchemas.has(schemaName)) return;
    const schema = componentSchemas && componentSchemas[schemaName];
    if (!schema || typeof schema !== 'object') return;
    const modelName = toPascalCase(schemaName);
    const fileBase = toSnakeCase(schemaName);
    const properties = schema.properties || {};
    const propKeys = Object.keys(properties || {});
    const requiredArr = Array.isArray(schema.required) ? schema.required : [];
    const requiredSet = new Set(requiredArr);
    const useDescNaming = !!(forceEvent || (schema && schema['x-event'] === true));
    const map = (sch, name) => {
      // Special-case the canonical request/response correlation field
      if (String(name) === 'id') { return { t: 'MessageID', needsTime: false }; }
      if (!sch) return { t: 'interface{}', needsTime: false };
      if (sch.$ref) { const r = resolveRef(root, sch.$ref); if (r) return map(r, name); }
      const type = sch.type || (sch.properties ? 'object' : (sch.items ? 'array' : undefined));
      const format = sch.format;
      if (type === 'string') { if (format === 'date-time' || format === 'date') return { t: 'time.Time', needsTime: true }; return { t: 'string', needsTime: false }; }
      if (type === 'integer') { if (format === 'int64' || format === 'long') return { t: 'int64', needsTime: false }; if (format === 'int32') return { t: 'int32', needsTime: false }; return { t: 'int', needsTime: false }; }
      if (type === 'number') { if (format === 'float32') return { t: 'float32', needsTime: false }; return { t: 'float64', needsTime: false }; }
      if (type === 'boolean') return { t: 'bool', needsTime: false };
      if (type === 'array') { const m = map(sch.items || {}, name + 'Item'); return { t: '[]' + m.t, needsTime: m.needsTime }; }
      if (type === 'object') {
        const props = sch.properties || {}; const req = new Set(Array.isArray(sch.required) ? sch.required : []);
        let innerNeeds = false; const usedInner = new Set();
        const fields = Object.keys(props).map((kk) => { const mm = map(props[kk], kk); if (mm.needsTime) innerNeeds = true; const fn = deriveGoFieldName(kk, props[kk], useDescNaming, usedInner); const tg = req.has(kk) ? `json:"${kk}"` : `json:"${kk},omitempty"`; const desc = (props[kk] && (props[kk].description || '')) || ''; const c = desc ? ` // ${desc.replace(/\n/g, ' ')}` : ''; return `	${fn} ${mm.t} ${'`' + tg + '`'}${c}`; });
        const body = fields.length ? `
${fields.join('\n')}
` : '';
        return { t: `struct {${body}}`, needsTime: innerNeeds };
      }
      return { t: 'interface{}', needsTime: false };
    };
    let needsTime = false;
    for (const k of propKeys) { const mm = map(properties[k], k); if (mm.needsTime) { needsTime = true; break; } }
    let content = '';
    content += `package models\n\n`;
    if (needsTime) {
content += `import (\n`;
    if (needsTime) content += `	"time"\n`;
    content += `)\n\n`;
}

    content += `// ${modelName} represents schema '#/components/schemas/${schemaName}'\n`;
    content += `type ${modelName} struct {\n`;
    if (!propKeys.length) { content += `	// no declared properties\n`; }
    else {
      const used = new Set();
propKeys.forEach((pk) => {
        const mm = map(properties[pk], pk);
        const isEvtSchema = !!(forceEvent || (schema && (schema['x-event'] === true || (schema.properties && (schema.properties.e || schema.properties.E)))));
        const fn = deriveGoFieldName(pk, properties[pk], isEvtSchema, used);
        const tg = requiredSet.has(pk) ? `json:"${pk}"` : `json:"${pk},omitempty"`;
        const desc = (properties[pk] && (properties[pk].description || '')) || '';
        const c = desc ? ` // ${desc.replace(/\n/g, ' ')}` : '';
        content += `	${fn} ${mm.t} ${'`' + tg + '`'}${c}\n`;
      });
    }
    content += `}\n\n`;
    files.push(
      <File name={`models/${fileBase}.go`} key={`schema-${schemaName}`}>
        <Text>{content}</Text>
      </File>
    );
    generatedSchemas.add(schemaName);
  }

  // First, always generate global component message models
  for (const compKey of Object.keys(componentMessages || {})) {
    if (generatedRefs.has(compKey)) continue;
    const compMsg = componentMessages[compKey] || {};
    // Resolve payload schema (direct or via $ref)
    let payloadSchema = compMsg && compMsg.payload ? compMsg.payload : null;
    if (payloadSchema && payloadSchema.$ref) {
      payloadSchema = resolveRef(root, payloadSchema.$ref) || payloadSchema;
    }
    const payloadType = payloadSchema && (payloadSchema.type || (payloadSchema.properties ? 'object' : (payloadSchema.items ? 'array' : undefined)));
    const properties = payloadSchema && payloadSchema.properties ? payloadSchema.properties : null;
    const requiredArr = (payloadSchema && payloadSchema.required) || [];
    const requiredSet = new Set(Array.isArray(requiredArr) ? requiredArr : []);
    const propKeys = properties ? Object.keys(properties) : [];
    // Helper: map JSON schema to Go type; preferDesc controls description-based naming for nested fields
    const preferDescTop = (function() {
      if (compMsg && Object.prototype.hasOwnProperty.call(compMsg, 'x-use-desc-naming')) {
        return !!compMsg['x-use-desc-naming'];
      }
      return !!(compMsg && compMsg['x-event'] === true);
    })();
    const mapSchemaToGo = (schema, propName, isEvt, depth = 1) => {
      // Special-case the canonical request/response correlation field
      if (String(propName) === 'id') { return { t: 'MessageID', needsTime: false } }
      let needsTimeLocal = false;
      if (!schema) return { t: 'interface{}', needsTime: false };
      // Resolve $ref
      if (schema.$ref) {
        const resolved = resolveRef(root, schema.$ref);
        if (resolved) return mapSchemaToGo(resolved, propName, isEvt);
      }
      const type = schema.type || (schema.properties ? 'object' : (schema.items ? 'array' : undefined));
      const format = schema.format;
      if (type === 'string') {
        if (format === 'date-time' || format === 'date') {
          needsTimeLocal = true; return { t: 'time.Time', needsTime: true };
        }
        return { t: 'string', needsTime: false };
      }
      if (type === 'integer') {
        if (format === 'int64' || format === 'long') return { t: 'int64', needsTime: false };
        if (format === 'int32') return { t: 'int32', needsTime: false };
        return { t: 'int', needsTime: false };
      }
      if (type === 'number') {
        if (format === 'float32') return { t: 'float32', needsTime: false };
        return { t: 'float64', needsTime: false };
      }
      if (type === 'boolean') return { t: 'bool', needsTime: false };
      if (type === 'array') {
        const itemSchema = schema.items || {};
        const mapped = mapSchemaToGo(itemSchema, propName + 'Item', isEvt, depth);
        return { t: `[]${mapped.t}`, needsTime: mapped.needsTime };
      }
      if (type === 'object') {
        const props = schema.properties || {};
        const req = new Set(Array.isArray(schema.required) ? schema.required : []);
        let innerNeedsTime = false;
        const usedInner = new Set();
        const fields = Object.keys(props).map((k) => {
          const mapped = mapSchemaToGo(props[k], k, isEvt, depth + 1);
          if (mapped.needsTime) innerNeedsTime = true;
          const fieldName = deriveGoFieldName(k, props[k], isEvt, usedInner);
          const tag = req.has(k) ? `json:"${k}"` : `json:"${k},omitempty"`;
          const desc = (props[k] && (props[k].description || '')) || '';
          const comment = desc ? ` // ${desc.replace(/\n/g, ' ')}` : '';
          const indent = '\t'.repeat(depth + 1).replace(/\\t/g, '\t');
          return `${indent}${fieldName} ${mapped.t} ${'`' + tag + '`'}${comment}`;
        });
        const indentOpen = '\t'.repeat(depth).replace(/\\t/g, '\t');
        const indentClose = '\t'.repeat(depth).replace(/\\t/g, '\t');
        const body = fields.length ? `\n${fields.join('\n')}\n${indentClose}` : `${indentClose}`;
        return { t: `struct {${body}}`, needsTime: innerNeedsTime };
      }
      return { t: 'interface{}', needsTime: false };
    };
    // Compute needsTime by scanning properties
    let needsTime = false;
    if (properties) {
      for (const k of Object.keys(properties)) {
        const mapped = mapSchemaToGo(properties[k], k, preferDescTop, 1);
        if (mapped.needsTime) { needsTime = true; break; }
      }
    }

    const modelName = toPascalCase(compKey);
    const fileBase = toSnakeCase(compKey);

    // Top-level array payloads -> emit slice types with proper item models
    if (payloadType === 'array') {
      const modelName = toPascalCase(compKey);
      const fileBase = toSnakeCase(compKey);
      const items = (payloadSchema && payloadSchema.items) || {};
      let itemType = 'interface{}';
      let needsTimeAlias = false;
      if (items && items.$ref && typeof items.$ref === 'string' && items.$ref.startsWith('#/components/schemas/')) {
        const tail = items.$ref.split('/').pop();
        emitSchemaModel(tail, preferDescTop);
        itemType = toPascalCase(tail);
      } else if (items && (items.type === 'object' || items.properties)) {
        // Inline item object: emit a named item struct alongside
        const itemName = `${modelName}Item`;
        const props = items.properties || {};
        const req = new Set(Array.isArray(items.required) ? items.required : []);
        const useDescNamingItem = preferDescTop;
        const map = (sch, name) => {
          if (String(name) === 'id') { return { t: 'MessageID', needsTime: false } }
          if (!sch) return { t: 'interface{}', needsTime: false };
          if (sch.$ref) { const r = resolveRef(root, sch.$ref); if (r) return map(r, name); }
          const type = sch.type || (sch.properties ? 'object' : (sch.items ? 'array' : undefined));
          const format = sch.format;
          if (type === 'string') { if (format === 'date-time' || format === 'date') return { t: 'time.Time', needsTime: true }; return { t: 'string', needsTime: false }; }
          if (type === 'integer') { if (format === 'int64' || format === 'long') return { t: 'int64', needsTime: false }; if (format === 'int32') return { t: 'int32', needsTime: false }; return { t: 'int', needsTime: false }; }
          if (type === 'number') { if (format === 'float32') return { t: 'float32', needsTime: false }; return { t: 'float64', needsTime: false }; }
          if (type === 'boolean') return { t: 'bool', needsTime: false };
          if (type === 'array') { const m = map(sch.items || {}, name + 'Item'); return { t: '[]' + m.t, needsTime: m.needsTime }; }
          if (type === 'object') {
            const p = sch.properties || {}; const rset = new Set(Array.isArray(sch.required) ? sch.required : []);
            let innerNeeds = false; const usedInner = new Set();
            const fields = Object.keys(p).map((kk) => { const mm = map(p[kk], kk); if (mm.needsTime) innerNeeds = true; const fn = deriveGoFieldName(kk, p[kk], useDescNamingItem, usedInner); const tg = rset.has(kk) ? `json:"${kk}"` : `json:"${kk},omitempty"`; const desc = (p[kk] && (p[kk].description || '')) || ''; const c = desc ? ` // ${desc.replace(/\n/g, ' ')}` : ''; return `	${fn} ${mm.t} ${'`' + tg + '`'}${c}`; });
            const body = fields.length ? `
${fields.join('\n')}
` : '';
            return { t: `struct {${body}}`, needsTime: innerNeeds };
          }
          return { t: 'interface{}', needsTime: false };
        };
        let needsTime = false; const used = new Set();
        const fields = Object.keys(props).map((kk) => { const mm = map(props[kk], kk); if (mm.needsTime) needsTime = true; const fn = deriveGoFieldName(kk, props[kk], useDescNamingItem, used); const tg = req.has(kk) ? `json:"${kk}"` : `json:"${kk},omitempty"`; const desc = (props[kk] && (props[kk].description || '')) || ''; const c = desc ? ` // ${desc.replace(/\n/g, ' ')}` : ''; return { line: `	${fn} ${mm.t} ${'`' + tg + '`'}${c}`, needsTime: mm.needsTime }; });
        let content = '';
        content += `package models\n\n`;
        if (needsTime) {
          content += `import (\n`;
          content += `	"time"\n`;
          content += `)\n\n`;
        }
        content += `// ${itemName} is the item type for ${modelName}\n`;
        content += `type ${itemName} struct {\n`;
        if (!fields.length) { content += `	// no declared properties\n`; }
        else { content += fields.map(f => f.line).join('\n') + "\n"; }
        content += `}\n\n`;
        content += `// ${modelName} is an array of ${itemName}\n`;
        content += `type ${modelName} []${itemName}\n`;
        files.push(
          <File name={`models/${fileBase}.go`} key={`components-${compKey}`}>
            <Text>{content}</Text>
          </File>
        );
        generatedRefs.add(compKey);
        continue;
      } else {
        // Primitive or unknown item, map to Go primitive
        const mapPrim = (sch) => {
          if (!sch) return { t: 'interface{}', needsTime: false };
          const type = sch.type; const format = sch.format;
          if (type === 'string') return { t: 'string', needsTime: false };
          if (type === 'integer') { if (format === 'int64' || format === 'long') return { t: 'int64', needsTime: false }; if (format === 'int32') return { t: 'int32', needsTime: false }; return { t: 'int', needsTime: false }; }
          if (type === 'number') { if (format === 'float32') return { t: 'float32', needsTime: false }; return { t: 'float64', needsTime: false }; }
          if (type === 'boolean') return { t: 'bool', needsTime: false };
          return { t: 'interface{}', needsTime: false };
        };
        const mm = mapPrim(items);
        itemType = mm.t; needsTimeAlias = mm.needsTime;
      }
      let content = '';
      content += `package models\n\n`;
      content += `// ${modelName} is an array payload message\n`;
      content += `type ${modelName} []${itemType}\n`;
      files.push(
        <File name={`models/${fileBase}.go`} key={`components-${compKey}`}>
          <Text>{content}</Text>
        </File>
      );
      generatedRefs.add(compKey);
      continue;
    }

    let content = '';
    content += `package models\n\n`;
    // Import only when needed to avoid unused imports
    const needsJSONImport = propKeys.length === 0;
    const isErrorMessage = !!(compMsg && compMsg['x-error'] === true && modelName === 'ErrorMessage');
    const importLines = [];
    if (needsJSONImport) importLines.push(`\t"encoding/json"`);
    if (needsTime) importLines.push(`\t"time"`);
    if (isErrorMessage) importLines.push(`\t"fmt"`);
    if (importLines.length) {
      content += `import (\n`;
      content += importLines.join('\n');
      content += `\n)\n\n`;
    }

    content += `// ${modelName} represents global message '#/components/messages/${compKey}'\n`;
    content += `type ${modelName} struct {\n`;
    if (propKeys.length === 0) { content += `	Raw json.RawMessage ${'`json:"-"`'}\n`; }
    else {
      const isEvent = !!(compMsg && compMsg['x-event'] === true);
      const usedNames = new Set();
      for (const pk of propKeys) {
        const prop = properties[pk] || {};
        const mapped = mapSchemaToGo(prop, pk, preferDescTop);
      let goField;
      if (isErrorMessage && pk === 'error') {
        goField = 'ErrorPayload';
        usedNames.add(goField);
      } else {
        goField = deriveGoFieldName(pk, prop, preferDescTop, usedNames);
      }
        const tag = requiredSet.has(pk) ? `json:"${pk}"` : `json:"${pk},omitempty"`;
        const desc = (prop && (prop.description || '')) || '';
        const comment = desc ? ` // ${desc.replace(/\n/g, ' ')}` : '';
        content += `	${goField} ${mapped.t} ${'`' + tag + '`'}${comment}\n`;
      }
    }
    content += `}\n\n`;

    if (propKeys.length === 0) {
      content += `func (m *${modelName}) UnmarshalJSON(b []byte) error { m.Raw = append(m.Raw[:0], b...); return nil }\n`;
    }
    if (isErrorMessage) {
      content += `\n// Error implements the error interface for ${modelName}\n`;
      content += `func (m *${modelName}) Error() string {\n`;
      content += `\tif m == nil {\n`;
      content += `\t\treturn \"\"\n`;
      content += `\t}\n`;
      content += `\tpayload := m.ErrorPayload\n`;
      content += `\tswitch {\n`;
      content += `\tcase payload.Msg != \"\" && payload.Code != 0:\n`;
      content += `\t\treturn fmt.Sprintf(\"%d: %s\", payload.Code, payload.Msg)\n`;
      content += `\tcase payload.Msg != \"\":\n`;
      content += `\t\treturn payload.Msg\n`;
      content += `\tcase payload.Code != 0:\n`;
      content += `\t\treturn fmt.Sprintf(\"%d\", payload.Code)\n`;
      content += `\tcase m.Status != 0:\n`;
      content += `\t\treturn fmt.Sprintf(\"status=%d\", m.Status)\n`;
      content += `\tdefault:\n`;
      content += `\t\treturn \"unknown error\"\n`;
      content += `\t}\n`;
      content += `}\n`;
    }

    files.push(
      <File name={`models/${fileBase}.go`} key={`components-${compKey}`}>
        <Text>{content}</Text>
      </File>
    );
    generatedRefs.add(compKey);
  }

  // Emit param alias types for schemas referenced by x-stream-params (components.messages and channel messages)
  try {
    const paramSchemaNames = new Set();
    // Helper to add a schema name based on value (handles $ref, deref via deep-signature, or placeholder fallback)
    const addByValue = (placeholderKey, val) => {
      if (!val || typeof val !== 'object') return;
      if (val.$ref && typeof val.$ref === 'string' && val.$ref.startsWith('#/components/schemas/')) {
        const tail = val.$ref.split('/').pop(); if (tail) { paramSchemaNames.add(tail); return; }
      }
      // Try to locate the component schema by deep signature (to handle dereferenced objects)
      const sig = stableStringify(val);
      const found = schemaSignatureToName.get(sig);
      if (found) { paramSchemaNames.add(found); return; }
      // Fallback: derive from placeholder key (ensures a type is still emitted)
      if (placeholderKey) paramSchemaNames.add(placeholderKey);
    };

    // Scan component messages
    Object.entries(componentMessages || {}).forEach(([key, msg]) => {
      try {
        const paramsMap = msg && msg['x-stream-params'];
        if (!paramsMap || typeof paramsMap !== 'object') return;
        Object.entries(paramsMap).forEach(([ph, val]) => addByValue(ph, val));
      } catch (e) {}
    });
    // Scan channel messages (resolve $ref to component message and check there too)
    Object.values(channels || {}).forEach((ch) => {
      const chMsgs = ch && ch.messages ? ch.messages : {};
      Object.values(chMsgs || {}).forEach((m) => {
        try {
          let msgJson = m;
          if (m && m.$ref && typeof m.$ref === 'string' && m.$ref.startsWith('#/components/messages/')) {
            const tail = m.$ref.split('/').pop();
            if (tail && componentMessages && componentMessages[tail]) msgJson = componentMessages[tail];
          }
          const paramsMap = msgJson && msgJson['x-stream-params'];
          if (!paramsMap || typeof paramsMap !== 'object') return;
          Object.entries(paramsMap).forEach(([ph, val]) => addByValue(ph, val));
        } catch (e) {}
      });
    });
    // Emit alias types for collected schemas
    paramSchemaNames.forEach((schemaNameRaw) => {
      // Normalize to actual component schema name if possible
      let schemaName = schemaNameRaw;
      if (!componentSchemas[schemaName] && typeof schemaName === 'string') {
        // Try PascalCase matching to component schema keys
        const pas = toPascalCase(schemaName);
        const foundKey = Object.keys(componentSchemas || {}).find(k => toPascalCase(k) === pas);
        if (foundKey) schemaName = foundKey;
      }
      if (generatedSchemas.has(schemaName)) return;
      const schema = componentSchemas && componentSchemas[schemaName];
      if (!schema || typeof schema !== 'object') return;
      const t = schema.type || (schema.properties ? 'object' : (schema.items ? 'array' : 'string'));
      let goType = null;
      if (t === 'string') goType = 'string';
      else if (t === 'integer') {
        const f = schema.format;
        if (f === 'int64' || f === 'long') goType = 'int64'; else if (f === 'int32') goType = 'int32'; else goType = 'int';
      } else if (t === 'number') {
        const f = schema.format; if (f === 'float32') goType = 'float32'; else goType = 'float64';
      } else if (t === 'boolean') goType = 'bool';
      if (!goType) return;
      const typeName = toPascalCase(schemaName);
      const fileBase = toSnakeCase(schemaName);
      const enums = Array.isArray(schema.enum) ? schema.enum.slice() : [];
      let content = '';
      content += `package models\n\n`;
      content += `// ${typeName} is a parameter model referenced by x-stream-params\n`;
      content += `type ${typeName} ${goType}\n\n`;
      if (enums.length) {
        content += `// ${typeName} enum values\n`;
        enums.forEach((ev) => {
          const raw = String(ev);
          const suffix = raw.replace(/[^a-zA-Z0-9]+/g, '');
          const constName = `${typeName}${suffix}`;
          if (goType === 'string') content += `const ${constName} ${typeName} = ${JSON.stringify(raw)}\n`;
          else if (goType.startsWith('int') || goType.startsWith('float')) content += `const ${constName} ${typeName} = ${raw}\n`;
          else if (goType === 'bool') content += `const ${constName} ${typeName} = ${raw === 'true' ? 'true' : 'false'}\n`;
        });
        content += `\n`;
      }
      files.push(
        <File name={`models/${fileBase}.go`} key={`param-alias-${schemaName}`}>
          <Text>{content}</Text>
        </File>
      );
      generatedSchemas.add(schemaName);
    });
  } catch (e) { /* ignore param alias generation errors */ }

  for (const channelKey of Object.keys(channels)) {
    const channelDef = channels[channelKey] || {};
    const channelPascal = toPascalCase(channelKey);
    const channelSnake = toSnakeCase(channelKey);
    const messages = channelDef.messages || {};

    for (const msgKey of Object.keys(messages)) {
      const msgDef = messages[msgKey] || {};

      // If this channel message ultimately references components/messages/X, only generate X once
      const directRef = (typeof msgDef.$ref === 'string') ? msgDef.$ref : null;
      const deepRef = !directRef ? findComponentMessageRef(msgDef) : null;
      const compRef = (directRef && directRef.startsWith('#/components/messages/')) ? directRef : (deepRef && deepRef.startsWith('#/components/messages/') ? deepRef : null);
      if (compRef) {
        const refName = compRef.split('/').pop();
        const modelName = toPascalCase(refName);
        const fileBase = toSnakeCase(refName);
        if (generatedRefs.has(refName)) {
          continue;
        }
        const messageResolved = resolveRef(root, compRef) || {};
        // Resolve payload schema (direct or via $ref)
        let payloadSchema = messageResolved && messageResolved.payload ? messageResolved.payload : null;
        if (payloadSchema && payloadSchema.$ref) {
          payloadSchema = resolveRef(root, payloadSchema.$ref) || payloadSchema;
        }
        const payloadType = payloadSchema && (payloadSchema.type || (payloadSchema.properties ? 'object' : (payloadSchema.items ? 'array' : undefined)));
        const properties = payloadSchema && payloadSchema.properties ? payloadSchema.properties : null;
        const propKeys = properties ? Object.keys(properties) : [];
        const needsTime = propKeys.some(k => /time/i.test(k));

        // Handle referenced component message with array payload
        if (payloadType === 'array') {
          const items = (payloadSchema && payloadSchema.items) || {};
          let itemType = 'interface{}';
          if (items && items.$ref && typeof items.$ref === 'string' && items.$ref.startsWith('#/components/schemas/')) {
            const tail = items.$ref.split('/').pop();
            const compMsgRef = componentMessages && componentMessages[refName];
            const preferDescRef = (compMsgRef && Object.prototype.hasOwnProperty.call(compMsgRef, 'x-use-desc-naming')) ? !!compMsgRef['x-use-desc-naming'] : !!(compMsgRef && compMsgRef['x-event'] === true);
            emitSchemaModel(tail, preferDescRef);
            itemType = toPascalCase(tail);
            let content = '';
            content += `package models\n\n`;
            content += `// ${modelName} is an array payload message\n`;
            content += `type ${modelName} []${itemType}\n`;
            files.push(
              <File name={`models/${fileBase}.go`} key={`components-${refName}`}>
                <Text>{content}</Text>
              </File>
            );
            generatedRefs.add(refName);
            continue;
          } else if (items && (items.type === 'object' || items.properties)) {
            // Inline item schema
            const itemName = `${modelName}Item`;
            const props = items.properties || {};
            const req = new Set(Array.isArray(items.required) ? items.required : []);
            const compMsgRef2 = componentMessages && componentMessages[refName];
            const useDescNamingItem = (compMsgRef2 && Object.prototype.hasOwnProperty.call(compMsgRef2, 'x-use-desc-naming')) ? !!compMsgRef2['x-use-desc-naming'] : !!(compMsgRef2 && compMsgRef2['x-event'] === true);
      const map = (sch, name) => {
        if (String(name) === 'id') { return { t: 'MessageID', needsTime: false } }
        if (!sch) return { t: 'interface{}', needsTime: false };
              if (sch.$ref) { const r = resolveRef(root, sch.$ref); if (r) return map(r, name); }
              const type = sch.type || (sch.properties ? 'object' : (sch.items ? 'array' : undefined));
              const format = sch.format;
              if (type === 'string') { if (format === 'date-time' || format === 'date') return { t: 'time.Time', needsTime: true }; return { t: 'string', needsTime: false }; }
              if (type === 'integer') { if (format === 'int64' || format === 'long') return { t: 'int64', needsTime: false }; if (format === 'int32') return { t: 'int32', needsTime: false }; return { t: 'int', needsTime: false }; }
              if (type === 'number') { if (format === 'float32') return { t: 'float32', needsTime: false }; return { t: 'float64', needsTime: false }; }
              if (type === 'boolean') return { t: 'bool', needsTime: false };
              if (type === 'array') { const m = map(sch.items || {}, name + 'Item'); return { t: '[]' + m.t, needsTime: m.needsTime }; }
              if (type === 'object') {
                const p = sch.properties || {}; const rset = new Set(Array.isArray(sch.required) ? sch.required : []);
                let innerNeeds = false; const usedInner = new Set();
              const fields = Object.keys(p).map((kk) => { const mm = map(p[kk], kk); if (mm.needsTime) innerNeeds = true; const fn = deriveGoFieldName(kk, p[kk], useDescNamingItem, usedInner); const tg = rset.has(kk) ? `json:"${kk}"` : `json:"${kk},omitempty"`; const desc = (p[kk] && (p[kk].description || '')) || ''; const c = desc ? ` // ${desc.replace(/\n/g, ' ')}` : ''; return `	${fn} ${mm.t} ${'`' + tg + '`'}${c}`; });
              const body = fields.length ? `
${fields.join('\n')}
` : '';
              return { t: `struct {${body}}`, needsTime: innerNeeds };
              }
              return { t: 'interface{}', needsTime: false };
            };
            let needsTime = false; const used = new Set();
            const fields = Object.keys(props).map((kk) => { const mm = map(props[kk], kk); if (mm.needsTime) needsTime = true; const fn = deriveGoFieldName(kk, props[kk], useDescNamingItem, used); const tg = req.has(kk) ? `json:"${kk}"` : `json:"${kk},omitempty"`; const desc = (props[kk] && (props[kk].description || '')) || ''; const c = desc ? ` // ${desc.replace(/\n/g, ' ')}` : ''; return { line: `	${fn} ${mm.t} ${'`' + tg + '`'}${c}`, needsTime: mm.needsTime }; });
            let content = '';
            content += `package models\n\n`;
            content += `import (\n`;
        if (needsTime) content += `	"time"\n`;
            content += `)\n\n`;
            content += `// ${itemName} is the item type for ${modelName}\n`;
            content += `type ${itemName} struct {\n`;
            if (!fields.length) { content += `\t// no declared properties\n`; }
            else { content += fields.map(f => f.line).join('\n') + "\n"; }
            content += `}\n\n`;
            content += `// ${modelName} is an array of ${itemName}\n`;
            content += `type ${modelName} []${itemName}\n`;
            files.push(
              <File name={`models/${fileBase}.go`} key={`components-${refName}`}>
                <Text>{content}</Text>
              </File>
            );
            generatedRefs.add(refName);
            continue;
          } else {
            // Primitive item
            const type = items && items.type;
            let goT = 'interface{}';
            if (type === 'string') goT = 'string';
            else if (type === 'integer') { const f = items.format; if (f === 'int64' || f === 'long') goT = 'int64'; else if (f === 'int32') goT = 'int32'; else goT = 'int'; }
            else if (type === 'number') { const f = items.format; if (f === 'float32') goT = 'float32'; else goT = 'float64'; }
            else if (type === 'boolean') goT = 'bool';
            let content = '';
            content += `package models\n\n`;
            content += `// ${modelName} is an array payload message\n`;
            content += `type ${modelName} []${goT}\n`;
            files.push(
              <File name={`models/${fileBase}.go`} key={`components-${refName}`}>
                <Text>{content}</Text>
              </File>
            );
            generatedRefs.add(refName);
            continue;
          }
        }

        let content = '';
        content += `package models\n\n`;
        // Import only when needed to avoid unused imports
        const needsJSONImport2 = propKeys.length === 0;
        if (needsJSONImport2 || needsTime) {
          content += `import (\n`;
          if (needsJSONImport2) content += `	"encoding/json"\n`;
          if (needsTime) content += `	"time"\n`;
          content += `)\n\n`;
        }

        content += `// ${modelName} represents referenced message '${refName}'\n`;
        content += `type ${modelName} struct {\n`;
        if (propKeys.length === 0) {
          content += `	Raw json.RawMessage ${'`json:"-"`'}\n`;
        } else {
          // Map fields with proper Go types and comments
          const requiredArr = (messageResolved && messageResolved.payload && messageResolved.payload.required) || [];
          const requiredSet = new Set(Array.isArray(requiredArr) ? requiredArr : []);
          const map = (schema, name) => {
            if (!schema) return { t: 'interface{}', needsTime: false };
            if (schema.$ref) { const r = resolveRef(root, schema.$ref); if (r) return map(r, name); }
            const type = schema.type || (schema.properties ? 'object' : (schema.items ? 'array' : undefined));
            const format = schema.format;
            if (type === 'string') { if (format === 'date-time' || format === 'date') return { t: 'time.Time', needsTime: true }; return { t: 'string', needsTime: false }; }
            if (type === 'integer') { if (format === 'int64' || format === 'long') return { t: 'int64', needsTime: false }; if (format === 'int32') return { t: 'int32', needsTime: false }; return { t: 'int', needsTime: false }; }
            if (type === 'number') { if (format === 'float32') return { t: 'float32', needsTime: false }; return { t: 'float64', needsTime: false }; }
            if (type === 'boolean') return { t: 'bool', needsTime: false };
            if (type === 'array') { const m = map(schema.items || {}, name + 'Item'); return { t: '[]' + m.t, needsTime: m.needsTime }; }
            if (type === 'object') {
              const props = schema.properties || {}; const req = new Set(Array.isArray(schema.required) ? schema.required : []);
              let innerNeeds = false; const usedInner = new Set();
              const fields = Object.keys(props).map((kk) => { const mm = map(props[kk], kk); if (mm.needsTime) innerNeeds = true; const fn = deriveGoFieldName(kk, props[kk], useDescNaming, usedInner); const tg = req.has(kk) ? `json:"${kk}"` : `json:"${kk},omitempty"`; const desc = (props[kk] && (props[kk].description || '')) || ''; const c = desc ? ` // ${desc.replace(/\n/g, ' ')}` : ''; return `	${fn} ${mm.t} ${'`' + tg + '`'}${c}`; });
              const body = fields.length ? `
${fields.join('\n')}
` : '';
              return { t: `struct {${body}}`, needsTime: innerNeeds };
            }
            return { t: 'interface{}', needsTime: false };
          };
          const compMsgRef3 = componentMessages && componentMessages[refName];
          const isEvent = (compMsgRef3 && Object.prototype.hasOwnProperty.call(compMsgRef3, 'x-use-desc-naming')) ? !!compMsgRef3['x-use-desc-naming'] : !!(compMsgRef3 && compMsgRef3['x-event'] === true);
          const usedNames = new Set();
          for (const pk of propKeys) {
            const prop = properties[pk] || {};
            const mapped = map(prop, pk);
            const goField = deriveGoFieldName(pk, prop, isEvent, usedNames);
            const tag = requiredSet.has(pk) ? `json:"${pk}"` : `json:"${pk},omitempty"`;
            const desc = (prop && (prop.description || '')) || '';
            const comment = desc ? ` // ${desc.replace(/\n/g, ' ')}` : '';
            content += `	${goField} ${mapped.t} ${'`' + tag + '`'}${comment}\n`;
          }
        }
        content += `}\n\n`;

        if (propKeys.length === 0) {
          content += `func (m *${modelName}) UnmarshalJSON(b []byte) error { m.Raw = append(m.Raw[:0], b...); return nil }\n`;
        }

        files.push(
          <File name={`models/${fileBase}.go`} key={`components-${refName}`}>
            <Text>{content}</Text>
          </File>
        );

        generatedRefs.add(refName);
        continue;
      }

      // Otherwise, treat as channel-scoped message and use ChannelName + MessageName
      // Resolve inline message definition and payload
      let messageResolved = msgDef;
      if (msgDef.$ref) {
        messageResolved = resolveRef(root, msgDef.$ref) || msgDef;
      }
      let payloadSchema = messageResolved && messageResolved.payload ? messageResolved.payload : null;
      if (payloadSchema && payloadSchema.$ref) {
        payloadSchema = resolveRef(root, payloadSchema.$ref) || payloadSchema;
      }

      // If a similarly-named component message exists (e.g., getProperty -> getPropertyRequest), skip channel-scoped generation
      const msgKeyPascal = toPascalCase(msgKey);
      // If the raw channel message is a direct $ref to a component message, skip channel-scoped generation
      if (typeof msgDef.$ref === 'string' && msgDef.$ref.startsWith('#/components/messages/')) {
        continue;
      }
      if (
        componentMessageNamesPascal.has(msgKeyPascal) ||
        componentMessageNamesPascal.has(`${msgKeyPascal}Request`) ||
        componentMessageNamesPascal.has(`${msgKeyPascal}Response`) ||
        componentMessageNamesPascal.has(`${msgKeyPascal}Message`)
      ) {
        continue;
      }
      // Also skip channel-scoped generation for any Request/Response message names to avoid duplicates when components define them
      if (/Request$/.test(msgKeyPascal) || /Response$/.test(msgKeyPascal)) {
        continue;
      }

      const structName = `${channelPascal}${msgKeyPascal}`;
      const fileName = `${channelSnake}_${toSnakeCase(msgKey)}.go`;
      const properties = payloadSchema && payloadSchema.properties ? payloadSchema.properties : null;
      const propKeys = properties ? Object.keys(properties) : [];
      const needsTime = propKeys.some(k => /time/i.test(k));

      let content = '';
      content += `package models\n\n`;
      // Import only when needed to avoid unused imports
      const needsJSONImport3 = propKeys.length === 0;
      if (needsJSONImport3 || needsTime) {
        content += `import (\n`;
        if (needsJSONImport3) content += `	"encoding/json"\n`;
        if (needsTime) content += `	"time"\n`;
        content += `)\n\n`;
      }

      content += `// ${structName} represents message '${msgKey}' on channel '${channelKey}'\n`;
      content += `type ${structName} struct {\n`;
      if (propKeys.length === 0) {
        content += `	Raw json.RawMessage ${'`json:"-"`'}\n`;
      } else {
        for (const pk of propKeys) {
          const goField = toPascalCase(pk);
          const tag = `json:"${pk},omitempty"`;
          content += `	${goField} interface{} ${'`' + tag + '`'}\n`;
        }
      }
      content += `}\n\n`;

      if (propKeys.length === 0) {
        content += `func (m *${structName}) UnmarshalJSON(b []byte) error { m.Raw = append(m.Raw[:0], b...); return nil }\n`;
      }

      files.push(
        <File name={`models/${fileName}`} key={`${channelKey}-${msgKey}`}>
          <Text>{content}</Text>
        </File>
      );
    }
  }

  return files;
}
