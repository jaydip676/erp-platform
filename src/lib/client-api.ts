export class ApiClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

/** Clean float noise from every number the server sends (119.82999999999998 -> 119.83). */
function tidy(v: unknown): unknown {
  if (typeof v === "number") return Number.isInteger(v) ? v : Math.round((v + Number.EPSILON) * 10000) / 10000;
  if (Array.isArray(v)) return v.map(tidy);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tidy(x)]));
  return v;
}

// Master lists (sizes, items, brands, formulas...) change rarely but are needed by almost every page, and each
// request is a slow trip to the database. They are remembered for a minute and shared between pages; any
// save, post or delete made here clears them, so what you just changed always shows at once.
const MASTER_LISTS = /^\/api\/(catalog|product-types|masters\/(inventory|qualities|groups|batches|packing))(\?.*)?$/;
const MASTER_TTL = 60_000;
const remembered = new Map<string, { exp: number; data: Promise<unknown> }>();

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  if (method === "GET" && !opts.body && MASTER_LISTS.test(path)) {
    const hit = remembered.get(path);
    if (hit && hit.exp > Date.now()) return tidy(await hit.data) as T;
    const data = request(path, opts);
    remembered.set(path, { exp: Date.now() + MASTER_TTL, data });
    data.catch(() => remembered.delete(path));
    return tidy(await data) as T;
  }
  if (method !== "GET") {
    try {
      return tidy(await request(path, opts)) as T;
    } finally {
      remembered.clear();
    }
  }
  return tidy(await request(path, opts)) as T;
}

async function request(path: string, opts: RequestInit): Promise<unknown> {
  const headers = new Headers(opts.headers);
  if (!headers.has("Content-Type") && opts.body) headers.set("Content-Type", "application/json");

  const r = await fetch(path, { ...opts, headers, credentials: "include" });
  const text = await r.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiClientError(r.ok ? "Unexpected response" : "Server error");
    }
  }
  if (!r.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? String((data as { detail?: unknown }).detail || "") : "";
    throw new ApiClientError(detail || "Request failed");
  }
  return data;
}