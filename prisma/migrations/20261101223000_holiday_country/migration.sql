-- Existing WorkspaceHoliday rows stay countryCode NULL = Everyone.
-- They used to be unique per date and applied to every person.

ALTER TABLE `Workspace` ADD COLUMN `defaultHolidayCountry` CHAR(2) NULL;

ALTER TABLE `TenantMember` ADD COLUMN `holidayCountry` CHAR(2) NULL;

ALTER TABLE `WorkspaceHoliday` ADD COLUMN `countryCode` CHAR(2) NULL;

ALTER TABLE `WorkspaceHoliday` DROP INDEX `WorkspaceHoliday_tenantId_date_key`;

CREATE UNIQUE INDEX `WorkspaceHoliday_tenantId_date_countryCode_key` ON `WorkspaceHoliday`(`tenantId`, `date`, `countryCode`);

-- MySQL unique indexes treat NULL as distinct; this keeps one Everyone row per date.
CREATE UNIQUE INDEX `WorkspaceHoliday_tenantId_date_everyone_key` ON `WorkspaceHoliday`(`tenantId`, `date`, (IFNULL(`countryCode`, '')));
