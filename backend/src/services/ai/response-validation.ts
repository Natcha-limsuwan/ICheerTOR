import type { Schema } from "@google/genai";

/** Provider responseSchema is not a substitute for validation at our boundary. */
export class ModelResponseError extends Error {
  constructor(path: string) { super(`Invalid model response at ${path}`); this.name = "ModelResponseError"; }
}

export function parseModelResponse<T>(text: string, schema: Schema): T {
  if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new ModelResponseError("response size");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new ModelResponseError("JSON"); }
  let nodes = 0;
  function validate(v: unknown, s: Schema, path: string, depth: number): void {
    if (++nodes > 50000 || depth > 32) throw new ModelResponseError("complexity");
    if (v === null && s.nullable) return;
    const type = String(s.type).toUpperCase();
    if (type === "OBJECT") {
      if (v === null || typeof v !== "object" || Array.isArray(v)) throw new ModelResponseError(path);
      const object = v as Record<string, unknown>;
      const properties = s.properties ?? {};
      for (const name of Object.keys(object)) {
        if (["__proto__", "prototype", "constructor"].includes(name) || !Object.hasOwn(properties, name)) throw new ModelResponseError(path + ".unexpected_field");
        validate(object[name], properties[name], path + "." + name, depth + 1);
      }
      for (const name of s.required ?? []) if (!Object.hasOwn(object, name)) throw new ModelResponseError(path + "." + name);
    } else if (type === "ARRAY") {
      if (!Array.isArray(v) || !s.items || v.length > Number(s.maxItems ?? 2000)) throw new ModelResponseError(path);
      v.forEach((item, i) => validate(item, s.items!, `${path}[${i}]`, depth + 1));
    } else if (type === "STRING") {
      if (typeof v !== "string" || v.length > Number(s.maxLength ?? 100000) || (s.enum && !s.enum.includes(v))) throw new ModelResponseError(path);
    } else if (type === "NUMBER" || type === "INTEGER") {
      if (typeof v !== "number" || !Number.isFinite(v) || (type === "INTEGER" && !Number.isInteger(v)) ||
          (s.minimum != null && v < s.minimum) || (s.maximum != null && v > s.maximum)) throw new ModelResponseError(path);
    } else if (type === "BOOLEAN") {
      if (typeof v !== "boolean") throw new ModelResponseError(path);
    } else throw new ModelResponseError(path + " schema");
  }
  validate(value, schema, "$", 0);
  return value as T;
}
