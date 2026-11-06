-- CreateTable
CREATE TABLE `CustomField` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('dropdown', 'text', 'date') NOT NULL,
    `options` JSON NOT NULL,
    `appliesTo` JSON NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomField_tenantId_projectId_idx`(`tenantId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomFieldValue` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `fieldId` VARCHAR(191) NOT NULL,
    `value` VARCHAR(200) NOT NULL,

    UNIQUE INDEX `CustomFieldValue_taskId_fieldId_key`(`taskId`, `fieldId`),
    INDEX `CustomFieldValue_tenantId_fieldId_idx`(`tenantId`, `fieldId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CustomField` ADD CONSTRAINT `CustomField_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomField` ADD CONSTRAINT `CustomField_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomFieldValue` ADD CONSTRAINT `CustomFieldValue_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomFieldValue` ADD CONSTRAINT `CustomFieldValue_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomFieldValue` ADD CONSTRAINT `CustomFieldValue_fieldId_fkey` FOREIGN KEY (`fieldId`) REFERENCES `CustomField`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
