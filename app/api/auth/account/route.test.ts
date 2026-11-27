import { Account, AppwriteException, Client } from "node-appwrite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const readSession = vi.hoisted(() => vi.fn());
const syncEmail = vi.hoisted(() => vi.fn());
const sendVerification = vi.hoisted(() => vi.fn());
vi.mock("@/lib/appwrite/server", () => ({ getSessionAccount: readSession }));
vi.mock("@/lib/user-profile", () => ({ syncConfirmedEmail: syncEmail }));
vi.mock("@/lib/appwrite/verification", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/appwrite/verification")>(), sendAccountVerification: sendVerification,
}));

import { PATCH } from "./route";

const user = {
  $id: "reader", email: "reader@example.test", emailVerification: true, passwordUpdate: "2026-11-26T00:00:00.000Z",
  targets: [{ $id: "target", providerType: "email", identifier: "reader@example.test", $updatedAt: "2026-11-26T00:00:00.000Z" }],
};
const updatedEmail = { ...user, targets: [], email: "new@example.test", emailVerification: false };
const sessionClient = new Client().setEndpoint("http://localhost/v1").setProject("test").setSession("test-session");
const sessionAccount = new Account(sessionClient);

function patch(body: object) {
  return PATCH(new Request("http://localhost/api/auth/account", { method: "PATCH", body: JSON.stringify(body) }));
}
const emailChange = { field: "email", email: updatedEmail.email, currentPassword: "test-current-password" };
const firstPassword = { field: "password", password: "test-first-password" };

beforeEach(() => {
  vi.resetAllMocks();
  readSession.mockResolvedValue(sessionAccount);
  sendVerification.mockResolvedValue(true);
});

afterEach(() => vi.restoreAllMocks());

it("requires a signed-in account", async () => {
  readSession.mockResolvedValue(null);
  expect((await patch(emailChange)).status).toBe(401);
  expect(sendVerification).not.toHaveBeenCalled();
});

it("updates the session owner's email, syncs only provider-returned data and sends a new verification", async () => {
  const api = vi.spyOn(Client.prototype, "call").mockResolvedValueOnce(user).mockResolvedValueOnce(updatedEmail);
  const res = await patch({ ...emailChange, userId: "another-user", emailVerification: true });
  expect(api.mock.calls[1][1].pathname).toBe("/v1/account/email");
  expect(api.mock.calls[1][3]).toEqual({ email: updatedEmail.email, password: emailChange.currentPassword });
  expect(api.mock.contexts[1]).toMatchObject({ config: { key: "", session: "test-session" } });
  expect(syncEmail).toHaveBeenCalledWith(expect.objectContaining(updatedEmail), expect.any(Function));
  expect(sendVerification).toHaveBeenCalledWith(sessionAccount, expect.objectContaining(updatedEmail));
  expect(await res.json()).toMatchObject({ account: { email: updatedEmail.email, emailVerification: false }, verificationEmailSent: true, message: expect.stringContaining("Check your new inbox") });
});

it("reports an already committed email change even if mirroring and delivery are temporarily unavailable", async () => {
  vi.spyOn(Client.prototype, "call").mockResolvedValueOnce(user).mockResolvedValueOnce(updatedEmail);
  syncEmail.mockRejectedValue(new Error("Database unavailable"));
  sendVerification.mockRejectedValue(new Error("SMTP unavailable"));
  const res = await patch(emailChange);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ account: { email: updatedEmail.email }, verificationEmailSent: false, message: expect.stringContaining("Request a new verification link") });
});

it("requires the existing password and does not mirror or send after rejected reauthentication", async () => {
  const api = vi.spyOn(Client.prototype, "call").mockResolvedValueOnce(user)
    .mockRejectedValueOnce(new AppwriteException("provider error", 401, "user_invalid_credentials"));
  expect((await patch(emailChange)).status).toBe(400);
  expect(syncEmail).not.toHaveBeenCalled();
  expect(sendVerification).not.toHaveBeenCalled();
  api.mockResolvedValueOnce(user);
  expect((await patch(firstPassword)).status).toBe(400);
  expect(api.mock.calls.at(-1)?.[1].pathname).toBe("/v1/account");
});

it("allows setting the first password and requires it on later edits, even in the same OAuth session", async () => {
  const api = vi.spyOn(Client.prototype, "call")
    .mockResolvedValueOnce({ ...user, passwordUpdate: "" }).mockResolvedValueOnce(user);
  const first = await patch(firstPassword);
  expect(first.status).toBe(200);
  expect(api.mock.calls[1][1].pathname).toBe("/v1/account/password");
  expect(api.mock.calls[1][3]).toEqual({ password: firstPassword.password });
  api.mockResolvedValueOnce(user);
  expect((await patch(firstPassword)).status).toBe(400);
  api.mockResolvedValueOnce(user).mockResolvedValueOnce(user);
  const second = await patch({ ...firstPassword, currentPassword: firstPassword.password, password: "second-password" });
  expect(second.status).toBe(200);
  expect(api.mock.calls.at(-1)?.[3]).toEqual({ oldPassword: firstPassword.password, password: "second-password" });
});

it("requires a first password before an email change on a passwordless account", async () => {
  const api = vi.spyOn(Client.prototype, "call").mockResolvedValueOnce({ ...user, passwordUpdate: "" });
  const result = await patch(emailChange);
  expect(result.status).toBe(400);
  expect((await result.json()).error).toContain("Set a password");
  expect(api).toHaveBeenCalledTimes(1);
});
