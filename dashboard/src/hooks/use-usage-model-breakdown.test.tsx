import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCloudUsageModelBreakdown } from "../lib/api";
import { useUsageModelBreakdown } from "./use-usage-model-breakdown";

vi.mock("../lib/api", () => ({
  fetchCloudUsageModelBreakdown: vi.fn(),
  getUsageModelBreakdown: vi.fn(),
}));
vi.mock("../lib/auth-token", () => ({
  isAccessTokenReady: () => true,
  resolveAuthAccessToken: async (token: any) => token || "test-token",
}));
vi.mock("../lib/mock-data", () => ({ isMockEnabled: () => false }));

describe("useUsageModelBreakdown", () => {
  beforeEach(() => {
    vi.mocked(fetchCloudUsageModelBreakdown).mockReset();
    window.localStorage.clear();
  });

  it("clears the previous range and ignores its late provider response", async () => {
    let resolveMonth: (value: any) => void = () => {};
    let resolveDay: (value: any) => void = () => {};
    vi.mocked(fetchCloudUsageModelBreakdown).mockImplementation(({ from }: any) =>
      new Promise((resolve) => {
        if (from === "2026-06-01") resolveMonth = resolve;
        else resolveDay = resolve;
      }),
    );

    const { result, rerender } = renderHook(
      ({ from, to }) =>
        useUsageModelBreakdown({
          baseUrl: "https://tt.977744.xyz",
          from,
          to,
          cacheKey: "provider-race",
          timeZone: "UTC",
          accountView: true,
          accountAccessToken: "jwt-token",
        }),
      { initialProps: { from: "2026-06-01", to: "2026-06-30" } },
    );

    await waitFor(() => expect(fetchCloudUsageModelBreakdown).toHaveBeenCalledTimes(1));
    rerender({ from: "2026-06-30", to: "2026-06-30" });
    expect(result.current.breakdown).toBeNull();
    await waitFor(() => expect(fetchCloudUsageModelBreakdown).toHaveBeenCalledTimes(2));

    await act(async () => resolveDay({ sources: [{ source: "codex", totals: { total_tokens: 100 } }] }));
    await waitFor(() => expect(result.current.breakdown?.sources?.[0]?.totals?.total_tokens).toBe(100));

    await act(async () => resolveMonth({ sources: [{ source: "claude", totals: { total_tokens: 9_999 } }] }));
    expect(result.current.breakdown?.sources?.[0]?.source).toBe("codex");
    expect(result.current.breakdown?.sources?.[0]?.totals?.total_tokens).toBe(100);
    expect(result.current.loading).toBe(false);
  });
});
