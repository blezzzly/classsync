import { randomBytes, randomUUID } from 'node:crypto';
import type { Role } from '../../../shared/src/types';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateActivityCode(): string {
  const segment = Array.from(randomBytes(4), (value) => alphabet[value % alphabet.length] ?? 'A').join('');
  return `CS-${segment}`;
}

export function createToken(userId: string, role: Role): string {
  return `classsync-${userId}-${role}`;
}

export function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function calculateScore(questions: Array<{ id: string; type: string; points: number; correctAnswer: string | null }>, answers: Array<{ questionId: string; answer: string }>): number {
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.answer]));
  return questions.reduce((total, question) => {
    const answer = answerMap.get(question.id);
    if (answer === undefined || question.correctAnswer === null) return total;
    const matches = question.type === 'multiple_choice'
      ? normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer)
      : normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer);
    return total + (matches ? question.points : 0);
  }, 0);
}

export function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
