-- AlterTable: company-scoped push notification eligibility (default false — opt-in)
ALTER TABLE "UserMembership" ADD COLUMN "receiveNotifications" BOOLEAN NOT NULL DEFAULT false;
