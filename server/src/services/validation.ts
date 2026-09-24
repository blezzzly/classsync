import { z } from 'zod';

export const loginSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(['teacher', 'student']),
});

export const questionFormSchema = z.object({
  type: z.enum(['multiple_choice', 'short_answer']),
  prompt: z.string().trim().min(1, 'Question text is required').max(500),
  points: z.coerce.number().int().min(1).max(100),
  correctAnswer: z.string().trim().min(1, 'Correct answer is required').max(300),
  options: z.array(z.string().trim().min(1).max(200)).max(10),
}).superRefine((question, context) => {
  if (question.type === 'multiple_choice' && !question.options.includes(question.correctAnswer)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correctAnswer'],
      message: 'Choose one of the answer options as correct',
    });
  }
  if (question.type === 'multiple_choice' && question.options.length < 2) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Add at least two answer options',
    });
  }
});

export const activityFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().trim().max(2000),
  type: z.string().trim().min(1).max(80),
  deadline: z.string().trim().max(40).optional().default(''),
  questions: z.array(questionFormSchema).min(1, 'Add at least one question').max(50),
});

const idSchema = z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9_-]+$/);

export const submitSchema = z.object({
  clientSubmissionId: idSchema,
  activityId: idSchema,
  answers: z.array(z.object({
    questionId: idSchema,
    answer: z.string().max(2000),
  })).max(50),
});

export const syncSchema = z.object({
  submissions: z.array(submitSchema).min(1).max(20),
});
