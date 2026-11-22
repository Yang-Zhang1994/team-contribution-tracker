// Who may read or sync a team's data (PRD §6): its own students, and staff
// of the team's course.

export type MembershipAccess = {
  role: "STAFF" | "STUDENT";
  courseId: string;
  teamId: string | null;
};

export type TeamRef = { id: string; courseId: string };

export function canAccessTeam(
  membership: MembershipAccess | null,
  team: TeamRef,
): boolean {
  if (!membership || membership.courseId !== team.courseId) return false;
  if (membership.role === "STAFF") return true;
  return membership.teamId === team.id;
}
