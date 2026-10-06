-- CreateEnum
CREATE TYPE "CouponMethod" AS ENUM ('CODE', 'AUTOMATIC');

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "method" "CouponMethod" NOT NULL DEFAULT 'CODE';
