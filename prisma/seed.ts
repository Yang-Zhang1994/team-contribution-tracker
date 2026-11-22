// Seeds one course, one team and its public repository so "Sync now" can be
// tried before course management (US2) exists. Idempotent.
//
// 1. Sign in with GitHub on the app at least once (creates your user).
// 2. Set SEED_REPO=owner/name (a public repo) in .env.
// 3. npx prisma db seed, then open /teams/seed-team.
//
// Every user who has signed in becomes a student on the team, except the one
// whose GitHub user ID is SEED_STAFF_GITHUB_ID (optional), who becomes staff.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";

const env = z
  .object({
    SEED_REPO: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/, "SEED_REPO must look like owner/name"),
    // Empty (as in .env.example) means no staff user.
    SEED_STAFF_GITHUB_ID: z
      .string()
      .regex(/^\d*$/, "SEED_STAFF_GITHUB_ID must be a numeric GitHub user ID")
      .optional()
      .transform((id) => id || undefined),
  })
  .parse(process.env);

const COURSE_ID = "seed-course";
const TEAM_ID = "seed-team";

// Direct connection, like prisma.config.ts. Not src/server/db.ts, which is
// set up for Vercel functions.
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  }),
});

async function main() {
  const [owner, name] = env.SEED_REPO.split("/");

  await prisma.course.upsert({
    where: { id: COURSE_ID },
    create: {
      id: COURSE_ID,
      name: "CS6983 AI Coding",
      timeZone: "America/Los_Angeles",
    },
    update: {},
  });
  await prisma.team.upsert({
    where: { id: TEAM_ID },
    create: { id: TEAM_ID, courseId: COURSE_ID, name: "Seed team" },
    update: {},
  });

  // Pointing the team at a different repo drops the old repo's activity.
  const existing = await prisma.repository.findUnique({
    where: { teamId: TEAM_ID },
  });
  if (existing && (existing.owner !== owner || existing.name !== name)) {
    await prisma.repository.delete({ where: { id: existing.id } });
  }
  await prisma.repository.upsert({
    where: { teamId: TEAM_ID },
    create: { teamId: TEAM_ID, owner, name },
    update: {},
  });

  const users = await prisma.user.findMany({
    where: { accounts: { some: { provider: "github" } } },
    select: {
      id: true,
      name: true,
      accounts: {
        where: { provider: "github" },
        select: { providerAccountId: true },
      },
    },
  });
  if (users.length === 0) {
    console.warn("No users yet: sign in with GitHub once, then seed again.");
  }

  for (const user of users) {
    const isStaff =
      user.accounts[0]?.providerAccountId === env.SEED_STAFF_GITHUB_ID;
    const membership = isStaff
      ? { role: "STAFF" as const, teamId: null }
      : { role: "STUDENT" as const, teamId: TEAM_ID };
    await prisma.membership.upsert({
      where: { courseId_userId: { courseId: COURSE_ID, userId: user.id } },
      create: { courseId: COURSE_ID, userId: user.id, ...membership },
      update: membership,
    });
    console.log(`${user.name ?? user.id}: ${membership.role}`);
  }

  console.log(`Seeded ${owner}/${name}. Open /teams/${TEAM_ID}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
