ALTER TABLE "userProfile"
    ADD COLUMN "username" TEXT,
    ADD COLUMN "firstName" TEXT,
    ADD COLUMN "lastName" TEXT,
    ADD CONSTRAINT "userProfile_username_format"
        CHECK ("username" COLLATE "C" ~ '^[a-z0-9_]{3,32}$');

CREATE UNIQUE INDEX "userProfile_username_key" ON "userProfile"("username");
