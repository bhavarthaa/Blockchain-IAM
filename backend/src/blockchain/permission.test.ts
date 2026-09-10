import { describe, expect, it } from "vitest";
import { hasOnChainPermission } from "./permission.js";

describe("on-chain permission enforcement", () => {
  it("fails closed when RoleManager is not configured", async () => {
    await expect(
      hasOnChainPermission("0x0000000000000000000000000000000000000001", "ASSET_MINT"),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
