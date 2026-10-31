-- AlterTable
ALTER TABLE `Workspace` ADD COLUMN `timesheetPeriod` ENUM('daily', 'weekly') NOT NULL DEFAULT 'weekly',
    ADD COLUMN `timesheetUnit` ENUM('time', 'percent') NOT NULL DEFAULT 'time',
    ADD COLUMN `workingDays` JSON NOT NULL DEFAULT ('["mon","tue","wed","thu","fri"]');

-- CreateTable
CREATE TABLE `WorkspaceHoliday` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkspaceHoliday_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `WorkspaceHoliday_tenantId_date_key`(`tenantId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TimesheetEntry` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `periodKind` ENUM('daily', 'weekly') NOT NULL,
    `periodStart` DATE NOT NULL,
    `unit` ENUM('time', 'percent') NOT NULL,
    `minutes` INTEGER NULL,
    `percent` INTEGER NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TimesheetEntry_tenantId_userId_periodStart_idx`(`tenantId`, `userId`, `periodStart`),
    INDEX `TimesheetEntry_tenantId_projectId_idx`(`tenantId`, `projectId`),
    UNIQUE INDEX `TimesheetEntry_period_key`(`tenantId`, `userId`, `projectId`, `periodStart`, `periodKind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TimesheetDayOff` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `kind` ENUM('leave', 'other') NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TimesheetDayOff_tenantId_userId_date_idx`(`tenantId`, `userId`, `date`),
    UNIQUE INDEX `TimesheetDayOff_tenantId_userId_date_key`(`tenantId`, `userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WorkspaceHoliday` ADD CONSTRAINT `WorkspaceHoliday_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimesheetEntry` ADD CONSTRAINT `TimesheetEntry_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimesheetEntry` ADD CONSTRAINT `TimesheetEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimesheetEntry` ADD CONSTRAINT `TimesheetEntry_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimesheetDayOff` ADD CONSTRAINT `TimesheetDayOff_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimesheetDayOff` ADD CONSTRAINT `TimesheetDayOff_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
