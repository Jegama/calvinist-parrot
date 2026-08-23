-- Existing development databases may retain the earlier storage-pointer
-- constraint even though fresh installs permit rejected assets to clear their
-- Appwrite pointer after best-effort deletion. Converge both database paths.
BEGIN;

ALTER TABLE "sermonAudioAsset"
DROP CONSTRAINT IF EXISTS "sermonAudioAsset_storage_pointer_check";

ALTER TABLE "sermonAudioAsset"
ADD CONSTRAINT "sermonAudioAsset_storage_pointer_check"
CHECK (
  (
    "verificationState" = 'DELETED'
    AND "deletedAt" IS NOT NULL
    AND (
      ("appwriteBucketId" IS NULL AND "appwriteFileId" IS NULL)
      OR ("appwriteBucketId" IS NOT NULL AND "appwriteFileId" IS NOT NULL)
    )
  )
  OR (
    "verificationState" = 'REJECTED'
    AND "deletedAt" IS NULL
    AND (
      ("appwriteBucketId" IS NULL AND "appwriteFileId" IS NULL)
      OR ("appwriteBucketId" IS NOT NULL AND "appwriteFileId" IS NOT NULL)
    )
  )
  OR (
    "verificationState" NOT IN ('DELETED', 'REJECTED')
    AND "appwriteBucketId" IS NOT NULL
    AND "appwriteFileId" IS NOT NULL
    AND "deletedAt" IS NULL
  )
);

COMMIT;
