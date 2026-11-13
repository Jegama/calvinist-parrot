// @vitest-environment jsdom
import { act, useEffect, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  onChange: null as null | ((value: string) => void),
  params: { chatId: "performance-test" },
  router: { push: vi.fn() },
  search: new URLSearchParams(),
  chats: { chats: [], invalidate: vi.fn(), upsertChat: vi.fn(), removeChat: vi.fn(), renameChat: {}, deleteChat: {} },
  verseMounts: 0,
}));
vi.mock("next/navigation", () => ({ useParams: () => context.params, useRouter: () => context.router, useSearchParams: () => context.search }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-chat-list", () => ({ useChatList: () => context.chats }));
vi.mock("@/lib/api/contracts/chat", () => ({ getChatResponseSchema: { parse: (v: unknown) => v }, chatStreamEventSchema: { parse: (v: unknown) => v } }));
vi.mock("@/components/chat/chat-shell", () => ({ ChatShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/chat/chat-composer", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/chat/chat-composer")>();
  return { ...original, ChatComposer: (props: ComponentProps<typeof original.ChatComposer>) => {
    context.onChange = props.onChange;
    return <original.ChatComposer {...props} />;
  } };
});
vi.mock("@/components/chat/denomination-context-menu", () => ({ DenominationContextMenu: () => null }));
vi.mock("@/components/chat/edit-message-dialog", () => ({ EditMessageDialog: () => null }));
vi.mock("@/components/chat/message-actions", () => ({ MessageActions: () => null }));
vi.mock("react-markdown", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-markdown")>();
  return { ...original, default: vi.fn(original.default) };
});
vi.mock("@/components/BibleVerse", () => ({ BibleVerse: ({ reference }: { reference: string }) => {
  useEffect(() => { context.verseMounts++; }, []);
  return <span>{reference}</span>;
} }));

import ChatPage from "@/app/[chatId]/page";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";

describe("chat interaction rendering", () => {
  let root: Root;
  let container: HTMLDivElement;
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  let activeRequestId: string;
  const messages = Array.from({ length: 10 }, (_, i) => [
    { id: `u${i}`, sender: "user", content: `Question ${i}`, requestId: `r${i}` },
    { id: `a${i}`, sender: "parrot", content: `## Response ${i}\n\n${"Synthetic diagnostic paragraph. ".repeat(40)}`, requestId: `r${i}` },
  ]).flat();
  const transcript = () => ({ chat: { id: context.params.chatId, conversationName: "Test conversation", denomination: "reformed-baptist" }, messages });
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    HTMLElement.prototype.scrollTo = vi.fn();
    context.verseMounts = 0;
    context.params.chatId = "performance-test";
    stream = undefined;
    fetchMock = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).endsWith("/messages")) {
        activeRequestId = JSON.parse(String(options?.body)).requestId;
        return new Response(new ReadableStream<Uint8Array>({ start(controller) {
          stream = controller;
          options?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
        } }));
      }
      return Response.json(transcript());
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not reparse unchanged messages when typing into a loaded conversation", async () => {
    await act(async () => { root.render(<ChatPage />); });
    expect(container.querySelectorAll('[aria-label="Conversation turn"]')).toHaveLength(10);
    vi.mocked(ReactMarkdown).mockClear();
    for (const draft of ["x", "xy", "xyz"]) {
      await act(async () => { context.onChange!(draft); });
      expect(container.querySelector("textarea")?.value).toBe(draft);
      expect(ReactMarkdown).not.toHaveBeenCalled();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the composer mounted through loading and clears its draft when changing chats", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await act(async () => { root.render(<ChatPage />); });
    const textarea = container.querySelector("textarea")!;
    const status = container.querySelector('[role="status"]');
    expect(textarea.disabled).toBe(true);
    await act(async () => { resolve(Response.json(transcript())); });
    expect(container.querySelector("textarea")).toBe(textarea);
    expect(container.querySelector('[role="status"]')).toBe(status);
    expect(textarea.disabled).toBe(false);
    await act(async () => { context.onChange!("Old draft"); });
    context.params = { chatId: "different-chat" };
    await act(async () => { root.render(<ChatPage />); });
    expect(container.querySelector("textarea")?.value).toBe("");
  });

  it("submits the draft, updates only streaming Markdown, and retains stop recovery", async () => {
    await act(async () => { root.render(<ChatPage />); });
    await act(async () => { context.onChange!("  New question  "); });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const sent = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/messages"))!;
    expect(JSON.parse(String(sent[1]?.body)).message).toBe("New question");
    expect(container.querySelector("textarea")?.value).toBe("");
    expect(container.querySelector("textarea")?.disabled).toBe(true);
    for (const content of ["New answer", " continues"]) {
      vi.mocked(ReactMarkdown).mockClear();
      await act(async () => {
        stream!.enqueue(new TextEncoder().encode(JSON.stringify({ type: "parrot", requestId: activeRequestId, content }) + "\n"));
      });
      expect(ReactMarkdown).toHaveBeenCalledTimes(1);
    }
    expect(container.textContent).toContain("New answer continues");
    const stop = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Stop")!;
    await act(async () => { stop.click(); });
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/stop"))).toBe(true);
    expect(container.querySelector("textarea")?.disabled).toBe(false);
  });

  it("preserves Bible verse components as more answer text arrives", async () => {
    await act(async () => { root.render(<MarkdownWithBibleVerses content="Read John 3:16." />); });
    expect(context.verseMounts).toBe(1);
    await act(async () => { root.render(<MarkdownWithBibleVerses content="Read John 3:16. More explanation." />); });
    expect(context.verseMounts).toBe(1);
    expect(container.textContent).toContain("More explanation.");
  });
});
