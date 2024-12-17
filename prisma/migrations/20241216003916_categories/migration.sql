/*
  Warnings:

  - Added the required column `category` to the `chatHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `issue_type` to the `chatHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subcategory` to the `chatHistory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "chatHistory" ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "issue_type" TEXT NOT NULL,
ADD COLUMN     "subcategory" TEXT NOT NULL;
