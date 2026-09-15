ALTER TABLE `improvement_candidates` ADD `request_type` text DEFAULT 'admin_chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `improvement_candidates` ADD `proposed_by_role` text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE `improvement_candidates` ADD `source_conversation_id` text;