import { File, Text } from '@asyncapi/generator-react-sdk';

function toPascalCase(str) {
  if (!str) return '';
  const spaced = String(str).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced
    .split(/[^a-zA-Z0-9]+|\s+/)
    .filter(Boolean)
    .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');
}

function asArray(val) {
  if (Array.isArray(val)) return val.filter(v => v !== null && v !== undefined).map(String);
  if (val === null || val === undefined) return [];
  return [String(val)];
}

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'main';
  const moduleName = params.moduleName || 'websocket-sdk';
  const root = (typeof asyncapi.json === 'function') ? asyncapi.json() : {};
  const messages = (root && root.components && root.components.messages) ? root.components.messages : {};

  // Collect event entries with stream metadata
  const entries = [];
  Object.entries(messages || {}).forEach(([msgKey, msgVal]) => {
    if (!msgVal || typeof msgVal !== 'object') return;
    // only consider event messages
    const isEvent = !!msgVal['x-event'];
    if (!isEvent) return;
    const patterns = [
      ...asArray(msgVal['x-stream-pattern']),
      // allow legacy/compat multiple patterns field
      ...(Array.isArray(msgVal['x-stream-patterns']) ? msgVal['x-stream-patterns'].map(String) : [])
    ].filter(Boolean);
    const examples = asArray(msgVal['x-stream-example']);
    const speeds = asArray(msgVal['x-update-speed']);
    // If nothing to surface, skip
    if (!patterns.length && !examples.length && !speeds.length) return;
    const namePascal = toPascalCase(msgKey);
    // x-stream-params: map of placeholder -> schema or $ref
    let params = {};
    try {
      if (msgVal['x-stream-params'] && typeof msgVal['x-stream-params'] === 'object') {
        params = msgVal['x-stream-params'];
      }
    } catch (e) {}
    entries.push({ key: msgKey, name: namePascal, patterns, examples, speeds, params });
  });

  // If nothing to emit, skip generating the file to avoid unused imports
  if (!entries.length) {
    return null;
  }

  // Build body content (header/imports are added after we know if models import is needed)
  let body = '';

  // Determine needed imports
  const needsFmt = true; // builder returns errors
  const needsStrings = true; // placeholder replacement
  let needsModelsImport = false; // only if typed params use models

  // we will append models import later if needed
  let importLines = [];
  if (needsFmt) importLines.push('\t"fmt"');
  if (needsStrings) importLines.push('\t"strings"');

  // Helper: placeholder replacement
  body += `// buildFromPattern replaces {placeholders} in pattern with provided values\n`;
  body += `func buildFromPattern(pattern string, values map[string]string) (string, error) {\n`;
  body += `\tif values == nil { values = map[string]string{} }\n`;
  body += `\tvar b strings.Builder\n`;
  body += `\tfor i := 0; i < len(pattern); {\n`;
  body += `\t\topen := strings.IndexByte(pattern[i:], '{')\n`;
  body += `\t\tif open < 0 { b.WriteString(pattern[i:]); break }\n`;
  body += `\t\topen += i\n`;
  body += `\t\tb.WriteString(pattern[i:open])\n`;
  body += `\t\tclose := strings.IndexByte(pattern[open+1:], '}')\n`;
  body += `\t\tif close < 0 { \n`;
  body += `\t\t\t// unmatched '{' - write the rest and stop\n`;
  body += `\t\t\tb.WriteString(pattern[open:])\n`;
  body += `\t\t\tbreak\n`;
  body += `\t\t}\n`;
  body += `\t\tclose += open + 1\n`;
  body += `\t\tkey := pattern[open+1:close]\n`;
  body += `\t\tval, ok := values[key]\n`;
  body += `\t\tif !ok { return "", fmt.Errorf("missing value for placeholder '%s'", key) }\n`;
  body += `\t\tb.WriteString(val)\n`;
  body += `\t\ti = close + 1\n`;
  body += `\t}\n`;
  body += `\treturn b.String(), nil\n`;
  body += `}\n\n`;

  // Generic helper: contains string
  body += `func containsString(list []string, v string) bool {\n`;
  body += `\tfor _, s := range list { if s == v { return true } }\n`;
  body += `\treturn false\n`;
  body += `}\n\n`;

  // Helper to resolve $ref to raw schema
  function resolveRef(ref) {
    if (!ref || typeof ref !== 'string' || !ref.startsWith('#/')) return null;
    const parts = ref.slice(2).split('/');
    let cur = root;
    for (const p of parts) { if (!cur) return null; cur = cur[p]; }
    return cur || null;
  }

  // Map JSON schema to Go primitive string type for stringification
  function mapSchemaToGoPrimitive(sch) {
    if (!sch || typeof sch !== 'object') return { t: 'string' };
    if (sch.$ref) {
      const resolved = resolveRef(sch.$ref);
      return mapSchemaToGoPrimitive(resolved || {});
    }
    const typ = sch.type || (sch.properties ? 'object' : (sch.items ? 'array' : 'string'));
    const format = sch.format;
    if (typ === 'integer') {
      if (format === 'int64' || format === 'long') return { t: 'int64' };
      if (format === 'int32') return { t: 'int32' };
      return { t: 'int' };
    }
    if (typ === 'number') {
      if (format === 'float32') return { t: 'float32' };
      return { t: 'float64' };
    }
    if (typ === 'boolean') return { t: 'bool' };
    // arrays/objects default to string; caller should provide already-formatted values
    return { t: 'string' };
  }

  // Emit per-event metadata and builders
  entries.forEach(({ name, patterns, examples, speeds, params }) => {
    // Vars: patterns/examples
    const patList = patterns.map(p => JSON.stringify(String(p)) ).join(', ');
    const exList = examples.map(e => JSON.stringify(String(e)) ).join(', ');
    body += `// ${name} stream metadata (patterns, examples${speeds.length ? ', update speeds' : ''})\n`;
    body += `var ${name}StreamPatterns = []string{ ${patList} }\n`;
    body += `var ${name}StreamExamples = []string{ ${exList} }\n`;
    if (speeds.length) {
      const spList = speeds.map(s => JSON.stringify(String(s))).join(', ');
      body += `var ${name}UpdateSpeeds = []string{ ${spList} }\n`;
    }
    body += `\n`;

    // Optional typed speed alias and constants
    if (speeds.length) {
      body += `// ${name}Speed is a typed alias for supported update speeds\n`;
      body += `type ${name}Speed string\n`;
      // constants
      const consts = speeds.map((s) => {
        const raw = String(s);
        // Sanitize to alphanumeric for const suffix (e.g., "100ms" -> "100ms")
        const suffix = raw.replace(/[^a-zA-Z0-9]+/g, '');
        const constName = `${name}Speed${suffix}`;
        return { constName, raw };
      });
      const unique = [];
      const seen = new Set();
      consts.forEach(c => { if (!seen.has(c.constName)) { seen.add(c.constName); unique.push(c); } });
      unique.forEach(({ constName, raw }) => {
        body += `const ${constName} ${name}Speed = ${JSON.stringify(raw)}\n`;
      });
      body += `\n`;
      // Valid speeds list (typed)
      body += `var Valid${name}Speeds = []${name}Speed{ ` + unique.map(c => c.constName).join(', ') + ` }\n\n`;
      // Stringer
      body += `func (s ${name}Speed) String() string { return string(s) }\n\n`;
    }

    // Typed params struct based on x-stream-params
    const paramKeys = params && typeof params === 'object' ? Object.keys(params) : [];
    if (paramKeys.length) {
      // Struct
      body += `// ${name}StreamParams defines placeholders for stream patterns of ${name}\n`;
      body += `type ${name}StreamParams struct {\n`;
      paramKeys.forEach((pk) => {
        const sch = params[pk];
        const mapped = mapSchemaToGoPrimitive(sch);
        // Field name as PascalCase of key
        let fieldName = String(pk).split(/[^a-zA-Z0-9]+/).filter(Boolean).map(seg => seg.charAt(0).toUpperCase() + seg.slice(1)).join('');
        if (!/^[A-Za-z]/.test(fieldName)) fieldName = 'X' + fieldName;
        let fieldType = mapped.t;
        if (sch && sch.$ref && typeof sch.$ref === 'string' && sch.$ref.startsWith('#/components/schemas/')) {
          const tail = sch.$ref.split('/').pop();
          if (tail) {
            fieldType = `models.${toPascalCase(tail)}`;
            needsModelsImport = true;
          }
        }
        const comment = ` // ${pk}`;
        body += `\t${fieldName} ${fieldType}${comment}\n`;
      });
      body += `}\n\n`;

      // Values returns non-empty placeholder values as map[string]string for use with Build<Event>Stream/Streams
      body += `// Values returns non-empty placeholder values from params for ${name} patterns\n`;
      body += `func (p ${name}StreamParams) Values() map[string]string {\n`;
      body += `\tout := make(map[string]string)\n`;
      paramKeys.forEach((pk) => {
        const sch = params[pk];
        const mapped = mapSchemaToGoPrimitive(sch);
        let fieldName = String(pk).split(/[^a-zA-Z0-9]+/).filter(Boolean).map(seg => seg.charAt(0).toUpperCase() + seg.slice(1)).join('');
        if (!/^[A-Za-z]/.test(fieldName)) fieldName = 'X' + fieldName;
        if (mapped.t === 'string') {
          body += `\tif s := fmt.Sprint(p.${fieldName}); s != \"\" { out[\"${pk}\"] = s }\n`;
        } else if (mapped.t === 'bool') {
          body += `\tif v := p.${fieldName}; v { out[\"${pk}\"] = fmt.Sprint(v) }\n`;
        } else {
          body += `\tif p.${fieldName} != 0 { out[\"${pk}\"] = fmt.Sprint(p.${fieldName}) }\n`;
        }
      });
      body += `\treturn out\n`;
      body += `}\n\n`;
    }

    // Builder: single pattern by index
    body += `// Build${name}Stream builds a ${name} stream name using a pattern index and placeholder values\n`;
    body += `// Required placeholders depend on the selected pattern (see ${name}StreamPatterns).\n`;
    body += `func Build${name}Stream(patternIndex int, values map[string]string) (string, error) {\n`;
    body += `\tif patternIndex < 0 || patternIndex >= len(${name}StreamPatterns) { return "", fmt.Errorf("invalid pattern index") }\n`;
    body += `\tpat := ${name}StreamPatterns[patternIndex]\n`;
    body += `\treturn buildFromPattern(pat, values)\n`;
    body += `}\n\n`;

    // Builder: all satisfiable patterns
    body += `// Build${name}Streams attempts to build all ${name} stream names satisfiable by provided values\n`;
    body += `func Build${name}Streams(values map[string]string) ([]string, error) {\n`;
    body += `\tout := make([]string, 0, len(${name}StreamPatterns))\n`;
    body += `\tfor i := range ${name}StreamPatterns {\n`;
    body += `\t\tif s, err := Build${name}Stream(i, values); err == nil { out = append(out, s) }\n`;
    body += `\t}\n`;
    body += `\tif len(out) == 0 { return nil, fmt.Errorf("no patterns satisfied by provided values") }\n`;
    body += `\treturn out, nil\n`;
    body += `}\n\n`;
  });

  // Now finalize imports including models if needed
  if (needsModelsImport) importLines.push(`\t"${moduleName}/models"`);
  let content = '';
  content += `package ${packageName}\n\n`;
  content += 'import (\n' + importLines.join('\n') + '\n)\n\n';
  content += body;

  return (
    <File name="streams.go">
      <Text>{content}</Text>
    </File>
  );
}
