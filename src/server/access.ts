import "server-only";
import { canAccessTeam } from "@/lib/access";
import { prisma } from "@/server/db";

// Returns the team if the user may access it (PRD §6), otherwise null, so
// callers can't tell a missing team from a forbidden one.
export async function requireTeamAccess(userId: string, teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, courseId: true },
  });
  if (!team) return null;
  const membership = await prisma.membership.findUnique({
    where: { courseId_userId: { courseId: team.courseId, userId } },
    select: { role: true, courseId: true, teamId: true },
  });
  return canAccessTeam(membership, team) ? team : null;
}
