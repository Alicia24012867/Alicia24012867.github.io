import fs from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { repoRoot } from '../content/paths.mjs';

/** The blog API's contract, which the stand-in API, the checker and the build all follow. */
export const contractFile = path.join(repoRoot, 'docs/api/openapi.yaml');

const methods = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * The contract in `file`, with checks for its schemas and for each operation's answers. Every
 * problem reads as `<where in the value> <what is wrong>`.
 */
export function readContract(file = contractFile) {
  const document = parse(fs.readFileSync(file, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  // Files are bytes, not JSON, so there is nothing to check.
  ajv.addFormat('binary', true);
  ajv.addSchema({ $id: 'contract', components: { schemas: document.components.schemas } });

  const compiled = new Map();
  const compile = (schema) => {
    // Inline schemas name the shared ones from the document's root.
    const text = JSON.stringify(schema).replaceAll('"#/components/', '"contract#/components/');
    if (!compiled.has(text)) compiled.set(text, ajv.compile(JSON.parse(text)));
    return compiled.get(text);
  };
  const check = (validate, value) =>
    validate(value)
      ? []
      : validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`);

  const operations = new Map();
  for (const [pathname, item] of Object.entries(document.paths))
    for (const method of methods)
      if (item[method])
        operations.set(item[method].operationId, { pathname, method, ...item[method] });

  const resolve = (value) =>
    value?.$ref
      ? value.$ref
          .slice(2)
          .split('/')
          .reduce((node, key) => node[key.replaceAll('~1', '/').replaceAll('~0', '~')], document)
      : value;

  return {
    document,
    operations,
    /** Problems of `value` as the named schema, such as PrivateManifest; none when it fits. */
    validate(name, value) {
      return check(compile({ $ref: `#/components/schemas/${name}` }), value);
    },
    /**
     * What the contract says `operationId` answers with `status`: undefined when it never does,
     * else `types`, the content types it may have, and `validate(json)` for a JSON body.
     */
    answer(operationId, status) {
      const operation = operations.get(operationId);
      if (!operation) throw new Error(`No operation ${operationId} in the contract`);
      const response = resolve(operation.responses[String(status)]);
      if (!response) return undefined;
      const schema = response.content?.['application/json']?.schema;
      return {
        types: Object.keys(response.content ?? {}),
        validate: schema ? (value) => check(compile(schema), value) : () => [],
      };
    },
  };
}
