CREATE TABLE `knowledge_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`persona_key` text NOT NULL,
	`kind` text DEFAULT 'fact' NOT NULL,
	`content` text NOT NULL,
	`tags` text,
	`active` integer DEFAULT true NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`source_conversation_id` text,
	`source_message_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_memories_persona_idx` ON `knowledge_memories` (`persona_key`);--> statement-breakpoint
CREATE TABLE `knowledge_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`persona_key` text NOT NULL,
	`kind` text DEFAULT 'addendum' NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`source_type` text,
	`source_id` text,
	`order_idx` integer DEFAULT 0 NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_prompts_persona_idx` ON `knowledge_prompts` (`persona_key`);--> statement-breakpoint
CREATE TABLE `knowledge_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`persona_key` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`source_type` text,
	`source_id` text,
	`order_idx` integer DEFAULT 0 NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_skills_persona_idx` ON `knowledge_skills` (`persona_key`);--> statement-breakpoint
CREATE TABLE `knowledge_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_type` text NOT NULL,
	`entry_id` text NOT NULL,
	`content_before` text,
	`content_after` text,
	`action` text NOT NULL,
	`changed_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_versions_entry_idx` ON `knowledge_versions` (`entry_type`,`entry_id`);--> statement-breakpoint
CREATE INDEX `conversations_user_idx` ON `conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `documents_user_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);