// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AuthProvider } from "@/hooks/use-auth";
import { FirstNameNudge } from "./FirstNameNudge";

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<typeof fetch>();
const profileUrl = "/api/user-profile/first-name-nudge";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

async function visit(userId: string | null, firstName: string | null, shown = false) {
  fetchMock.mockImplementation(async (path) => path === profileUrl ? Response.json({ show: true }) : Response.json({
    authenticated: Boolean(userId),
    user: userId && { $id: userId, name: "Reader" },
    profile: { displayName: "Reader", firstName, firstNameNudgeShown: shown },
  }));
  await act(async () => root.render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider><FirstNameNudge /><main>Chat</main></AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  ));
}

it("keeps the app accessible and offers a dismissible profile link for the first visit", async () => {
  await visit("first-reader", null);
  await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(container.querySelector("a")?.textContent).toBe("Update profile");
  });
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/profile");
  expect(container.querySelector("main")?.textContent).toBe("Chat");
  expect(fetchMock.mock.calls.filter(([path]) => path === profileUrl)).toHaveLength(1);
  await act(async () => { container.querySelector("button")!.click(); });
  await vi.waitFor(() => expect(container.querySelector("aside")).toBeNull());
});

it.each([
  { userId: null, firstName: null, shown: false },
  { userId: "named-reader", firstName: "Léa", shown: false },
  { userId: "returning-reader", firstName: null, shown: true },
])("skips the prompt for $userId with first name $firstName and shown state $shown", async ({ userId, firstName, shown }) => {
  await visit(userId, firstName, shown);
  expect(container.querySelector("aside")).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => url === profileUrl)).toBe(false);
});
