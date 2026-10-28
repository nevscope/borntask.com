-- AlterTable
ALTER TABLE `User` MODIFY `authProvider` ENUM('google', 'microsoft', 'email') NULL;

-- CreateTable
CREATE TABLE `EmailLoginCode` (
    `challengeId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `linkHash` VARCHAR(191) NOT NULL,
    `nextPath` TEXT NULL,
    `inviteToken` VARCHAR(191) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,

    UNIQUE INDEX `EmailLoginCode_linkHash_key`(`linkHash`),
    INDEX `EmailLoginCode_email_idx`(`email`),
    PRIMARY KEY (`challengeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
