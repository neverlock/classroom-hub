CREATE TABLE `gpa_courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gpa_courses_slug_unique` ON `gpa_courses` (`slug`);--> statement-breakpoint
CREATE TABLE `gpa_subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`term_no` integer NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`credit2` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `gpa_courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gpa_subjects_course_idx` ON `gpa_subjects` (`course_id`,`term_no`,`sort_order`);