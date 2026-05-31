const LOCAL_DEV_ADMIN_APPWRITE_USER_ID = "6a12dbce0025c3f5dbb1";
const LOCAL_DEV_ADMIN_EMAIL = "test@test.com";

type AdminUserLike = {
  $id?: string | null;
  email?: string | null;
} | null | undefined;

type ServerAdminInput = {
  request?: Request;
  user?: AdminUserLike;
  userId?: string | null;
};

function isLocalHostName(hostname: string | null | undefined) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function getRequestHostName(request: Request | undefined) {
  if (!request) return null;

  try {
    return new URL(request.url).hostname;
  } catch {
    const host = request.headers.get("host");
    return host?.split(":")[0] ?? null;
  }
}

function getLocalDevAdminUserId() {
  return isLocalRuntime() ? LOCAL_DEV_ADMIN_APPWRITE_USER_ID : null;
}

function getExplicitUserId(user: AdminUserLike, fallbackUserId?: string | null) {
  return user?.$id || fallbackUserId || null;
}

function isLocalAdminUser(user: AdminUserLike, fallbackUserId?: string | null) {
  const userId = getExplicitUserId(user, fallbackUserId);
  const email = user?.email?.toLowerCase() ?? null;

  return userId === LOCAL_DEV_ADMIN_APPWRITE_USER_ID || email === LOCAL_DEV_ADMIN_EMAIL;
}

function isLocalRuntime(request?: Request) {
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;

  if (typeof window !== "undefined") {
    return isLocalHostName(window.location.hostname);
  }

  return isLocalHostName(getRequestHostName(request));
}

export function getClientAdminUserId() {
  return process.env.NEXT_PUBLIC_ADMIN_ID || getLocalDevAdminUserId();
}

export function getServerAdminUserId(request?: Request) {
  return process.env.ADMIN_ID || (isLocalRuntime(request) ? LOCAL_DEV_ADMIN_APPWRITE_USER_ID : null);
}

export function isClientAdminUser(user: AdminUserLike) {
  const adminId = getClientAdminUserId();
  const userId = getExplicitUserId(user);

  if (adminId && userId === adminId) return true;
  return isLocalRuntime() && isLocalAdminUser(user);
}

export function isClientAdminUserId(userId: string | null | undefined) {
  const adminId = getClientAdminUserId();
  return Boolean(adminId && userId === adminId);
}

export function isServerAdminUser({ request, user, userId }: ServerAdminInput) {
  const adminId = getServerAdminUserId(request);
  const explicitUserId = getExplicitUserId(user, userId);

  if (adminId && explicitUserId === adminId) return true;
  return isLocalRuntime(request) && isLocalAdminUser(user, userId);
}

export function isServerAdminUserId(userId: string | null | undefined, request?: Request) {
  return isServerAdminUser({ request, userId });
}
