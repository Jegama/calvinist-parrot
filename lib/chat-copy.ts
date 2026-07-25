const ALLOWED_ELEMENTS = new Set([
  "A",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "LI",
  "OL",
  "P",
  "PRE",
  "SPAN",
  "STRONG",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toAbsoluteClipboardUrl(url: string, baseUrl?: string) {
  const trimmedUrl = url.trim();
  if (
    !baseUrl ||
    !trimmedUrl ||
    /^\s*(?:javascript|data):/i.test(trimmedUrl)
  ) {
    return trimmedUrl;
  }

  try {
    return new URL(trimmedUrl, baseUrl).href;
  } catch {
    return trimmedUrl;
  }
}

export function absolutizeMarkdownLinks(markdown: string, baseUrl?: string) {
  if (!baseUrl) return markdown;

  return markdown.replace(
    /(!?\[[^\]]*\]\()(\s*)(<[^>\n]+>|[^\s)\n]+)([^)\n]*\))/g,
    (match, opening, spacing, destination, closing) => {
      const usesAngles = destination.startsWith("<") && destination.endsWith(">");
      const rawUrl = usesAngles ? destination.slice(1, -1) : destination;
      const absoluteUrl = toAbsoluteClipboardUrl(rawUrl, baseUrl);
      if (!absoluteUrl || absoluteUrl === rawUrl) return match;
      const resolvedDestination = usesAngles ? `<${absoluteUrl}>` : absoluteUrl;
      return `${opening}${spacing}${resolvedDestination}${closing}`;
    },
  );
}

export function markdownToPlainText(
  markdown: string,
  options: { baseUrl?: string } = {},
) {
  return absolutizeMarkdownLinks(markdown, options.baseUrl)
    .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function addNeutralSemanticStyles(element: Element) {
  const tag = element.tagName;
  if (tag === "TABLE") {
    element.setAttribute(
      "style",
      "border-collapse:collapse;width:100%;color:#000;background:#fff;",
    );
  } else if (tag === "TH" || tag === "TD") {
    element.setAttribute(
      "style",
      "border:1px solid #999;padding:6px;text-align:start;color:#000;background:#fff;",
    );
  } else if (tag === "PRE") {
    element.setAttribute(
      "style",
      "white-space:pre-wrap;font-family:monospace;color:#000;background:#f5f5f5;padding:8px;",
    );
  } else if (tag === "CODE") {
    element.setAttribute("style", "font-family:monospace;color:#000;");
  } else if (tag === "BLOCKQUOTE") {
    element.setAttribute(
      "style",
      "border-inline-start:3px solid #999;margin-inline-start:0;padding-inline-start:12px;color:#000;",
    );
  }
}

export function sanitizeClipboardHtml(
  html: string,
  options: {
    lang?: string;
    dir?: "auto" | "ltr" | "rtl";
    baseUrl?: string;
  } = {},
) {
  const lang = options.lang?.trim() || "en";
  const dir = options.dir ?? "auto";

  if (typeof DOMParser === "undefined") {
    const plainText = html.replace(/<[^>]*>/g, " ");
    return `<div lang="${escapeHtml(lang)}" dir="${dir}" style="color:#000;background:#fff;">${escapeHtml(plainText)}</div>`;
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  document
    .querySelectorAll(
      "script,style,svg,canvas,iframe,noscript,[hidden],[aria-hidden='true'],[data-clipboard-exclude]",
    )
    .forEach((element) => element.remove());

  Array.from(document.body.querySelectorAll("*")).forEach((element) => {
    if (element.tagName === "BUTTON") {
      unwrapElement(element);
      return;
    }
    if (!ALLOWED_ELEMENTS.has(element.tagName)) {
      unwrapElement(element);
      return;
    }

    const href = element.tagName === "A" ? element.getAttribute("href") : null;
    const elementLang = element.getAttribute("lang");
    const elementDir = element.getAttribute("dir");
    Array.from(element.attributes).forEach((attribute) => {
      element.removeAttribute(attribute.name);
    });

    if (href && !/^\s*javascript:/i.test(href)) {
      element.setAttribute(
        "href",
        toAbsoluteClipboardUrl(href, options.baseUrl),
      );
    }
    if (elementLang) element.setAttribute("lang", elementLang);
    if (elementDir === "ltr" || elementDir === "rtl" || elementDir === "auto") {
      element.setAttribute("dir", elementDir);
    }
    addNeutralSemanticStyles(element);
  });

  return `<div lang="${escapeHtml(lang)}" dir="${dir}" style="color:#000;background:#fff;font-family:Arial,sans-serif;">${document.body.innerHTML}</div>`;
}

export async function writeFormattedClipboard(html: string, plainText: string) {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.write &&
    typeof ClipboardItem !== "undefined"
  ) {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plainText], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    return;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plainText);
    return;
  }

  throw new Error("Clipboard access is unavailable.");
}

export function copySelectedMessageContent(
  event: ClipboardEvent,
  messageElement: HTMLElement,
) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  try {
    if (!range.intersectsNode(messageElement)) return false;
  } catch {
    return false;
  }

  const fragment = range.cloneContents();
  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  const plainTextWrapper = wrapper.cloneNode(true) as HTMLDivElement;
  plainTextWrapper.querySelectorAll("a[href]").forEach((anchor) => {
    const href = toAbsoluteClipboardUrl(
      anchor.getAttribute("href") ?? "",
      window.location.origin,
    );
    if (!href) return;
    anchor.replaceWith(
      document.createTextNode(`${anchor.textContent ?? ""} (${href})`),
    );
  });
  const plainText = plainTextWrapper.textContent || selection.toString();
  const html = sanitizeClipboardHtml(wrapper.innerHTML, {
    lang: document.documentElement.lang,
    dir: "auto",
    baseUrl: window.location.origin,
  });

  event.preventDefault();
  event.clipboardData?.setData("text/html", html);
  event.clipboardData?.setData("text/plain", plainText);
  return true;
}
