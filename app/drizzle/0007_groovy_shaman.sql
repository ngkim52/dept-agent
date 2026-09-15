CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`title` text NOT NULL,
	`category_key` text,
	`raw_text` text NOT NULL,
	`minutes_json` text,
	`knowledge_applied` integer DEFAULT false NOT NULL,
	`source_name` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meetings_dept_idx` ON `meetings` (`department_id`);