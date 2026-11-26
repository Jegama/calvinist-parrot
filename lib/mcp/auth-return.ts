export const consentPath = "/auth/mcp/consent";
const returnKey = "parrot.mcpConsentQuery";

export function consentAuthHref(page: "/login" | "/register", query: string | null) {
  return query ? `${page}?${new URLSearchParams({ mcpConsent: query })}` : page;
}

// Keep a same-tab copy across Google sign-in and password recovery.
export function rememberConsentRequest(query: string | null) {
  if (query) {
    try {
      sessionStorage.setItem(returnKey, `?${query}`);
    } catch {
      // Password sign-in can still use the query in the link.
    }
  }
}

export function afterLoginPath(query?: string | null) {
  let search = query ? `?${query}` : null;
  try {
    search ??= sessionStorage.getItem(returnKey);
    sessionStorage.removeItem(returnKey);
  } catch {
    // Storage can be disabled in the browser.
  }
  return search?.startsWith("?") ? consentPath + search : "/";
}
