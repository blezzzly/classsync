import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const defaultDatabasePath = path.join(process.cwd(), 'data', 'classsync.db');

let database: Database.Database | undefined;
let databasePath: string | undefined;

function resolveDatabasePath(): string {
  return process.env.DATABASE_PATH ?? defaultDatabasePath;
}

export function getDb(): Database.Database {
  const nextPath = resolveDatabasePath();
  if (database && databasePath !== nextPath) {
    closeDb();
  }

  if (!database) {
    fs.mkdirSync(path.dirname(nextPath), { recursive: true });
    database = new Database(nextPath, { timeout: 5000 });
    databasePath = nextPath;
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = NORMAL');
    initializeSchema(database);
    seedDatabase(database);
  }

  return database;
}

export function closeDb(): void {
  if (database?.open) {
    database.close();
  }
  database = undefined;
  databasePath = undefined;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('teacher', 'student'))
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
      code TEXT UNIQUE,
      deadline TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('multiple_choice', 'short_answer')),
      prompt TEXT NOT NULL,
      points INTEGER NOT NULL CHECK (points >= 0),
      correct_answer TEXT,
      position INTEGER NOT NULL,
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS question_options (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      label TEXT NOT NULL,
      is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
      position INTEGER NOT NULL,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      client_submission_id TEXT NOT NULL UNIQUE,
      activity_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      score INTEGER NOT NULL CHECK (score >= 0),
      max_score INTEGER NOT NULL CHECK (max_score >= 0),
      status TEXT NOT NULL CHECK (status IN ('received', 'synced')),
      submitted_at TEXT NOT NULL,
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS submission_answers (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer TEXT NOT NULL,
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_progress (
      activity_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (activity_id, student_id),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
    CREATE INDEX IF NOT EXISTS idx_activities_code ON activities(code);
    CREATE INDEX IF NOT EXISTS idx_submissions_activity ON submissions(activity_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_questions_activity_position ON questions(activity_id, position);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_question_options_question_position ON question_options(question_id, position);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_submission_answers_submission_question ON submission_answers(submission_id, question_id);
  `);
}

function seedDatabase(db: Database.Database): void {
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, name, role) VALUES (@id, @name, @role)');
  const insertActivity = db.prepare(`
    INSERT OR IGNORE INTO activities (id, title, description, type, teacher_id, status, code, deadline, created_at, updated_at)
    VALUES (@id, @title, @description, @type, @teacher_id, @status, @code, @deadline, @created_at, @updated_at)
  `);
  const insertQuestion = db.prepare(`
    INSERT OR IGNORE INTO questions (id, activity_id, type, prompt, points, correct_answer, position)
    VALUES (@id, @activity_id, @type, @prompt, @points, @correct_answer, @position)
  `);
  const insertOption = db.prepare(`
    INSERT OR IGNORE INTO question_options (id, question_id, label, is_correct, position)
    VALUES (@id, @question_id, @label, @is_correct, @position)
  `);

  const seed = db.transaction(() => {
    [
      { id: 'user-teacher-demo', name: 'Teacher Demo', role: 'teacher' },
      { id: 'user-alex-santos', name: 'Alex Santos', role: 'student' },
      { id: 'user-jamie-cruz', name: 'Jamie Cruz', role: 'student' },
      { id: 'user-sam-reyes', name: 'Sam Reyes', role: 'student' },
    ].forEach((user) => insertUser.run(user));

    const teacher = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get('user-teacher-demo', 'teacher') as { id: string } | undefined;
    if (!teacher) return;

    const now = new Date().toISOString();
    const activities = [
      {
        id: 'activity-intro-programming',
        title: 'Introduction to Programming',
        description: 'Check your understanding of programs, algorithms, and basic coding concepts.',
        type: 'Quiz',
        code: 'CS-INTRO',
        questions: [
          {
            id: 'question-intro-1',
            type: 'multiple_choice',
            prompt: 'What is an algorithm?',
            points: 1,
            correctAnswer: 'A step-by-step set of instructions',
            options: ['A step-by-step set of instructions', 'A computer screen', 'A type of cable', 'A file format'],
          },
          {
            id: 'question-intro-2',
            type: 'short_answer',
            prompt: 'Name one programming language.',
            points: 1,
            correctAnswer: 'python',
            options: [],
          },
        ],
      },
      {
        id: 'activity-basic-cs',
        title: 'Basic Computer Science',
        description: 'A short review of hardware, software, and how computers process information.',
        type: 'Quiz',
        code: 'CS-BASICS',
        questions: [
          {
            id: 'question-cs-1',
            type: 'multiple_choice',
            prompt: 'Which component is considered the brain of a computer?',
            points: 1,
            correctAnswer: 'CPU',
            options: ['CPU', 'Monitor', 'Keyboard', 'Speaker'],
          },
          {
            id: 'question-cs-2',
            type: 'multiple_choice',
            prompt: 'What does software refer to?',
            points: 1,
            correctAnswer: 'Programs and applications',
            options: ['Programs and applications', 'Physical parts', 'Network cables', 'Power supply'],
          },
        ],
      },
      {
        id: 'activity-digital-literacy',
        title: 'Digital Literacy',
        description: 'Practice safe, responsible, and effective use of digital tools.',
        type: 'Reflection',
        code: 'CS-DIGITAL',
        questions: [
          {
            id: 'question-digital-1',
            type: 'multiple_choice',
            prompt: 'Which password is strongest?',
            points: 1,
            correctAnswer: 'A long mix of words, numbers, and symbols',
            options: ['password123', 'A long mix of words, numbers, and symbols', 'Your name', '12345678'],
          },
          {
            id: 'question-digital-2',
            type: 'short_answer',
            prompt: 'Write one way to protect your privacy online.',
            points: 1,
            correctAnswer: 'use strong passwords',
            options: [],
          },
        ],
      },
    ];

    activities.forEach((activity) => {
      insertActivity.run({
        id: activity.id,
        title: activity.title,
        description: activity.description,
        type: activity.type,
        teacher_id: teacher.id,
        status: 'published',
        code: activity.code,
        deadline: null,
        created_at: now,
        updated_at: now,
      });
      activity.questions.forEach((question, questionIndex) => {
        insertQuestion.run({
          id: question.id,
          activity_id: activity.id,
          type: question.type,
          prompt: question.prompt,
          points: question.points,
          correct_answer: question.correctAnswer,
          position: questionIndex + 1,
        });
        question.options.forEach((option, optionIndex) => {
          insertOption.run({
            id: `${question.id}-option-${optionIndex + 1}`,
            question_id: question.id,
            label: option,
            is_correct: option === question.correctAnswer ? 1 : 0,
            position: optionIndex + 1,
          });
        });
      });
    });
  });

  seed();
}
