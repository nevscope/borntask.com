-- AlterTable
ALTER TABLE `TenantMember` ADD COLUMN `workingDays` JSON NULL,
    ADD COLUMN `hoursPerWeek` DECIMAL(5, 2) NULL;

-- AlterTable
ALTER TABLE `Invitation` ADD COLUMN `workingDays` JSON NULL,
    ADD COLUMN `hoursPerWeek` DECIMAL(5, 2) NULL;
