import { useCallback, useEffect, useState } from "react";
import { isLocalDashboardHost } from "../lib/host-mode";

const PROXY_CONFIG_PATH = "/functions/tokentracker-proxy-config";
const PROXY_TEST_PATH = "/functions/tokentracker-proxy-test";

const DEFAULT_CONFIG = {
  mode: "system",
  protocol: "http",
  host: "",
  port: "",
  effective: "none",
  applyError: null,
};

function normalizeLoaded(data) {
  if (!data || typeof data.mode !== "string") return null;
  return {
    mode: data.mode,
    protocol: typeof data.protocol === "string" ? data.protocol : "http",
    host: typeof data.host === "string" ? data.host : "",
    port: data.port == null || data.port === 0 ? "" : String(data.port),
    effective: typeof data.effective === "string" ? data.effective : "none",
    applyError: typeof data.applyError === "string" && data.applyError.trim()
      ? data.applyError
      : null,
  };
}

async function readProxyConfig() {
  const res = await fetch(PROXY_CONFIG_PATH, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return normalizeLoaded(data);
}

async function authHeaders() {
  const { getLocalApiAuthHeaders } = await import("../lib/local-api-auth");
  return getLocalApiAuthHeaders();
}

/**
 * Probe / read / save / test the CLI-side outbound proxy settings.
 *
 * Only runs on a local dashboard host (see `isLocalDashboardHost()`) — on a
 * public deploy (e.g. tt.977744.xyz) there is no local CLI server to
 * talk to, so no request is made at all. `available` stays false until GET
 * /functions/tokentracker-proxy-config succeeds. Failures (network errors,
 * malformed JSON) are silent — they must not print to the console.
 */
export function useProxySettings() {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  useEffect(() => {
    if (!isLocalDashboardHost()) {
      setAvailable(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const loaded = await readProxyConfig();
        if (cancelled) return;
        if (!loaded) {
          setAvailable(false);
          setLoading(false);
          return;
        }
        setConfig(loaded);
        setAvailable(true);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setAvailable(false);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next) => {
    const headers = await authHeaders();
    const res = await fetch(PROXY_CONFIG_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      cache: "no-store",
      body: JSON.stringify({
        mode: next.mode,
        protocol: next.protocol,
        host: next.host,
        port: next.port === "" ? 0 : Number(next.port),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = data && typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
      throw new Error(error);
    }
    const loaded = normalizeLoaded(data);
    if (loaded) setConfig(loaded);
    if (data && data.ok === false) {
      const message =
        (data && typeof data.applyError === "string" && data.applyError) ||
        (data && typeof data.error === "string" && data.error) ||
        `HTTP ${res.status}`;
      const err = new Error(message);
      if (data.unprotected === true) err.unprotected = true;
      throw err;
    }
    return loaded || data;
  }, []);

  const testConnection = useCallback(async (next) => {
    const headers = await authHeaders();
    const res = await fetch(PROXY_TEST_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      cache: "no-store",
      body: JSON.stringify({
        protocol: next.protocol,
        host: next.host,
        port: next.port === "" ? 0 : Number(next.port),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!data || typeof data.ok !== "boolean") {
      throw new Error(data && typeof data.error === "string" ? data.error : `HTTP ${res.status}`);
    }
    return data;
  }, []);

  return { available, loading, config, save, testConnection };
}
