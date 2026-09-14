ALTER TABLE "User" ADD COLUMN "profileModules" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Campaign" ADD COLUMN "allowedCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "creatorCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "minimumCreatorFollowers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_minimumCreatorFollowers_check" CHECK ("minimumCreatorFollowers" >= 0);
