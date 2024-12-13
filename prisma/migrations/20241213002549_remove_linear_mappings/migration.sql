/*
  Warnings:

  - You are about to drop the column `linearTeamId` on the `milestones` table. All the data in the column will be lost.
  - You are about to drop the column `linearIssueId` on the `synced_issues` table. All the data in the column will be lost.
  - You are about to drop the column `linearIssueNumber` on the `synced_issues` table. All the data in the column will be lost.
  - You are about to drop the column `linearTeamId` on the `synced_issues` table. All the data in the column will be lost.
  - You are about to drop the column `linearApiKey` on the `syncs` table. All the data in the column will be lost.
  - You are about to drop the column `linearApiKeyIV` on the `syncs` table. All the data in the column will be lost.
  - You are about to drop the column `linearTeamId` on the `syncs` table. All the data in the column will be lost.
  - You are about to drop the column `linearUserId` on the `syncs` table. All the data in the column will be lost.
  - You are about to drop the column `linearEmail` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `linearUserId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `linearUsername` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[milestoneId,githubRepoId,shortcutTeamId]` on the table `milestones` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[githubUserId,shortcutUserId,githubRepoId,shortcutTeamId]` on the table `syncs` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[githubUserId,shortcutUserId]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `shortcutTeamId` to the `milestones` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortcutStoryId` to the `synced_issues` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortcutStoryNumber` to the `synced_issues` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortcutTeamId` to the `synced_issues` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortcutApiKey` to the `syncs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortcutApiKeyIV` to the `syncs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortcutTeamId` to the `syncs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortcutUserId` to the `syncs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortcutUserId` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortcutUsername` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "milestones" DROP CONSTRAINT IF EXISTS "milestones_linearTeamId_fkey";

-- DropForeignKey
ALTER TABLE "synced_issues" DROP CONSTRAINT IF EXISTS "synced_issues_linearTeamId_fkey";

-- DropForeignKey
ALTER TABLE "syncs" DROP CONSTRAINT IF EXISTS "syncs_linearTeamId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "milestones_milestoneId_githubRepoId_iterationId_linearTeamId_key";

-- DropIndex
DROP INDEX IF EXISTS "syncs_githubUserId_linearUserId_githubRepoId_linearTeamId_key";

-- DropIndex
DROP INDEX IF EXISTS "users_githubUserId_linearUserId_key";

-- AlterTable
ALTER TABLE "milestones" DROP COLUMN IF EXISTS "linearTeamId",
ADD COLUMN     "shortcutTeamId" TEXT NOT NULL,
ALTER COLUMN "iterationId" DROP NOT NULL,
ADD COLUMN     "epicId" TEXT;

-- AlterTable
ALTER TABLE "synced_issues" DROP COLUMN IF EXISTS "linearIssueId",
DROP COLUMN IF EXISTS "linearIssueNumber",
DROP COLUMN IF EXISTS "linearTeamId",
ADD COLUMN     "shortcutStoryId" TEXT NOT NULL,
ADD COLUMN     "shortcutStoryNumber" INTEGER NOT NULL,
ADD COLUMN     "shortcutTeamId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "syncs" DROP COLUMN IF EXISTS "linearApiKey",
DROP COLUMN IF EXISTS "linearApiKeyIV",
DROP COLUMN IF EXISTS "linearTeamId",
DROP COLUMN IF EXISTS "linearUserId",
ADD COLUMN     "shortcutApiKey" TEXT NOT NULL,
ADD COLUMN     "shortcutApiKeyIV" TEXT NOT NULL,
ADD COLUMN     "shortcutTeamId" TEXT NOT NULL,
ADD COLUMN     "shortcutUserId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN IF EXISTS "linearEmail",
DROP COLUMN IF EXISTS "linearUserId",
DROP COLUMN IF EXISTS "linearUsername",
ADD COLUMN     "shortcutEmail" TEXT,
ADD COLUMN     "shortcutUserId" TEXT NOT NULL,
ADD COLUMN     "shortcutUsername" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "milestones_milestoneId_githubRepoId_shortcutTeamId_key" ON "milestones"("milestoneId", "githubRepoId", "shortcutTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "syncs_githubUserId_shortcutUserId_githubRepoId_shortcutTeam_key" ON "syncs"("githubUserId", "shortcutUserId", "githubRepoId", "shortcutTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "users_githubUserId_shortcutUserId_key" ON "users"("githubUserId", "shortcutUserId");

-- AddForeignKey
ALTER TABLE "synced_issues" ADD CONSTRAINT "synced_issues_shortcutTeamId_fkey" FOREIGN KEY ("shortcutTeamId") REFERENCES "shortcut_teams"("teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syncs" ADD CONSTRAINT "syncs_shortcutTeamId_fkey" FOREIGN KEY ("shortcutTeamId") REFERENCES "shortcut_teams"("teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_shortcutTeamId_fkey" FOREIGN KEY ("shortcutTeamId") REFERENCES "shortcut_teams"("teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
