const LOCAL_DEV_ADMIN_APPWRITE_USER_ID = "6a12dbce0025c3f5dbb1";

function getLocalDevAdminUserId() {
  return process.env.NODE_ENV === "development" ? LOCAL_DEV_ADMIN_APPWRITE_USER_ID : null;
}

export function getClientAdminUserId() {
  return process.env.NEXT_PUBLIC_ADMIN_ID || getLocalDevAdminUserId();
}

export function getServerAdminUserId() {
  return process.env.ADMIN_ID || getLocalDevAdminUserId();
}

export function isClientAdminUserId(userId: string | null | undefined) {
  const adminId = getClientAdminUserId();
  return Boolean(adminId && userId === adminId);
}

export function isServerAdminUserId(userId: string | null | undefined) {
  const adminId = getServerAdminUserId();
  return Boolean(adminId && userId === adminId);
}
