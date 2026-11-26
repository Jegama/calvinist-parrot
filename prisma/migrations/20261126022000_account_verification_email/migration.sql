CREATE TABLE "accountVerificationEmail" (
  "appwriteUserId" TEXT PRIMARY KEY REFERENCES "userProfile"("appwriteUserId") ON DELETE CASCADE ON UPDATE CASCADE,
  "email" TEXT NOT NULL
);
