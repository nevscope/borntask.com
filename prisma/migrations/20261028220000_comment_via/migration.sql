-- AlterTable
ALTER TABLE `Comment` ADD COLUMN `via` ENUM('app', 'mcp', 'github', 'import', 'automation') NOT NULL DEFAULT 'app';
