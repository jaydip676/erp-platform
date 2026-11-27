/**
 * Small in-memory cache for master lists (items, brands, groups, recipes, product list…).
 * They change rarely but are read on almost every page, and each database trip costs time.
 * Any add, edit or delete on a master clears it, so lists are never stale on this server.
 * Kept on globalThis so dev reloads share one copy.
 */
type Entry = { p: Promise<unknown>; exp: number };
const g = globalThis as unknown as { __erpMasterCache?: Map<string, Entry> };
const store = (g.__erpMasterCache ??= new Map());

const TTL = 5 * 60_000;

/** The value for this key, from memory when it is fresh. Requests that arrive together share one query. */
export function cachedMaster<T>(key: string, load: () => Promise<T>, ttlMs = TTL): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.p as Promise<T>;
  const p = load();
  store.set(key, { p, exp: Date.now() + ttlMs });
  p.catch(() => store.delete(key));
  return p;
}

/** Clears every cached master list. Call after any change to master data. */
export function bustMasters() {
  store.clear();
}
