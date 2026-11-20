export function createCache({ capacity, ttl, stale, now, load }) {
  return {
    async get(key) { return load(key); },
    put(key, value) {},
    invalidate(key) {},
    stats() { return {keys: [], inflight: 0}; },
  };
}
