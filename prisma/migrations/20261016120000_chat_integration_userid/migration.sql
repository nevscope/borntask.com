-- AlterTable
ALTER TABLE `ChatIntegration` ADD COLUMN `userId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ChatIntegration_tenantId_userId_provider_key` ON `ChatIntegration`(`tenantId`, `userId`, `provider`);

-- AddForeignKey
ALTER TABLE `ChatIntegration` ADD CONSTRAINT `ChatIntegration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
