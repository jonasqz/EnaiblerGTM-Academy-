import { describe, expect, it } from "vitest";

import {
  academyRolesFrom,
  INVITATIONS_PER_DAY,
  isTeamRole,
  keepsTeamRole,
  leavesNoAdmin,
  mayInvite,
  roleChange,
  teamEmail,
} from "@/core/access/team";

describe("team roles", () => {
  it("counts everyone but learners as the team", () => {
    expect(["tenant_admin", "author", "reviewer", "mentor"].every(isTeamRole)).toBe(true);
    expect(isTeamRole("learner")).toBe(false);
  });

  it("takes only academy-wide roles from a form, each once", () => {
    expect(
      academyRolesFrom(["reviewer", "author", "reviewer", "mentor", "learner", "root"]),
    ).toEqual(["author", "reviewer"]);
    expect(academyRolesFrom([])).toEqual([]);
  });

  it("changes academy-wide roles and leaves learning and mentoring alone", () => {
    expect(roleChange(["learner", "author", "mentor"], ["reviewer"])).toEqual({
      add: ["reviewer"],
      remove: ["author"],
    });
    expect(roleChange(["tenant_admin", "author"], ["author", "tenant_admin"])).toEqual({
      add: [],
      remove: [],
    });
  });

  it("keeps a role change from emptying someone's team roles", () => {
    expect(keepsTeamRole(["author"], [])).toBe(false);
    // A mentor stays on the team through their cohort.
    expect(keepsTeamRole(["mentor", "reviewer"], [])).toBe(true);
    expect(keepsTeamRole([], ["reviewer"])).toBe(true);
  });
});

describe("the last admin", () => {
  it("cannot lose the role, themselves included", () => {
    expect(leavesNoAdmin(["ada"], "ada", false)).toBe(true);
    expect(leavesNoAdmin(["ada"], "ada", true)).toBe(false);
  });

  it("can go once someone else is admin too", () => {
    expect(leavesNoAdmin(["ada", "grace"], "ada", false)).toBe(false);
  });

  it("does not stop changes to people who are not admins", () => {
    expect(leavesNoAdmin(["ada"], "grace", false)).toBe(false);
    // An academy without admins (made from a manifest) can still get roles changed.
    expect(leavesNoAdmin([], "grace", false)).toBe(false);
  });
});

describe("invitations", () => {
  it("need a real address, stored in lower case", () => {
    expect(teamEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(teamEmail("ada@example")).toBeNull();
    expect(teamEmail("not an address")).toBeNull();
    expect(teamEmail("")).toBeNull();
    expect(teamEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });

  it("are limited per academy and day", () => {
    expect(INVITATIONS_PER_DAY).toBe(50);
    expect(mayInvite(0)).toBe(true);
    expect(mayInvite(INVITATIONS_PER_DAY - 1)).toBe(true);
    expect(mayInvite(INVITATIONS_PER_DAY)).toBe(false);
  });
});
