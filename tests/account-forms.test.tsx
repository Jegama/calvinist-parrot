// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/LoginForm";
import { RegisterForm } from "@/components/RegisterForm";
import { ProfileCard } from "@/app/profile/components/profile-card";

import { AuthProvider, useAuth } from "@/hooks/use-auth";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

let container: HTMLDivElement;
let root: Root;
const transport = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", transport);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
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
  expectSignedInName();
});

it.each(["New_Reader", "reader@example.test"])("accepts %s in the same login field", async (identifier) => {
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
  expect(push).toHaveBeenCalledWith("/");
  expectSignedInName();
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
      name="Lee van der Meer" email="reader@example.test" labels={[]} onUpdate={onUpdate} onLogout={vi.fn()} />,
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
      name="Lee Rivera" email="reader@example.test" labels={[]} onUpdate={onUpdate} onLogout={vi.fn()} />,
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
