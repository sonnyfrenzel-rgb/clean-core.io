/**
 * The response schema, enforced on this side too. OpenRouter is asked for strict
 * structured output, but an answer that is valid JSON and not a review — `{}`,
 * a missing verdict, an invented severity — would otherwise become a clean "go"
 * through the report's defaults (QA review of 2f9b128bafd4, finding a168a7065062).
 *
 * Supports exactly the subset REVIEW_SCHEMA uses: object with required and
 * additionalProperties:false, array with items, string (with enum), integer,
 * number. Returns the path of the first violation — a location in the schema,
 * never a value from the response — or null.
 */
export function firstViolation(schema, value, path = '$') {
  switch (schema.type) {
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return path;
      for (const key of schema.required || []) if (!(key in value)) return `${path}.${key}`;
      for (const key of Object.keys(value)) {
        const sub = schema.properties?.[key];
        if (!sub) {
          if (schema.additionalProperties === false) return `${path}.<unexpected>`;
          continue;
        }
        const v = firstViolation(sub, value[key], `${path}.${key}`);
        if (v) return v;
      }
      return null;
    }
    case 'array': {
      if (!Array.isArray(value)) return path;
      for (let i = 0; i < value.length; i++) {
        const v = firstViolation(schema.items, value[i], `${path}[${i}]`);
        if (v) return v;
      }
      return null;
    }
    case 'string':
      return typeof value === 'string' && (!schema.enum || schema.enum.includes(value)) ? null : path;
    case 'integer':
      return Number.isInteger(value) ? null : path;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : path;
    case undefined:
      return null; // a schema without a type constrains nothing
    default:
      return path;
  }
}
