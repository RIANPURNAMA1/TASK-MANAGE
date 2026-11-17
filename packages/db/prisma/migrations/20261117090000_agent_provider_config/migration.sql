-- CreateTable
CREATE TABLE `AgentProviderConfig` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('ANTHROPIC', 'OPENAI', 'GEMINI', 'GROQ') NOT NULL,
    `encryptedApiKey` TEXT NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AgentProviderConfig_provider_key`(`provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
