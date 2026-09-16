import { createClient } from "@insforge/sdk";

/**
 * Production InsForge cloud — hardcoded fallback so deployments that don't
 * inject `VITE_INSFORGE_*` at build time (notably the Vercel build for
 * tokentracker.cc) still reach the cloud. Without this, `getInsforgeRemoteUrl`
 * returns "" and every cloud call (leaderboard list, profile modal, OAuth
 * login) silently fails on the public site.
 *
 * Both values are public by design: the anon key is a JWT (role=anon) meant to
 * ship in the browser bundle and also appears in `.github/workflows/*.yml`.
 * (Previously this mistakenly hardcoded the full-access `ik_*` API key, which
 * has admin access and must never reach the frontend.) Explicit env vars still win.
 */
// FORK: this is OUR self-hosted InsForge (see the server notes in
// MODIFICATIONS.md), not upstream's project. It is the fallback for builds that
// don't inject VITE_INSFORGE_BASE_URL (the desktop apps' bundled dashboard).
const PROD_INSFORGE_BASE_URL = "https://tt.977744.xyz";
// Self-hosted InsForge issues an `anon_*` key rather than a role=anon JWT.
// It is public by design (it ships in every bundle and cannot read another
// user's rows on its own).
const PROD_INSFORGE_ANON_KEY = "anon_8b315a83487de79bc4d17a5089d81d02b55184ab";

/**
 * InsForge 云端（SDK OAuth/Session）。`getInsforgeBaseUrl()` 在 localhost 有 env 时同样指向云端。
 * 仪表盘用量接口仍由 `getBackendBaseUrl()` 在 localhost 返回空串走本地 CLI；排行榜单独用 `getLeaderboardBaseUrl()`。
 */
/** 云端 InsForge 原始 URL（供 proxy 目标和 edge function 调用使用） */
export function getInsforgeRemoteUrl(): string {
  const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  return (
    env?.VITE_INSFORGE_BASE_URL ||
    env?.VITE_TOKENTRACKER_BACKEND_BASE_URL ||
    PROD_INSFORGE_BASE_URL
  ).trim();
}

/**
 * SDK baseUrl：localhost 时指向自己（走 vite proxy 避免跨域 cookie 问题），
 * 部署后直接指向云端。
 */
function getInsforgeBaseUrl(): string {
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  if (isLocalhost) return window.location.origin;
  const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  return (
    env?.VITE_INSFORGE_BASE_URL ||
    env?.VITE_TOKENTRACKER_BACKEND_BASE_URL ||
    PROD_INSFORGE_BASE_URL
  ).trim();
}

export function getInsforgeAnonKey(): string {
  const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  return (
    env?.VITE_INSFORGE_ANON_KEY ||
    env?.VITE_TOKENTRACKER_BACKEND_ANON_KEY ||
    PROD_INSFORGE_ANON_KEY
  ).trim();
}

export function isCloudInsforgeConfigured(): boolean {
  return Boolean(getInsforgeBaseUrl());
}

/**
 * 全局单例 SDK 客户端。
 *
 * OAuth 回调时 URL 上的 `insforge_code` 只会被处理一次；若在 React 18 Strict Mode 下
 * 每次挂载都 `createClient()`，第二次实例会错过回调且会话为空，右上角头像不更新。
 */
let insforgeClientSingleton: ReturnType<typeof createClient> | null = null;

export function getOrCreateInsforgeClient(): ReturnType<typeof createClient> | null {
  if (!isCloudInsforgeConfigured()) return null;
  if (!insforgeClientSingleton) {
    insforgeClientSingleton = createClient({
      baseUrl: getInsforgeBaseUrl(),
      anonKey: getInsforgeAnonKey() || undefined,
    });
  }
  return insforgeClientSingleton;
}
