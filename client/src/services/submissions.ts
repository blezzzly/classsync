import type { AnswerInput, LocalSubmission } from '@shared/types';
import {
  enqueueSubmission,
  getLocalSubmissionByClientSubmissionId,
  listLocalSubmissions,
} from '../db/repositories';
import { createClientSubmissionId } from '../db/schema';

export interface SubmitLocallyInput {
  activityId: string;
  studentId: string;
  answers: AnswerInput[];
}

export interface SubmitLocallyResult {
  submission: LocalSubmission;
  created: boolean;
  clientSubmissionId: string;
}

/**
 * Persist a student's submission locally and enqueue it for sync.
 * Reuses an existing clientSubmissionId for the same activity + student so
 * double taps or retries can never create duplicate server records.
 */
export async function submitActivityLocally(
  input: SubmitLocallyInput,
): Promise<SubmitLocallyResult> {
  const existing = (await listLocalSubmissions({
    activityId: input.activityId,
    studentId: input.studentId,
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const clientSubmissionId = existing?.clientSubmissionId ?? createClientSubmissionId();

  const { localSubmission, created } = await enqueueSubmission({
    clientSubmissionId,
    activityId: input.activityId,
    studentId: input.studentId,
    answers: input.answers,
    status: 'PENDING_SYNC',
    ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}),
  }, { force: true });

  return {
    submission: localSubmission,
    created,
    clientSubmissionId: localSubmission.clientSubmissionId,
  };
}

export async function getSubmissionState(
  activityId: string,
  studentId: string,
): Promise<LocalSubmission | undefined> {
  const matches = await listLocalSubmissions({ activityId, studentId });
  return matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export { getLocalSubmissionByClientSubmissionId };
