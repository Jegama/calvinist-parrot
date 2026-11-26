const consentPath = "/auth/mcp/consent";
const returnKey = "parrot.mcpConsentQuery";

// The normal email and Google flows both return to the same tab. Store only the
// query and reconstruct a fixed local path after login, never a redirect target.
export function rememberConsentRequest() {
  if (window.location.pathname === consentPath) sessionStorage.setItem(returnKey, window.location.search);
}

export function afterLoginPath() {
  try {
    const query = sessionStorage.getItem(returnKey);
    sessionStorage.removeItem(returnKey);
    return query?.startsWith("?") ? consentPath + query : "/";
  } catch {
    return "/";
  }
}
