ALTER TABLE `WorkflowStatus` ADD COLUMN `colour` VARCHAR(191) NOT NULL DEFAULT '#8A9086';

UPDATE `WorkflowStatus` SET `colour` = '#8A9086' WHERE `category` = 'backlog';
UPDATE `WorkflowStatus` SET `colour` = '#2F6FDB' WHERE `category` = 'active';
UPDATE `WorkflowStatus` SET `colour` = '#E0731F' WHERE `category` = 'review';
UPDATE `WorkflowStatus` SET `colour` = '#178A5C' WHERE `category` = 'done';
