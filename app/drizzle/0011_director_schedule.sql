CREATE TABLE `director_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`title` text NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `director_schedule_date_idx` ON `director_schedule` (`date`);
