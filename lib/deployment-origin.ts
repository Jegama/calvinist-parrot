export function trustedUrl(value: string | undefined): URL | null {
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash) return null;
  return url;
}

export function getDeploymentOrigin(): string | null {
  // A Preview can inherit the production APP_URL. Use only the Preview's configured host.
  if (process.env.VERCEL_ENV === "preview") {
    const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (!host || !/^[a-z0-9.-]+$/i.test(host)) return null;
    return trustedUrl(`https://${host}`)?.origin ?? null;
  }
  return trustedUrl(process.env.APP_URL)?.origin ?? null;
}
