export type Role = 'teacher' | 'student';
export type QuestionType = 'multiple_choice' | 'short_answer';
export type ActivityStatus = 'draft' | 'published';
export type LocalSyncStatus = 'DRAFT' | 'PENDING_SYNC' | 'SYNCING' | 'SYNCED' | 'SYNC_FAILED';
export type ServerSubmissionStatus = 'received' | 'synced';

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface QuestionOption {
  id: string;
  label: string;
  isCorrect: boolean;
  position: number;
}

export interface Question {
  id: string;
  activityId: string;
  type: QuestionType;
  prompt: string;
  points: number;
  correctAnswer: string | null;
  position: number;
  options?: QuestionOption[];
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  type: string;
  teacherId: string;
  teacherName?: string;
  status: ActivityStatus;
  code: string | null;
  deadline: string | null;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

export interface AnswerInput {
  questionId: string;
  answer: string;
}

export interface Submission {
  id: string;
  clientSubmissionId: string;
  activityId: string;
  activityTitle?: string;
  studentId: string;
  studentName?: string;
  status: ServerSubmissionStatus;
  score: number;
  maxScore: number;
  submittedAt: string;
  answers: AnswerInput[];
}

export interface ActivityFormInput {
  title: string;
  description: string;
  type: string;
  deadline: string;
  questions: QuestionFormInput[];
}

export interface QuestionFormInput {
  type: QuestionType;
  prompt: string;
  points: number;
  correctAnswer: string;
  options: string[];
}

export interface LoginInput {
  name: string;
  role: Role;
}

export interface ApiErrorBody {
  message: string;
  details?: unknown;
}

export interface DashboardData {
  totalActivities: number;
  activeActivities: number;
  totalStudents: number;
  pendingSubmissions: number;
  students: User[];
  recentActivities: Activity[];
  recentSubmissions: Submission[];
}

export type ProgressStatus = 'not_started' | 'in_progress' | 'submitted';

export interface ProgressEntry {
  student: User;
  status: ProgressStatus;
  startedAt: string | null;
  submission: Submission | null;
}

export interface SyncQueueItem {
  id: string;
  clientSubmissionId: string;
  activityId: string;
  studentId: string;
  answers: AnswerInput[];
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSubmission {
  id: string;
  clientSubmissionId: string;
  activityId: string;
  studentId: string;
  answers: AnswerInput[];
  status: LocalSyncStatus;
  score?: number;
  maxScore?: number;
  serverSubmissionId?: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CachedActivity extends Activity {}

export interface DraftAnswer {
  id: string;
  activityId: string;
  questionId: string;
  answer: string;
  updatedAt: string;
}

export interface SyncMetadata {
  key: string;
  value: string;
  updatedAt: string;
}

export interface JoinActivityResponse {
  activity: Activity;
}

export interface SubmitRequest {
  clientSubmissionId: string;
  activityId: string;
  answers: AnswerInput[];
}

export interface SubmitResponse {
  submission: Submission;
}

export interface HealthResponse {
  status: 'ok';
  database: 'connected';
}
