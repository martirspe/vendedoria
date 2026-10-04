-- AlterEnum
ALTER TYPE "ProductKind" ADD VALUE 'DIGITAL';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "digitalAccessUrl" TEXT,
ADD COLUMN     "digitalInstructions" TEXT;
