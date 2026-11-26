// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/LoginForm";
import { RegisterForm } from "@/components/RegisterForm";
import { AccountCredentials } from "@/app/profile/components/account-credentials";
import { ProfileCard } from "@/app/profile/components/profile-card";

import { AuthProvider, useAuth } from "@/hooks/use-auth";
import ConsentPage from "@/app/auth/mcp/consent/page";
import { afterLoginPath, consentPath } from "@/lib/mcp/auth-return";

vi.mock("@/lib/mcp/auth-consent", () => ({ loadConsent: async () => ({ state: "signedOut" }) }));

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

let container: HTMLDivElement;
let root: Root;
const transport = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", transport);
  vi.resetAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  sessionStorage.clear();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

const providerUser = { $id: "reader", name: "Original name", email: "reader@example.test" };
const signedIn = { authenticated: true, user: providerUser, profile: { displayName: "Lee Rivera" } };

function SessionDetails() {
  const { user, displayName } = useAuth();
  return <output>{JSON.stringify({ user, displayName })}</output>;
}

async function renderWithSession(children: ReactNode, session: object = { authenticated: false }) {
  transport.mockResolvedValueOnce(Response.json(session));
  await act(async () => root.render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>{children}<SessionDetails /></AuthProvider>
    </QueryClientProvider>,
  ));
}

function expectSignedInName() {
  expect(JSON.parse(container.querySelector("output")!.textContent!))
    .toEqual({ user: providerUser, displayName: "Lee Rivera" });
}

const consentParams = {
  client_id: "preview-client",
  redirect_uri: "https://client.example/callback?a=1&b=2",
  state: "abc+123/=",
  resource: "https://parrot.example/api/mcp",
};
const consentRequest = `${consentPath}?${new URLSearchParams(consentParams)}`;

async function followColdConsentLink(params: Record<string, string | string[]> = consentParams) {
  const page = await ConsentPage({ searchParams: Promise.resolve(params) });
  const html = new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
  const href = html.querySelector("a")!.getAttribute("href")!;
  expect(new URL(href, location.origin).pathname).toBe("/login");
  // A browser can follow the server-rendered href before React attaches any handlers.
  history.replaceState(null, "", href);
}

function setField(name: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submit(values: Record<string, string>) {
  await act(async () => {
    for (const [name, value] of Object.entries(values)) setField(name, value);
  });
  const form = container.querySelector("form")!;
  expect(form.checkValidity()).toBe(true);
  await act(async () => form.requestSubmit());
}

it("registers with exactly the five labeled identity and credential fields", async () => {
  await followColdConsentLink({ grant_id: "fixture" });
  await renderWithSession(<LoginForm />);
  const signUp = container.querySelector('a[href^="/register"]')!;
  expect(new URL(signUp.getAttribute("href")!, location.origin).searchParams.get("mcpConsent")).toBe("grant_id=fixture");
  history.replaceState(null, "", signUp.getAttribute("href")!);
  await act(async () => root.render(null));
  await renderWithSession(<RegisterForm />);
  const inputs = Array.from(container.querySelectorAll("input"));
  expect(inputs.map((input) => input.labels?.[0].textContent)).toEqual([
    "Username", "First name", "Last name", "Email", "Password",
  ]);
  expect(inputs.every((input) => input.required)).toBe(true);
  expect(container.textContent).toContain("Sign up with Google");

  const fields = {
    username: "New_Reader", firstName: "Lee", lastName: "Rivera",
    email: "reader@example.test", password: "test-password",
  };
  transport.mockResolvedValueOnce(Response.json(signedIn));
  await submit(fields);
  expect(transport).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({
    method: "POST", body: JSON.stringify(fields),
  }));
  expect(container.textContent).toContain("Your account is ready");
  expect(push).not.toHaveBeenCalled();
  transport.mockResolvedValueOnce(Response.json({ message: "Verification email sent. Check your inbox." }));
  const buttons = Array.from(container.querySelectorAll("button"));
  await act(async () => buttons.find((button) => button.textContent === "Send verification email")!.click());
  expect(transport).toHaveBeenLastCalledWith("/api/auth/verification", { method: "POST" });
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Verification email sent");
  await act(async () => buttons.find((button) => button.textContent === "Continue to Parrot")!.click());
  expect(push).toHaveBeenCalledWith(consentPath + "?grant_id=fixture");
  expectSignedInName();
});

it.each([["New_Reader", consentRequest], ["reader@example.test", "/"]])("signs in %s and returns to %s", async (identifier, destination) => {
  if (destination === consentRequest) await followColdConsentLink();
  await renderWithSession(<LoginForm />);
  expect(Array.from(container.querySelectorAll("label"), (label) => label.textContent))
    .toEqual(["Email or username", "Password"]);
  expect(container.textContent).toContain("Continue with Google");
  const credentials = { identifier, password: "test-password" };
  transport.mockResolvedValueOnce(Response.json(signedIn));
  await submit(credentials);
  expect(transport).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
    method: "POST", body: JSON.stringify(credentials),
  }));
  expect(push).toHaveBeenCalledWith(destination);
  expectSignedInName();
});

it("remembers the cold consent request across the Google round trip and consumes it once", async () => {
  await followColdConsentLink();
  await renderWithSession(<LoginForm />);
  history.replaceState(null, "", "/auth/complete");
  expect(afterLoginPath()).toBe(consentRequest);
  expect(afterLoginPath()).toBe("/");
});

it("restores the saved display name and provider identity from /api/auth/me", async () => {
  await renderWithSession(null, signedIn);
  expect(transport).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ method: "GET" }));
  expectSignedInName();
});

it("lets a legacy user retry a handle claim without entering or overwriting their names", async () => {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(
    <ProfileCard profile={{ username: null, firstName: null, lastName: null }}
      name="Lee van der Meer" labels={[]} onUpdate={onUpdate} onLogout={vi.fn()} />,
  ));
  expect(container.textContent).toContain("Lee van der Meer");
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector<HTMLInputElement>("#firstName")!.value).toBe("");
  expect(container.querySelector<HTMLInputElement>("#lastName")!.value).toBe("");
  transport.mockResolvedValueOnce(Response.json({ error: "Username unavailable." }, { status: 409 }));
  await submit({ username: "taken" });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Username unavailable.");
  expect(onUpdate).not.toHaveBeenCalled();

  transport.mockResolvedValueOnce(Response.json({ success: true }));
  await submit({ username: "Reader_22" });
  expect(transport).toHaveBeenLastCalledWith("/api/user-profile", expect.objectContaining({
    method: "PATCH", body: JSON.stringify({ username: "Reader_22" }),
  }));
  expect(onUpdate).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Profile saved.");
});

it("edits a saved name independently of the other name and username", async () => {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(
    <ProfileCard profile={{ username: "reader", firstName: "Lee", lastName: "Rivera" }}
      name="Lee Rivera" labels={[]} onUpdate={onUpdate} onLogout={vi.fn()} />,
  ));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector<HTMLInputElement>("#username")!.value).toBe("reader");
  expect(container.querySelector<HTMLInputElement>("#lastName")!.value).toBe("Rivera");
  transport.mockResolvedValueOnce(Response.json({ success: true }));
  await submit({ firstName: "Leigh" });
  expect(transport).toHaveBeenCalledWith("/api/user-profile", expect.objectContaining({
    method: "PATCH", body: JSON.stringify({ firstName: "Leigh" }),
  }));
  expect(onUpdate).toHaveBeenCalledOnce();
});

it("sets a first password, then requires that password to change the email and shows the new verification status", async () => {
  const account = { ...providerUser, emailVerification: true, passwordUpdate: "" };
  await renderWithSession(<AccountCredentials />, { ...signedIn, user: account });
  const button = (text: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === text)!;
  expect(container.textContent).toContain("Email verified");
  expect(button("Change email")).toBeUndefined();
  await act(async () => button("Set password").click());
  expect(container.querySelector("input[name=currentPassword]")).toBeNull();

  const withPassword = { ...account, passwordUpdate: "2026-11-26T00:00:00.000Z" };
  transport.mockResolvedValueOnce(Response.json({ account: withPassword, message: "Password set." }));
  await submit({ password: "synthetic-password" });
  expect(transport).toHaveBeenLastCalledWith("/api/auth/account", expect.objectContaining({
    method: "PATCH", body: JSON.stringify({ field: "password", password: "synthetic-password" }),
  }));

  await act(async () => button("Change email").click());
  const changes = { email: "new@example.test", currentPassword: "synthetic-password" };
  expect(container.querySelector<HTMLInputElement>("input[name=currentPassword]")?.required).toBe(true);
  transport.mockResolvedValueOnce(Response.json({ account: { ...withPassword, email: changes.email, emailVerification: false }, message: "Email changed." }));
  await submit(changes);
  expect(transport).toHaveBeenLastCalledWith("/api/auth/account", expect.objectContaining({
    method: "PATCH", body: JSON.stringify({ field: "email", ...changes }),
  }));
  expect(container.textContent).toContain(changes.email);
  expect(container.textContent).toContain("Email unverified");
  transport.mockResolvedValueOnce(Response.json({ message: "Verification email sent." }));
  await act(async () => button("Resend verification").click());
  expect(transport).toHaveBeenLastCalledWith("/api/auth/verification", { method: "POST" });
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Verification email sent.");
});
