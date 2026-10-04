-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('PRODUCT', 'SERVICE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'PRODUCT',
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "serviceMode" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "serviceNote" TEXT;
