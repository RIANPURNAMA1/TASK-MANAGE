-- AlterTable
ALTER TABLE `agent` ADD COLUMN `botUserId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Agent_botUserId_key` ON `Agent`(`botUserId`);

