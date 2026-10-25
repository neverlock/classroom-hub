/** Shapes sent from the server to pages (JSON-safe). */
export interface CommentView {
	id: number;
	seatNo: number;
	body: string;
	createdAt: number;
	photos: number[];
}

export interface CardView {
	id: number;
	date: string;
	subject: { id: number; code: string; name: string; teacher: string | null };
	lesson: string;
	hasHomework: boolean;
	homeworkDetail: string;
	homeworkDue: string | null;
	author: string;
	/** The signed-in viewer may edit/hide this card (room admin, or the student who wrote it). */
	canEdit: boolean;
	photos: number[];
	comments: CommentView[];
}

export interface HomeworkRow {
	id: number;
	subjectCode: string;
	subjectName: string;
	detail: string;
	due: string;
}
