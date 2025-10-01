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
  const componentMessages = (root && root.components && root.components.messages) ? root.components.messages : {};
  const componentMessageNamesPascal = new Set(Object.keys(componentMessages || {}).map(k => toPascalCase(k)));

  // First, always generate global component message models
  for (const compKey of Object.keys(componentMessages || {})) {
    if (generatedRefs.has(compKey)) continue;
    const compMsg = componentMessages[compKey] || {};
    // Resolve payload schema (direct or via $ref)
    let payloadSchema = compMsg && compMsg.payload ? compMsg.payload : null;
    if (payloadSchema && payloadSchema.$ref) {
      payloadSchema = resolveRef(root, payloadSchema.$ref) || payloadSchema;
    }
    const properties = payloadSchema && payloadSchema.properties ? payloadSchema.properties : null;
    const requiredArr = (payloadSchema && payloadSchema.required) || [];
    const requiredSet = new Set(Array.isArray(requiredArr) ? requiredArr : []);
    const propKeys = properties ? Object.keys(properties) : [];
    // Helper: map JSON schema to Go type; isEvt controls event-based naming for nested fields
    const isEvtTop = !!(compMsg && compMsg['x-event'] === true);
    const mapSchemaToGo = (schema, propName, isEvt, depth = 1) => {
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
          const tag = req.has(k) ? `json:\"${k}\"` : `json:\"${k},omitempty\"`;
          const desc = (props[k] && (props[k].description || '')) || '';
          const comment = desc ? ` // ${desc.replace(/\n/g, ' ')}` : '';
          const indent = '\t'.repeat(depth + 1);
          return `${indent}${fieldName} ${mapped.t} ${'`' + tag + '`'}${comment}`;
        });
        const indentOpen = '\t'.repeat(depth);
        const indentClose = '\t'.repeat(depth);
        const body = fields.length ? `\n${fields.join('\n')}\n${indentClose}` : `${indentClose}`;
        return { t: `struct {${body}}`, needsTime: innerNeedsTime };
      }
      return { t: 'interface{}', needsTime: false };
    };
    // Compute needsTime by scanning properties
    let needsTime = false;
    if (properties) {
      for (const k of Object.keys(properties)) {
        const mapped = mapSchemaToGo(properties[k], k, isEvtTop, 1);
        if (mapped.needsTime) { needsTime = true; break; }
      }
    }

    const modelName = toPascalCase(compKey);
    const fileBase = toSnakeCase(compKey);

    let content = '';
    content += `package models\n\n`;
    content += `import (\n`;
    content += `\t"encoding/json"\n`;
    if (needsTime) content += `\t"time"\n`;
    content += `)\n\n`;

    content += `// ${modelName} represents global message '#/components/messages/${compKey}'\n`;
    content += `type ${modelName} struct {\n`;
    if (propKeys.length === 0) { content += `\tRaw json.RawMessage ${'`json:"-"`'}\n`; }
    else {
      const isEvent = !!(compMsg && compMsg['x-event'] === true);
      const usedNames = new Set();
      for (const pk of propKeys) {
        const prop = properties[pk] || {};
        const mapped = mapSchemaToGo(prop, pk, isEvtTop);
        const goField = deriveGoFieldName(pk, prop, isEvtTop, usedNames);
        const tag = requiredSet.has(pk) ? `json:\"${pk}\"` : `json:\"${pk},omitempty\"`;
        const desc = (prop && (prop.description || '')) || '';
        const comment = desc ? ` // ${desc.replace(/\n/g, ' ')}` : '';
        content += `\t${goField} ${mapped.t} ${'`' + tag + '`'}${comment}\n`;
      }
    }
    content += `}\n\n`;

    if (propKeys.length === 0) {
      content += `func (m *${modelName}) UnmarshalJSON(b []byte) error { m.Raw = append(m.Raw[:0], b...); return nil }\n`;
    }

    files.push(
      <File name={`models/${fileBase}.go`} key={`components-${compKey}`}>
        <Text>{content}</Text>
      </File>
    );
    generatedRefs.add(compKey);
  }

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
        const properties = payloadSchema && payloadSchema.properties ? payloadSchema.properties : null;
        const propKeys = properties ? Object.keys(properties) : [];
        const needsTime = propKeys.some(k => /time/i.test(k));

        let content = '';
        content += `package models\n\n`;
        content += `import (\n`;
        content += `\t"encoding/json"\n`;
        if (needsTime) content += `\t"time"\n`;
        content += `)\n\n`;

        content += `// ${modelName} represents referenced message '${refName}'\n`;
        content += `type ${modelName} struct {\n`;
        if (propKeys.length === 0) {
          content += `\tRaw json.RawMessage ${'`json:"-"`'}\n`;
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
              const fields = Object.keys(props).map((kk) => { const mm = map(props[kk], kk); if (mm.needsTime) innerNeeds = true; const fn = deriveGoFieldName(kk, props[kk], false, usedInner); const tg = req.has(kk) ? `json:\\"${kk}\\"` : `json:\\"${kk},omitempty\\"`; const desc = (props[kk] && (props[kk].description || '')) || ''; const c = desc ? ` // ${desc.replace(/\\n/g, ' ')}` : ''; return `\\t${fn} ${mm.t} ${'`' + tg + '`'}${c}`; });
              const body = fields.length ? `\\n${fields.join('\\n')}\\n` : '';
              return { t: `struct {${body}\\t}`, needsTime: innerNeeds };
            }
            return { t: 'interface{}', needsTime: false };
          };
          const isEvent = !!(componentMessages && componentMessages[refName] && componentMessages[refName]['x-event'] === true);
          const usedNames = new Set();
          for (const pk of propKeys) {
            const prop = properties[pk] || {};
            const mapped = map(prop, pk);
            const goField = deriveGoFieldName(pk, prop, isEvent, usedNames);
            const tag = requiredSet.has(pk) ? `json:\"${pk}\"` : `json:\"${pk},omitempty\"`;
            const desc = (prop && (prop.description || '')) || '';
            const comment = desc ? ` // ${desc.replace(/\n/g, ' ')}` : '';
            content += `\t${goField} ${mapped.t} ${'`' + tag + '`'}${comment}\n`;
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
      content += `import (\n`;
      content += `\t"encoding/json"\n`;
      if (needsTime) content += `\t"time"\n`;
      content += `)\n\n`;

      content += `// ${structName} represents message '${msgKey}' on channel '${channelKey}'\n`;
      content += `type ${structName} struct {\n`;
      if (propKeys.length === 0) {
        content += `\tRaw json.RawMessage ${'`json:"-"`'}\n`;
      } else {
        for (const pk of propKeys) {
          const goField = toPascalCase(pk);
          const tag = `json:"${pk},omitempty"`;
          content += `\t${goField} interface{} ${'`' + tag + '`'}\n`;
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
