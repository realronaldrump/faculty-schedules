import { describe, expect, it } from "vitest";

import { canAccessPage, normalizePageId } from "../authz";

const rolePermissions = {
  staff: {
    pages: {
      "people/directory": true,
    },
  },
};

describe("authz", () => {
  it("normalizes legacy PAF page ids", () => {
    expect(normalizePageId("people/paf")).toBe("workflows/paf");
    expect(normalizePageId("/paf-workflow?tab=current")).toBe("workflows/paf");
  });

  it("allows PAF access through legacy people directory permission", () => {
    expect(
      canAccessPage({
        userProfile: { status: "active", roles: ["staff"] },
        rolePermissions,
        pageId: "workflows/paf",
      }),
    ).toBe(true);
  });

  it("honors a direct PAF deny before legacy fallback access", () => {
    expect(
      canAccessPage({
        userProfile: {
          status: "active",
          roles: ["staff"],
          permissions: { "workflows/paf": false },
        },
        rolePermissions,
        pageId: "workflows/paf",
      }),
    ).toBe(false);
  });

  it("honors a canonical PAF deny over conflicting legacy alias grants", () => {
    [
      { "people/paf": true, "workflows/paf": false },
      { "workflows/paf": false, "people/paf": true },
      { "/paf-workflow": true, "workflows/paf": false },
    ].forEach((permissions) => {
      expect(
        canAccessPage({
          userProfile: {
            status: "active",
            roles: ["staff"],
            permissions,
          },
          rolePermissions,
          pageId: "workflows/paf",
        }),
      ).toBe(false);
    });
  });

  it("honors canonical denies over aliases in role permissions", () => {
    [
      { "people/paf": true, "workflows/paf": false },
      { "workflows/paf": false, "people/paf": true },
    ].forEach((pages) => {
      expect(
        canAccessPage({
          userProfile: { status: "active", roles: ["staff"] },
          rolePermissions: { staff: { pages } },
          pageId: "workflows/paf",
        }),
      ).toBe(false);
    });
  });
});
