import { describe, expect, it } from "vitest";

import type { Offering, PortfolioNode } from "../../architecture/model";
import { defaultScope } from "./journeyScope";

const node = (id: string, parentId: string | null = null): PortfolioNode => ({ id, level: "Level", name: id.toUpperCase(), parentId });
const product = (nodeId: string | null) => ({ id: `p-${nodeId}`, nodeId }) as unknown as Offering;
const nodes = [node("enterprise"), node("fixed", "enterprise"), node("mobile", "enterprise"), node("smb", "fixed"), node("internet", "smb"), node("voice", "smb"), node("plans", "mobile")];

describe("the scope the journeys page opens on", () => {
  it("opens on the deepest node every product shares", () => {
    expect(defaultScope(nodes, [product("internet")])).toBe("internet");
    expect(defaultScope(nodes, [product("voice")])).toBe("voice");
  });

  it("goes on down through the first child holding a product, so every level opens with a choice", () => {
    // Both families sit under SMB: SMB, then its first family with a product.
    expect(defaultScope(nodes, [product("voice"), product("internet")])).toBe("internet");
    // Fixed and Mobile share only Enterprise: Enterprise, then Fixed, SMB and Internet.
    expect(defaultScope(nodes, [product("plans"), product("internet")])).toBe("internet");
  });

  it("names no node it isn't given", () => {
    expect(defaultScope(nodes, [])).toBeNull();
    expect(defaultScope(nodes, [product(null)])).toBeNull();
    expect(defaultScope([], [product("internet")])).toBeNull();
  });
});
