-- Only new jobs start at zero. Earlier provider dispatches cannot be reconstructed.
ALTER TABLE "sermonEvaluation" ADD COLUMN "expectedUsageAttempts" INTEGER;
