ALTER TABLE `conversations` ADD `category_key` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `category_label` text;--> statement-breakpoint
ALTER TABLE `users` ADD `response_style` text DEFAULT 'coaching' NOT NULL;