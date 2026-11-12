CREATE TABLE `comment_reads` (
	`student_id` integer NOT NULL,
	`entry_id` integer NOT NULL,
	`last_comment_id` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`student_id`, `entry_id`),
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
