-- CreateTable
CREATE TABLE `GitHubInstallation` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `installationId` VARCHAR(191) NOT NULL,
    `accountLogin` VARCHAR(191) NOT NULL,
    `installedByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GitHubInstallation_installationId_key`(`installationId`),
    INDEX `GitHubInstallation_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectRepo` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `installationId` VARCHAR(191) NOT NULL,
    `repoFullName` VARCHAR(191) NOT NULL,
    `defaultBranch` VARCHAR(191) NOT NULL DEFAULT 'main',

    INDEX `ProjectRepo_tenantId_idx`(`tenantId`),
    INDEX `ProjectRepo_repoFullName_idx`(`repoFullName`),
    UNIQUE INDEX `ProjectRepo_projectId_repoFullName_key`(`projectId`, `repoFullName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectGithubSettings` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `branchTemplate` VARCHAR(191) NOT NULL DEFAULT '{type}/{key}-{title}',
    `rules` JSON NOT NULL,

    UNIQUE INDEX `ProjectGithubSettings_projectId_key`(`projectId`),
    INDEX `ProjectGithubSettings_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DevLink` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `kind` ENUM('branch', 'pr', 'commit') NOT NULL,
    `repoFullName` VARCHAR(191) NOT NULL,
    `ref` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `prState` VARCHAR(191) NULL,
    `checks` ENUM('pending', 'running', 'passed', 'failed') NULL,
    `authorLogin` VARCHAR(191) NULL,
    `extra` VARCHAR(191) NULL,

    INDEX `DevLink_tenantId_taskId_idx`(`tenantId`, `taskId`),
    UNIQUE INDEX `DevLink_taskId_kind_repoFullName_ref_key`(`taskId`, `kind`, `repoFullName`, `ref`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GitHubEventLog` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `text` TEXT NOT NULL,
    `result` VARCHAR(191) NOT NULL,
    `tone` VARCHAR(191) NOT NULL DEFAULT 'ink',

    INDEX `GitHubEventLog_tenantId_projectId_at_idx`(`tenantId`, `projectId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GitHubInstallation` ADD CONSTRAINT `GitHubInstallation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GitHubInstallation` ADD CONSTRAINT `GitHubInstallation_installedByUserId_fkey` FOREIGN KEY (`installedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRepo` ADD CONSTRAINT `ProjectRepo_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRepo` ADD CONSTRAINT `ProjectRepo_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRepo` ADD CONSTRAINT `ProjectRepo_installationId_fkey` FOREIGN KEY (`installationId`) REFERENCES `GitHubInstallation`(`installationId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectGithubSettings` ADD CONSTRAINT `ProjectGithubSettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectGithubSettings` ADD CONSTRAINT `ProjectGithubSettings_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DevLink` ADD CONSTRAINT `DevLink_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DevLink` ADD CONSTRAINT `DevLink_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GitHubEventLog` ADD CONSTRAINT `GitHubEventLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GitHubEventLog` ADD CONSTRAINT `GitHubEventLog_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
