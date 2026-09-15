CREATE TABLE `qa_consolidations` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_question` text NOT NULL,
	`intent` text,
	`merged_answer` text NOT NULL,
	`summary` text,
	`entities` text,
	`source_conversation_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`turns` integer DEFAULT 1 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`rag_document_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `qa_question_idx` ON `qa_consolidations` (`canonical_question`);
--> statement-breakpoint
CREATE INDEX `qa_status_idx` ON `qa_consolidations` (`status`);
--> statement-breakpoint
CREATE TABLE `qa_links` (
	`id` text PRIMARY KEY NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`relation` text NOT NULL,
	`weight` real DEFAULT 0.5 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `qa_link_from_idx` ON `qa_links` (`from_id`);
