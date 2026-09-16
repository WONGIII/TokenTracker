import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCloudUsageDaily, fetchCloudUsageSummary } from "../lib/api";
import { useUsageData } from "./use-usage-data";

vi.mock("../lib/api", () => ({
  fetchCloudUsageDaily: vi.fn(async () => ({ from: "2026-06-01", to: "2026-06-30", data: [] })),
  fetchCloudUsageSummary: vi.fn(async () => ({ totals: { total_tokens: 0 }, rolling: null })),
  getUsageDaily: vi.fn(async () => ({ data: [] })),
  getUsageSummary: vi.fn(async () => ({ totals: {} })),
}));
vi.mock("../lib/auth-token", () => ({
  isAccessTokenReady: () => true,
  resolveAuthAccessToken: async (t: any) => t || "test-token",
}));
vi.mock("../lib/mock-data", () => ({ isMockEnabled: () => false }));

describe("useUsageData device scope", () => {
  beforeEach(() => {
    vi.mocked(fetchCloudUsageDaily).mockClear();
    vi.mocked(fetchCloudUsageSummary).mockClear();
    try { window.localStorage.clear(); } catch { /* ignore */ }
  });

  it("forwards deviceId to the cloud daily fetcher", async () => {
    renderHook(() =>
      useUsageData({
        baseUrl: "https://tt.977744.xyz",
        from: "2026-06-01",
        to: "2026-06-30",
        includeDaily: true,
        cacheKey: "u1",
        timeZone: "UTC",
        accountView: true,
        accountAccessToken: "jwt-token",
        deviceId: "dev-7",
      }),
    );
    await waitFor(() => expect(fetchCloudUsageDaily).toHaveBeenCalled());
    expect(vi.mocked(fetchCloudUsageDaily).mock.calls[0][0]).toMatchObject({ device: "dev-7" });
  });

  it("skips the cloud summary request for a daily-only consumer", async () => {
    renderHook(() =>
      useUsageData({
        baseUrl: "https://tt.977744.xyz",
        from: "2026-06-01",
        to: "2026-06-30",
        includeDaily: true,
        includeSummary: false,
        cacheKey: "daily-only",
        timeZone: "UTC",
        accountView: true,
        accountAccessToken: "jwt-token",
      }),
    );

    await waitFor(() => expect(fetchCloudUsageDaily).toHaveBeenCalled());
    expect(fetchCloudUsageSummary).not.toHaveBeenCalled();
  });

  it("writes a device-scoped cache key (no collision with all-devices)", async () => {
    renderHook(() =>
      useUsageData({
        baseUrl: "https://tt.977744.xyz",
        from: "2026-06-01", to: "2026-06-30", includeDaily: false,
        cacheKey: "u1", timeZone: "UTC",
        accountView: true, accountAccessToken: "jwt-token", deviceId: "dev-7",
      }),
    );
    await waitFor(() => expect(fetchCloudUsageSummary).toHaveBeenCalled());
    const keys = Object.keys(window.localStorage);
    expect(keys.some((k) => k.includes("dev-7"))).toBe(true);
  });

  it("does not let a slower previous range overwrite the current summary", async () => {
    let resolveMonth: (value: any) => void = () => {};
    let resolveDay: (value: any) => void = () => {};
    vi.mocked(fetchCloudUsageSummary).mockImplementation(({ from }: any) =>
      new Promise((resolve) => {
        if (from === "2026-06-01") resolveMonth = resolve;
        else resolveDay = resolve;
      }),
    );

    const { result, rerender } = renderHook(
      ({ from, to }) =>
        useUsageData({
          baseUrl: "https://tt.977744.xyz",
          from,
          to,
          includeDaily: false,
          cacheKey: "range-race",
          timeZone: "UTC",
          accountView: true,
          accountAccessToken: "jwt-token",
        }),
      { initialProps: { from: "2026-06-01", to: "2026-06-30" } },
    );

    await waitFor(() => expect(fetchCloudUsageSummary).toHaveBeenCalledTimes(1));
    rerender({ from: "2026-06-30", to: "2026-06-30" });
    expect(result.current.summary).toBeNull();
    await waitFor(() => expect(fetchCloudUsageSummary).toHaveBeenCalledTimes(2));

    await act(async () => resolveDay({ totals: { total_tokens: 100 }, rolling: null }));
    await waitFor(() => expect(result.current.summary?.total_tokens).toBe(100));

    await act(async () => resolveMonth({ totals: { total_tokens: 9_999 }, rolling: null }));
    expect(result.current.summary?.total_tokens).toBe(100);
    expect(result.current.loading).toBe(false);
  });
});
