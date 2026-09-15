CREATE TABLE `work_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`persona_key` text DEFAULT 'claims-planning' NOT NULL,
	`title` text NOT NULL,
	`assignee` text,
	`category` text,
	`due_date` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'direct' NOT NULL,
	`director_note_ref` text,
	`content` text,
	`rag_synced` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wq_persona_idx` ON `work_tasks` (`persona_key`);--> statement-breakpoint
CREATE INDEX `wq_status_idx` ON `work_tasks` (`status`);