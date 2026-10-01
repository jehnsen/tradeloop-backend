const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|hash/i;

export function redact<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE.test(key) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out as T;
}
