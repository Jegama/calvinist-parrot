-- Raise the sermon upload ceiling from 60 MiB to 100 MiB across both the
-- provisional upload reservation and verified audio asset invariants.
ALTER TABLE "sermonUploadReservation"
DROP CONSTRAINT IF EXISTS "sermonUploadReservation_byte_size_check",
ADD CONSTRAINT "sermonUploadReservation_byte_size_check"
  CHECK ("byteSize" BETWEEN 1 AND 104857600);

ALTER TABLE "sermonAudioAsset"
DROP CONSTRAINT IF EXISTS "sermonAudioAsset_byte_size_check",
ADD CONSTRAINT "sermonAudioAsset_byte_size_check"
  CHECK ("byteSize" BETWEEN 1 AND 104857600);
