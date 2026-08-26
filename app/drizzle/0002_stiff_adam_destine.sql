CREATE TABLE `department_datasets` (
	`department_id` text NOT NULL,
	`dataset_id` text NOT NULL,
	`dataset_name` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`department_id`, `dataset_id`),
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `department_datasets_dept_idx` ON `department_datasets` (`department_id`);