import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProxySettings } from "./use-proxy-settings.js";

vi.mock("../lib/local-api-auth", () => ({
  getLocalApiAuthHeaders: vi.fn(async () => ({})),
}));

function setHostname(hostname) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, hostname },
    writable: true,
    configurable: true,
  });
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("useProxySettings", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    vi.unstubAllGlobals();
  });

  it("does not fetch and stays unavailable on a non-loopback host", async () => {
    setHostname("tt.977744.xyz");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useProxySettings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("probes and becomes available on localhost", async () => {
    setHostname("localhost");
    const fetchSpy = vi.fn(async () =>
      jsonResponse(200, {
        mode: "system",
        protocol: "http",
        host: "",
        port: 0,
        effective: "none",
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useProxySettings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("probes and becomes available on 127.0.0.1 (native Windows/macOS app loopback)", async () => {
    setHostname("127.0.0.1");
    const fetchSpy = vi.fn(async () =>
      jsonResponse(200, {
        mode: "system",
        protocol: "http",
        host: "",
        port: 0,
        effective: "none",
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useProxySettings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(true);
  });

  it("save() resolves and updates config on a normal 200 ok:true response", async () => {
    setHostname("localhost");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          mode: "manual",
          protocol: "http",
          host: "127.0.0.1",
          port: 7890,
          effective: "manual",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          mode: "manual",
          protocol: "http",
          host: "127.0.0.1",
          port: 7890,
          effective: "manual",
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useProxySettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save({ mode: "manual", protocol: "http", host: "127.0.0.1", port: "7890" });
    });

    expect(result.current.config.effective).toBe("manual");
  });

  it("save() throws when the backend returns HTTP 200 with ok:false, and still applies the config", async () => {
    setHostname("localhost");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          mode: "system",
          protocol: "http",
          host: "",
          port: 0,
          effective: "none",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: false,
          mode: "manual",
          protocol: "http",
          host: "127.0.0.1",
          port: 7890,
          effective: "none",
          applyError: "listen EADDRINUSE",
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useProxySettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let caught = null;
    await act(async () => {
      try {
        await result.current.save({ mode: "manual", protocol: "http", host: "127.0.0.1", port: "7890" });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe("listen EADDRINUSE");
    expect(caught.unprotected).toBeUndefined();
    // Written even though we ended up throwing — the config was saved, just not applied.
    expect(result.current.config.applyError).toBe("listen EADDRINUSE");
  });

  it("save() flags the thrown error as unprotected when the backend says so", async () => {
    setHostname("localhost");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          mode: "system",
          protocol: "http",
          host: "",
          port: 0,
          effective: "none",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: false,
          mode: "manual",
          protocol: "http",
          host: "127.0.0.1",
          port: 7890,
          effective: "none",
          applyError: "could not block outbound traffic",
          unprotected: true,
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useProxySettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let caught = null;
    await act(async () => {
      try {
        await result.current.save({ mode: "manual", protocol: "http", host: "127.0.0.1", port: "7890" });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught.unprotected).toBe(true);
  });

  it("save() throws without an unprotected flag when the field is absent", async () => {
    setHostname("localhost");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          mode: "system",
          protocol: "http",
          host: "",
          port: 0,
          effective: "none",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: false,
          mode: "manual",
          protocol: "http",
          host: "127.0.0.1",
          port: 7890,
          effective: "none",
          applyError: "bad host",
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useProxySettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let caught = null;
    await act(async () => {
      try {
        await result.current.save({ mode: "manual", protocol: "http", host: "127.0.0.1", port: "7890" });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught.unprotected).toBeUndefined();
  });
});
