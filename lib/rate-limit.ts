const store = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function passwordAuthRateLimited(request: Request, action: "login" | "register", identifier: string) {
  const windowMs = 15 * 60_000;
  const ip = getClientIp(request);
  // Bound identifier rotation before admitting a new identifier into the store.
  if (!checkRateLimit(`password-${action}:ip:${ip}`, 50, windowMs)) return true;
  return !checkRateLimit(`password-${action}:id:${identifier.trim().toLowerCase()}`, 10, windowMs);
}
