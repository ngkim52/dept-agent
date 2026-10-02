CREATE TABLE `debate_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `brief` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `duration_sec` integer DEFAULT 180 NOT NULL,
  `participant_keys` text DEFAULT '[]' NOT NULL,
  `round` integer DEFAULT 0 NOT NULL,
  `turn_count` integer DEFAULT 0 NOT NULL,
  `max_turns` integer DEFAULT 80 NOT NULL,
  `verdict` text,
  `report_path` text,
  `created_by` text,
  `started_at` integer,
  `ended_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `debate_sessions_status_idx` ON `debate_sessions` (`status`);
--> statement-breakpoint
CREATE TABLE `debate_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `seq` integer NOT NULL,
  `persona_key` text NOT NULL,
  `persona_name` text NOT NULL,
  `persona_emoji` text DEFAULT '' NOT NULL,
  `persona_color` text DEFAULT '#1F6C9F' NOT NULL,
  `kind` text DEFAULT 'member' NOT NULL,
  `round` integer DEFAULT 1 NOT NULL,
  `content` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `debate_sessions`(`id`)
);
--> statement-breakpoint
CREATE INDEX `debate_messages_session_idx` ON `debate_messages` (`session_id`,`seq`);
--> statement-breakpoint
CREATE TABLE `debate_personas` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `emoji` text DEFAULT '🙂' NOT NULL,
  `role` text DEFAULT '' NOT NULL,
  `stance` text DEFAULT '' NOT NULL,
  `tone` text DEFAULT '' NOT NULL,
  `color` text DEFAULT '#1F6C9F' NOT NULL,
  `system_prompt` text DEFAULT '' NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_by` text,
  `created_at` integer NOT NULL
);
