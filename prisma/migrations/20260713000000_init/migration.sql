-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentProviderType" AS ENUM ('CRYPTO_PAY', 'TELEGRAM_STARS', 'YOOKASSA', 'PAYCOM_UZ', 'BEPAID_BY', 'ROBOKASSA_KZ', 'PORTMONE_UA', 'UNLIMIT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "language" TEXT DEFAULT 'ru',
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paymentDate" TIMESTAMP(3),
    "subscriptionExpiry" TIMESTAMP(3),
    "lastPaymentProvider" TEXT,
    "abGroup" TEXT NOT NULL DEFAULT 'A',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProviderType" NOT NULL,
    "providerInvoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 1999,
    "oldPrice" INTEGER NOT NULL DEFAULT 2999,
    "priceCrypto" INTEGER NOT NULL DEFAULT 26,
    "price3" INTEGER NOT NULL DEFAULT 2999,
    "oldPrice3" INTEGER NOT NULL DEFAULT 4499,
    "price3Crypto" INTEGER NOT NULL DEFAULT 39,
    "price6" INTEGER NOT NULL DEFAULT 3499,
    "oldPrice6" INTEGER NOT NULL DEFAULT 5999,
    "price6Crypto" INTEGER NOT NULL DEFAULT 45,
    "priceStars" INTEGER NOT NULL DEFAULT 2000,
    "price3Stars" INTEGER NOT NULL DEFAULT 3000,
    "price6Stars" INTEGER NOT NULL DEFAULT 3500,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerInvoiceId_key" ON "Payment"("providerInvoiceId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_providerInvoiceId_idx" ON "Payment"("providerInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "AbConfig_name_key" ON "AbConfig"("name");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
