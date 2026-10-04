-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('BUSINESS', 'INDIVIDUAL');

-- AlterTable
ALTER TABLE "Storefront" ADD COLUMN     "dni" TEXT,
ADD COLUMN     "legalDistrict" TEXT,
ADD COLUMN     "sellerType" "SellerType" NOT NULL DEFAULT 'BUSINESS';
