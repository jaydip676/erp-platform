import { toast } from "@/components/toast";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

// How many requests are running, for the loading bar at the top of the screen.
let pending = 0;
const pendingListeners = new Set<(n: number) => void>();
function setPending(n: number) {
  pending = n;
  pendingListeners.forEach((l) => l(pending));
}
export function onPending(fn: (n: number) => void) {
  pendingListeners.add(fn);
  fn(pending);
  return () => {
    pendingListeners.delete(fn);
  };
}

/** Extra options: quiet = do not show a toast when it fails (the screen shows the error itself). */
export type ApiOptions = { quiet?: boolean };

const TIMEOUT_MS = 45_000;

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

export async function api<T = unknown>(path: string, opts: RequestInit = {}, extra: ApiOptions = {}): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  try {
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
  } catch (e) {
    report(e, method, extra);
    throw e;
  }
}

/**
 * Every failed action (save, post, delete…) shows a toast. Failed page loads show one only when the
 * server or the connection failed, since a page handles "not found" or "no permission" itself.
 */
function report(e: unknown, method: string, extra: ApiOptions) {
  if (extra.quiet || typeof window === "undefined") return;
  const err = e instanceof ApiClientError ? e : new ApiClientError("Something went wrong. Try again.");
  if (err.status === 401) return; // handled by the redirect to the sign-in page
  if (method !== "GET" || err.status === 0 || err.status >= 500) toast.error(err.message);
}

async function request(path: string, opts: RequestInit): Promise<unknown> {
  const headers = new Headers(opts.headers);
  if (!headers.has("Content-Type") && opts.body) headers.set("Content-Type", "application/json");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  opts.signal?.addEventListener("abort", () => ctrl.abort());
  setPending(pending + 1);
  let r: Response;
  let text = "";
  try {
    r = await fetch(path, { ...opts, headers, credentials: "include", signal: ctrl.signal });
    text = await r.text();
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    if (ctrl.signal.aborted) throw new ApiClientError("The server is taking too long to answer. Check your connection and try again.", 0);
    throw new ApiClientError(
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "You are offline. Check your internet connection and try again."
        : "Could not reach the server. Check your connection and try again.",
      0,
    );
  } finally {
    clearTimeout(timer);
    setPending(Math.max(0, pending - 1));
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (r.ok) throw new ApiClientError("The server sent an unexpected answer. Try again.", r.status);
    }
  }
  if (!r.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? String((data as { detail?: unknown }).detail || "") : "";
    if (r.status === 401) {
      // Signed out or the session expired: back to the sign-in page (not from the sign-in page itself).
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        toast.warning("Your session has ended. Please sign in again.");
        setTimeout(() => window.location.assign("/login"), 900);
      }
      throw new ApiClientError(detail || "Please sign in again.", 401);
    }
    const fallback =
      r.status === 403 ? "You do not have permission for this."
      : r.status === 404 ? "Not found. It may have been deleted."
      : r.status === 409 ? "This was changed by someone else. Reload and try again."
      : r.status >= 500 ? "Something went wrong on the server. Try again in a moment."
      : "Request failed. Try again.";
    throw new ApiClientError(detail || fallback, r.status);
  }
  return data;
}
