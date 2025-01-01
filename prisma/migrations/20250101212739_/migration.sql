/*
  Warnings:

  - A unique constraint covering the columns `[devotional_id]` on the table `parrotDevotionals` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "parrotDevotionals_devotional_id_key" ON "parrotDevotionals"("devotional_id");
