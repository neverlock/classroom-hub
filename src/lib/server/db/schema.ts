import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Dates are ISO `YYYY-MM-DD` text; timestamps are unix milliseconds. */
const now = sql`(unixepoch() * 1000)`;

export const classes = sqliteTable('classes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** URL slug, e.g. `p5-1`. Never changes: it is the permanent link of the room. */
	slug: text('slug').notNull().unique(),
	/** The term the home page shows. Set by an admin, not guessed from today's date. */
	currentTermId: integer('current_term_id'),
	/** 0 = closed: everybody can read, every write is rejected. */
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull().default(now)
});

export const terms = sqliteTable(
	'terms',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		classId: integer('class_id').notNull().references(() => classes.id),
		name: text('name').notNull(),
		/** Room name during this term (e.g. ป.6/1). Changes from year to year. */
		classLabel: text('class_label').notNull(),
		startDate: text('start_date').notNull(),
		endDate: text('end_date').notNull()
	},
	(t) => [index('terms_class_idx').on(t.classId, t.startDate)]
);

export const classAdmins = sqliteTable(
	'class_admins',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		classId: integer('class_id').notNull().references(() => classes.id),
		/** Name shown as the author on cards. */
		display: text('display').notNull(),
		/** Lower-case login name, unique inside the room. */
		username: text('username').notNull(),
		passwordHash: text('password_hash').notNull(),
		salt: text('salt').notNull(),
		iterations: integer('iterations').notNull(),
		/** Bumped on password reset / deactivation: signed-in devices are logged out. */
		sessionVersion: integer('session_version').notNull().default(1),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		lastLoginAt: integer('last_login_at'),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [uniqueIndex('class_admins_user_idx').on(t.classId, t.username)]
);

export const subjects = sqliteTable(
	'subjects',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		classId: integer('class_id').notNull().references(() => classes.id),
		code: text('code').notNull(),
		name: text('name').notNull(),
		teacher: text('teacher'),
		sortOrder: integer('sort_order').notNull().default(0),
		active: integer('active', { mode: 'boolean' }).notNull().default(true)
	},
	(t) => [uniqueIndex('subjects_code_idx').on(t.classId, t.code)]
);

export const students = sqliteTable(
	'students',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		classId: integer('class_id').notNull().references(() => classes.id),
		/** The "รหัส" a student types to post. */
		studentCode: text('student_code').notNull(),
		seatNo: integer('seat_no').notNull(),
		active: integer('active', { mode: 'boolean' }).notNull().default(true)
	},
	(t) => [uniqueIndex('students_code_idx').on(t.classId, t.studentCode)]
);

export const entries = sqliteTable(
	'entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		classId: integer('class_id').notNull().references(() => classes.id),
		entryDate: text('entry_date').notNull(),
		subjectId: integer('subject_id').notNull().references(() => subjects.id),
		lesson: text('lesson').notNull(),
		hasHomework: integer('has_homework', { mode: 'boolean' }).notNull().default(false),
		homeworkDetail: text('homework_detail'),
		homeworkDue: text('homework_due'),
		authorAdminId: integer('author_admin_id'),
		/** Snapshot of the author's display name at write time. */
		authorDisplay: text('author_display').notNull(),
		hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
		hiddenBy: text('hidden_by'),
		hiddenAt: integer('hidden_at'),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [
		// One card per subject per day. A hidden card keeps its slot; re-saving restores it.
		uniqueIndex('entries_day_subject_idx').on(t.classId, t.entryDate, t.subjectId),
		index('entries_due_idx').on(t.classId, t.hasHomework, t.homeworkDue)
	]
);

export const comments = sqliteTable(
	'comments',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		entryId: integer('entry_id').notNull().references(() => entries.id),
		studentId: integer('student_id').notNull().references(() => students.id),
		/** Snapshot of the seat number at post time, so old comments stay correct next year. */
		seatNo: integer('seat_no').notNull(),
		body: text('body').notNull().default(''),
		hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
		hiddenBy: text('hidden_by'),
		hiddenAt: integer('hidden_at'),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [index('comments_entry_idx').on(t.entryId)]
);

export const attachments = sqliteTable(
	'attachments',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		classId: integer('class_id').notNull().references(() => classes.id),
		entryId: integer('entry_id').references(() => entries.id),
		commentId: integer('comment_id').references(() => comments.id),
		r2Key: text('r2_key').notNull(),
		contentType: text('content_type').notNull(),
		size: integer('size').notNull(),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [index('attachments_entry_idx').on(t.entryId), index('attachments_comment_idx').on(t.commentId)]
);

/** Failed-login / bad-code counters for rate limiting (fixed window). */
export const authAttempts = sqliteTable('auth_attempts', {
	key: text('key').primaryKey(),
	count: integer('count').notNull(),
	windowStart: integer('window_start').notNull()
});
