import { Account, type Models } from "node-appwrite";
import { afterEach, expect, it, vi } from "vitest";

import { readGoogleNames } from "./google-profile";

vi.mock("@/lib/appwrite/server", () => ({ createSessionAppwriteClient: vi.fn() }));
const session = {
  userId: "appwrite-account", provider: "google", providerUid: "google-subject",
  providerAccessToken: "synthetic-token", secret: "synthetic-session",
} as Models.Session;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("reads bounded, distinct name fields from the matching Google subject using only the server token", async () => {
  const fetchClaims = vi.fn().mockResolvedValueOnce(Response.json({
    sub: session.providerUid, name: "Unused full name", given_name: " María José ", family_name: "de la Cruz",
  })).mockResolvedValueOnce(Response.json({
    sub: session.providerUid, name: "Another full name", family_name: "x".repeat(65),
  })).mockResolvedValueOnce(Response.json({ sub: "other-google-id", given_name: "Wrong member" }));
  vi.stubGlobal("fetch", fetchClaims);
  expect(await readGoogleNames(session)).toEqual({ firstName: "María José", lastName: "de la Cruz" });
  expect(fetchClaims).toHaveBeenCalledWith("https://openidconnect.googleapis.com/v1/userinfo", expect.objectContaining({
    headers: { Authorization: "Bearer synthetic-token" }, cache: "no-store", redirect: "error",
  }));
  expect(await readGoogleNames(session)).toEqual({ firstName: null, lastName: null });
  expect(await readGoogleNames(session)).toBeUndefined();
});

it("uses the session account's linked Google identity when the exchange omits provider data", async () => {
  const identity = { ...session, providerUid: "linked-id" } as unknown as Models.Identity;
  const list = vi.spyOn(Account.prototype, "listIdentities").mockResolvedValue({
    total: 1, identities: [identity],
  });
  const fetchClaims = vi.fn().mockResolvedValue(Response.json({ sub: "linked-id", given_name: "Ash" }));
  vi.stubGlobal("fetch", fetchClaims);
  const exchanged = { ...session, provider: "token", providerUid: "", providerAccessToken: "" };
  expect(await readGoogleNames(exchanged)).toEqual({ firstName: "Ash", lastName: null });
  list.mockResolvedValue({ total: 2, identities: [identity, { ...identity, providerUid: "other-linked" }] });
  expect(await readGoogleNames(exchanged)).toBeUndefined();
  expect(fetchClaims).toHaveBeenCalledTimes(1);
});

it("leaves sign-in available if Google is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Provider timeout")));
  expect(await readGoogleNames(session)).toBeUndefined();
});
