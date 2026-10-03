-- AlterTable
ALTER TABLE "ProductMedia" ADD COLUMN "sourceHash" TEXT;

-- CreateIndex
CREATE INDEX "ProductMedia_sourceHash_idx" ON "ProductMedia"("sourceHash");
