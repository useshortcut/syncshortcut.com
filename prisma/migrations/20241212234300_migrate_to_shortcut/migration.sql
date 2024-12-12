/*
  Warnings:

  - You are about to drop the `linear_teams` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "milestones" DROP CONSTRAINT "milestones_githubRepoId_fkey";

-- DropForeignKey
ALTER TABLE "milestones" DROP CONSTRAINT "milestones_linearTeamId_fkey";

-- DropForeignKey
ALTER TABLE "synced_issues" DROP CONSTRAINT "synced_issues_githubRepoId_fkey";

-- DropForeignKey
ALTER TABLE "synced_issues" DROP CONSTRAINT "synced_issues_linearTeamId_fkey";

-- DropForeignKey
ALTER TABLE "syncs" DROP CONSTRAINT "syncs_githubRepoId_fkey";

-- DropForeignKey
ALTER TABLE "syncs" DROP CONSTRAINT "syncs_linearTeamId_fkey";

-- AlterTable
ALTER TABLE "github_repos" ALTER COLUMN "repoId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "milestones" ALTER COLUMN "githubRepoId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "synced_issues" ALTER COLUMN "githubIssueNumber" SET DATA TYPE BIGINT,
ALTER COLUMN "githubIssueId" SET DATA TYPE BIGINT,
ALTER COLUMN "githubRepoId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "syncs" ALTER COLUMN "githubUserId" SET DATA TYPE BIGINT,
ALTER COLUMN "githubRepoId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "githubUserId" SET DATA TYPE BIGINT;

-- DropTable
DROP TABLE "linear_teams";

-- CreateTable
CREATE TABLE "shortcut_teams" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "publicLabelId" TEXT NOT NULL,
    "archivedStateId" TEXT NOT NULL,
    "doneStateId" TEXT NOT NULL,
    "startedStateId" TEXT NOT NULL,

    CONSTRAINT "shortcut_teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shortcut_teams_teamId_key" ON "shortcut_teams"("teamId");

-- AddForeignKey
ALTER TABLE "synced_issues" ADD CONSTRAINT "synced_issues_linearTeamId_fkey" FOREIGN KEY ("linearTeamId") REFERENCES "shortcut_teams"("teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synced_issues" ADD CONSTRAINT "synced_issues_githubRepoId_fkey" FOREIGN KEY ("githubRepoId") REFERENCES "github_repos"("repoId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syncs" ADD CONSTRAINT "syncs_githubRepoId_fkey" FOREIGN KEY ("githubRepoId") REFERENCES "github_repos"("repoId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syncs" ADD CONSTRAINT "syncs_linearTeamId_fkey" FOREIGN KEY ("linearTeamId") REFERENCES "shortcut_teams"("teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_githubRepoId_fkey" FOREIGN KEY ("githubRepoId") REFERENCES "github_repos"("repoId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_linearTeamId_fkey" FOREIGN KEY ("linearTeamId") REFERENCES "shortcut_teams"("teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
