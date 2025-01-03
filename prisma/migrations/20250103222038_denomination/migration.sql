-- AlterTable
ALTER TABLE "chatHistory" ADD COLUMN     "denomination" TEXT NOT NULL DEFAULT 'reformed-baptist';

-- AlterTable
ALTER TABLE "questionHistory" ADD COLUMN     "denomination" TEXT NOT NULL DEFAULT 'reformed-baptist';
