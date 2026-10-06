import { InvalidEventError, LimitExceededError } from './errors.js';
import type { JsonValue } from './types.js';

/** Snapshot at emission time and canonicalize object key order. Never call toJSON/getters. */
export function canonicalize(value: unknown, maxCharacters: number): string {
  const active = new Set<object>();
  let remaining = maxCharacters;
  const add = (part: string): string => {
    remaining -= part.length;
    if (remaining < 0) throw new LimitExceededError('Normalized output exceeds maxOutputCharacters.');
    return part;
  };
  const visit = (item: unknown, depth: number): string => {
    if (depth > 64) throw new InvalidEventError('Normalized JSON exceeds 64 levels of nesting.');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return add(JSON.stringify(item));
    if (typeof item === 'number' && Number.isFinite(item)) return add(JSON.stringify(item));
    if (typeof item !== 'object' || item === null) throw new InvalidEventError('Events must be finite JSON data. Use normalizeEvent for other values.');
    if (active.has(item)) throw new InvalidEventError('Cyclic events are unsupported. Use normalizeEvent.');
    if (Object.getOwnPropertySymbols(item).length) throw new InvalidEventError('Symbol keys are not JSON data. Use normalizeEvent.');
    active.add(item);
    let result: string;
    if (Array.isArray(item)) {
      const parts: string[] = [];
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
        if (!descriptor || !('value' in descriptor)) throw new InvalidEventError('Sparse arrays and accessors are not JSON data.');
        if (i) add(',');
        parts.push(visit(descriptor.value, depth + 1));
      }
      add('[]'); result = `[${parts.join(',')}]`;
    } else {
      const proto = Object.getPrototypeOf(item);
      if (proto !== Object.prototype && proto !== null) throw new InvalidEventError('Events must be plain JSON data. Use normalizeEvent for class instances.');
      const parts: string[] = [];
      for (const key of Object.keys(item).sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (!('value' in descriptor)) throw new InvalidEventError('Accessors are not JSON data. Use normalizeEvent.');
        if (parts.length) add(',');
        parts.push(`${add(JSON.stringify(key))}${add(':')}${visit(descriptor.value, depth + 1)}`);
      }
      add('{}'); result = `{${parts.join(',')}}`;
    }
    active.delete(item);
    return result;
  };
  return visit(value, 0);
}
export function snapshot(value: unknown, maxCharacters: number): { value: JsonValue; key: string } {
  const key = canonicalize(value, maxCharacters);
  return { value: JSON.parse(key) as JsonValue, key };
}
