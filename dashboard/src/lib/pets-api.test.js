import { afterEach, describe, expect, it, vi } from "vitest";
import { listPets } from "./pets-api.js";

describe("pets api catalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the atlas-less built-ins and filters bundled pets hidden by the local runtime", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      pets: [{
        id: "community-pet",
        displayName: "Community Pet",
        custom: true,
      }],
      // clawd and bot are listed to prove they cannot be hidden: neither has an
      // atlas to reclaim, so neither is removable.
      hiddenBuiltinIds: ["byte", "ember", "clawd", "bot", "unknown"],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const pets = await listPets();

    expect(pets.map((pet) => pet.id)).toEqual([
      "clawd",
      "bot",
      "sprout",
      "zzh",
      "community-pet",
    ]);
  });
});
