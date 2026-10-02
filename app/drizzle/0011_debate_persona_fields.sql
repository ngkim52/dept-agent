ALTER TABLE `debate_sessions` ADD `attachment_name` text;--> statement-breakpoint
ALTER TABLE `debate_personas` ADD `expertise` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `debate_personas` ADD `goal` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `debate_personas` ADD `red_line` text DEFAULT '' NOT NULL;
