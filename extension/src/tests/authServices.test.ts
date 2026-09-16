import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGoogleSession,
  GoogleAuthError,
  signOutGoogle,
} from "../integrations/google-oauth/authService";
import {
  checkGeminiAccess,
  GeminiAccessError,
} from "../integrations/gemini/client";
import { createChromeMock } from "./chromeMock";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google OAuth service", () => {
  it("gets a cached token non-interactively and reads the signed-in profile", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);

    await expect(getGoogleSession(false)).resolves.toEqual({
      account: {
        email: "learner@example.com",
        id: "google-account-id",
        label: "learner",
      },
      token: "test-google-access-token",
    });
    expect(chromeMock.identity.getAuthToken).toHaveBeenCalledWith({ interactive: false });
    expect(chromeMock.identity.getProfileUserInfo).toHaveBeenCalledWith({
      accountStatus: "ANY",
    });
  });

  it("requires an explicit interactive request before prompting for permission", async () => {
    const getAuthToken = vi.fn().mockRejectedValue(new Error("No cached grant"));
    vi.stubGlobal("chrome", createChromeMock({ getAuthToken }));

    await expect(getGoogleSession(false)).rejects.toMatchObject({
      code: "SIGNED_OUT",
    } satisfies Partial<GoogleAuthError>);
    expect(getAuthToken).toHaveBeenCalledOnce();
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: false });
  });

  it("does not start OAuth when the build has no configured client ID", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", {
      ...chromeMock,
      runtime: {
        ...chromeMock.runtime,
        getManifest: () => ({ manifest_version: 3, name: "Test", version: "0.1.0" }),
      },
    });

    await expect(getGoogleSession(true)).rejects.toMatchObject({
      code: "MISCONFIGURED",
    } satisfies Partial<GoogleAuthError>);
    expect(chromeMock.identity.getAuthToken).not.toHaveBeenCalled();
  });

  it("removes the current token and all cached Chrome Identity tokens on sign-out", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await signOutGoogle("token-to-remove");

    expect(chromeMock.identity.removeCachedAuthToken).toHaveBeenCalledWith({
      token: "token-to-remove",
    });
    expect(chromeMock.identity.clearAllCachedAuthTokens).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke",
      expect.objectContaining({
        body: "token=token-to-remove",
        method: "POST",
      }),
    );
  });

  it("still clears Chrome auth cache when Google token revocation is unavailable", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(signOutGoogle("token-to-remove")).resolves.toBeUndefined();
    expect(chromeMock.identity.clearAllCachedAuthTokens).toHaveBeenCalledOnce();
  });
});

describe("Gemini access probe", () => {
  it("sends the OAuth token only to Google and validates generateContent access", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ supportedGenerationMethods: ["generateContent"] }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      checkGeminiAccess("private-oauth-token", { projectId: "test-google-project" }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=50",
    );
    expect(init).toMatchObject({ credentials: "omit", method: "GET" });
    expect(new Headers(init.headers)).toEqual(
      new Headers({
        Accept: "application/json",
        Authorization: "Bearer private-oauth-token",
        "x-goog-user-project": "test-google-project",
      }),
    );
  });

  it.each([
    [401, "TOKEN_EXPIRED"],
    [403, "PERMISSION_DENIED"],
    [429, "QUOTA_EXCEEDED"],
    [503, "UNAVAILABLE"],
  ] as const)("maps HTTP %i to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));

    await expect(checkGeminiAccess("test-token")).rejects.toMatchObject({
      code,
      status,
    } satisfies Partial<GeminiAccessError>);
  });
});
