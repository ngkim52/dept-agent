CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`period_from` integer,
	`period_to` integer,
	`summary` text,
	`conclusion` text,
	`source_ids` text,
	`token_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `episodes_dept_idx` ON `episodes` (`department_id`);--> statement-breakpoint
CREATE TABLE `improvement_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`persona_key` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_id` text NOT NULL,
	`summary` text,
	`action` text NOT NULL,
	`target_title` text,
	`proposed_content` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_note` text,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `candidates_persona_idx` ON `improvement_candidates` (`persona_key`);--> statement-breakpoint
CREATE INDEX `candidates_status_idx` ON `improvement_candidates` (`status`);--> statement-breakpoint
CREATE TABLE `knowledge_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`from_type` text NOT NULL,
	`from_id` text NOT NULL,
	`to_type` text NOT NULL,
	`to_id` text NOT NULL,
	`rel` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `edges_from_idx` ON `knowledge_edges` (`from_type`,`from_id`);