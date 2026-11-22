import { describe, expect, it } from "vitest";
import { canAccessTeam } from "./access";

const team = { id: "team-1", courseId: "course-1" };

describe("PRD §6: team data is only readable by its members and course staff", () => {
  it("allows a student on the team", () => {
    expect(
      canAccessTeam(
        { role: "STUDENT", courseId: "course-1", teamId: "team-1" },
        team,
      ),
    ).toBe(true);
  });

  it("denies a student on another team in the same course", () => {
    expect(
      canAccessTeam(
        { role: "STUDENT", courseId: "course-1", teamId: "team-2" },
        team,
      ),
    ).toBe(false);
  });

  it("denies a student in the course without a team", () => {
    expect(
      canAccessTeam(
        { role: "STUDENT", courseId: "course-1", teamId: null },
        team,
      ),
    ).toBe(false);
  });

  it("allows staff of the team's course", () => {
    expect(
      canAccessTeam(
        { role: "STAFF", courseId: "course-1", teamId: null },
        team,
      ),
    ).toBe(true);
  });

  it("denies staff of a different course", () => {
    expect(
      canAccessTeam(
        { role: "STAFF", courseId: "course-2", teamId: null },
        team,
      ),
    ).toBe(false);
  });

  it("denies a student whose team id matches but whose course does not", () => {
    expect(
      canAccessTeam(
        { role: "STUDENT", courseId: "course-2", teamId: "team-1" },
        team,
      ),
    ).toBe(false);
  });

  it("denies a user with no membership in the course", () => {
    expect(canAccessTeam(null, team)).toBe(false);
  });
});
