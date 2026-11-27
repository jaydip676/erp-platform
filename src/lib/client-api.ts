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

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
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
  return tidy(data) as T;
}