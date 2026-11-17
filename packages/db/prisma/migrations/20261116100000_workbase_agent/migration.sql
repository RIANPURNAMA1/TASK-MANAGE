-- AlterTable
ALTER TABLE `checklistitem` ADD COLUMN `agentKey` VARCHAR(64) NULL,
    ADD COLUMN `createdByAgentId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Agent` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `divisionId` VARCHAR(191) NULL,
    `name` VARCHAR(80) NOT NULL,
    `description` VARCHAR(500) NULL,
    `provider` ENUM('ANTHROPIC', 'OPENAI', 'GEMINI', 'GROQ') NOT NULL DEFAULT 'ANTHROPIC',
    `model` VARCHAR(100) NOT NULL,
    `systemPrompt` TEXT NULL,
    `autonomyLevel` INTEGER NOT NULL DEFAULT 1,
    `allowedTools` JSON NOT NULL,
    `monthlyBudgetUsd` DECIMAL(10, 2) NOT NULL DEFAULT 20,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Agent_orgId_divisionId_idx`(`orgId`, `divisionId`),
    UNIQUE INDEX `Agent_orgId_name_key`(`orgId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersonalAgent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` ENUM('ANTHROPIC', 'OPENAI', 'GEMINI', 'GROQ') NOT NULL DEFAULT 'ANTHROPIC',
    `model` VARCHAR(100) NOT NULL,
    `delegatedPermissions` JSON NOT NULL,
    `monthlyBudgetUsd` DECIMAL(10, 2) NOT NULL DEFAULT 5,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PersonalAgent_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentRun` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NULL,
    `personalAgentId` VARCHAR(191) NULL,
    `parentRunId` VARCHAR(191) NULL,
    `conversationId` VARCHAR(191) NULL,
    `scheduleId` VARCHAR(191) NULL,
    `cardId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `triggeredById` VARCHAR(191) NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'WAITING', 'AWAITING_APPROVAL', 'COMPLETED', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `instruction` TEXT NOT NULL,
    `result` LONGTEXT NULL,
    `error` TEXT NULL,
    `depth` INTEGER NOT NULL DEFAULT 0,
    `inputTokens` INTEGER NOT NULL DEFAULT 0,
    `outputTokens` INTEGER NOT NULL DEFAULT 0,
    `costUsd` DECIMAL(12, 6) NOT NULL DEFAULT 0,
    `warnings` JSON NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentRun_orgId_createdAt_idx`(`orgId`, `createdAt`),
    INDEX `AgentRun_personalAgentId_createdAt_idx`(`personalAgentId`, `createdAt`),
    INDEX `AgentRun_agentId_createdAt_idx`(`agentId`, `createdAt`),
    INDEX `AgentRun_parentRunId_idx`(`parentRunId`),
    INDEX `AgentRun_conversationId_idx`(`conversationId`),
    INDEX `AgentRun_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentStep` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `type` ENUM('LLM', 'TOOL', 'SYSTEM') NOT NULL,
    `toolName` VARCHAR(100) NULL,
    `input` JSON NULL,
    `output` LONGTEXT NULL,
    `isError` BOOLEAN NOT NULL DEFAULT false,
    `inputTokens` INTEGER NOT NULL DEFAULT 0,
    `outputTokens` INTEGER NOT NULL DEFAULT 0,
    `costUsd` DECIMAL(12, 6) NOT NULL DEFAULT 0,
    `durationMs` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentStep_toolName_idx`(`toolName`),
    UNIQUE INDEX `AgentStep_runId_seq_key`(`runId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentApproval` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `toolName` VARCHAR(100) NOT NULL,
    `input` JSON NOT NULL,
    `risk` VARCHAR(20) NOT NULL,
    `summary` VARCHAR(500) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `ownerId` VARCHAR(191) NOT NULL,
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentApproval_ownerId_status_idx`(`ownerId`, `status`),
    INDEX `AgentApproval_runId_idx`(`runId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentSkill` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `divisionId` VARCHAR(191) NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `instructions` TEXT NOT NULL,
    `status` ENUM('PROPOSED', 'APPROVED', 'DISABLED') NOT NULL DEFAULT 'PROPOSED',
    `version` INTEGER NOT NULL DEFAULT 1,
    `supersedesId` VARCHAR(191) NULL,
    `sourceRunId` VARCHAR(191) NULL,
    `proposedByAgentId` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentSkill_orgId_divisionId_status_idx`(`orgId`, `divisionId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkillUsage` (
    `id` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `outcome` ENUM('SUCCESS', 'FAILED', 'REVISED') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SkillUsage_skillId_idx`(`skillId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentMemory` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `scope` ENUM('USER', 'PROJECT', 'DIVISION', 'ORG') NOT NULL,
    `scopeId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `source` ENUM('MANUAL', 'AGENT_PROPOSED') NOT NULL DEFAULT 'MANUAL',
    `status` ENUM('PROPOSED', 'ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `sourceRunId` VARCHAR(191) NULL,
    `vectorId` VARCHAR(191) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentMemory_orgId_scope_scopeId_status_idx`(`orgId`, `scope`, `scopeId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeDoc` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `scope` ENUM('USER', 'PROJECT', 'DIVISION', 'ORG') NOT NULL,
    `scopeId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `fileKey` VARCHAR(500) NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `status` ENUM('UPLOADED', 'INDEXING', 'READY', 'FAILED') NOT NULL DEFAULT 'UPLOADED',
    `chunkCount` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `KnowledgeDoc_orgId_scope_scopeId_idx`(`orgId`, `scope`, `scopeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeChunk` (
    `id` VARCHAR(191) NOT NULL,
    `docId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `text` TEXT NOT NULL,
    `vectorId` VARCHAR(191) NULL,
    `tokenCount` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `KnowledgeChunk_docId_seq_key`(`docId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NULL,
    `personalAgentId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `naturalText` VARCHAR(500) NOT NULL,
    `cronExpr` VARCHAR(100) NOT NULL,
    `timezone` VARCHAR(60) NOT NULL DEFAULT 'Asia/Jakarta',
    `instruction` TEXT NOT NULL,
    `targetCardId` VARCHAR(191) NULL,
    `targetProjectId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastRunAt` DATETIME(3) NULL,
    `nextRunAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentSchedule_isActive_nextRunAt_idx`(`isActive`, `nextRunAt`),
    INDEX `AgentSchedule_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentConversation` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('PERSONAL', 'PROJECT_CHAT') NOT NULL,
    `personalAgentId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `title` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentConversation_personalAgentId_updatedAt_idx`(`personalAgentId`, `updatedAt`),
    INDEX `AgentConversation_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentMessage` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `role` ENUM('USER', 'AGENT', 'SYSTEM') NOT NULL,
    `content` LONGTEXT NOT NULL,
    `runId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentMessage_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `McpConnection` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `encryptedCredentials` TEXT NOT NULL,
    `scopes` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    `connectedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `McpConnection_orgId_provider_key`(`orgId`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `ChecklistItem_cardId_agentKey_key` ON `ChecklistItem`(`cardId`, `agentKey`);

-- AddForeignKey
ALTER TABLE `PersonalAgent` ADD CONSTRAINT `PersonalAgent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentStep` ADD CONSTRAINT `AgentStep_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `AgentRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentApproval` ADD CONSTRAINT `AgentApproval_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `AgentRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillUsage` ADD CONSTRAINT `SkillUsage_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `AgentSkill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeChunk` ADD CONSTRAINT `KnowledgeChunk_docId_fkey` FOREIGN KEY (`docId`) REFERENCES `KnowledgeDoc`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentMessage` ADD CONSTRAINT `AgentMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `AgentConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

