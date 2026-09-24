import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { Response } from 'express';
import { createSubmission, listSubmissions, findSubmission } from '../services/submissions.js';
import { submitSchema, syncSchema } from '../services/validation.js';

export function submitController(req: AuthenticatedRequest, res: Response): void {
  const input = submitSchema.parse(req.body);
  const result = createSubmission(req.session!.user.id, input);
  res.status(result.duplicate ? 200 : 201).json({ submission: result.submission, duplicate: result.duplicate });
}

export function listSubmissionsController(req: AuthenticatedRequest, res: Response): void {
  const submissions = listSubmissions(req.session!.user.role === 'student' ? req.session!.user.id : undefined);
  res.json({ submissions });
}

export function getSubmissionController(req: AuthenticatedRequest, res: Response): void {
  if (typeof req.params.id !== 'string') {
    res.status(400).json({ message: 'Invalid submission id' });
    return;
  }
  const submission = findSubmission(req.params.id);
  if (req.session!.user.role === 'student' && submission.studentId !== req.session!.user.id) {
    res.status(403).json({ message: 'You cannot view this submission' });
    return;
  }
  res.json({ submission });
}

export function syncController(req: AuthenticatedRequest, res: Response): void {
  const input = syncSchema.parse(req.body);
  const results = input.submissions.map((submission) =>
    createSubmission(req.session!.user.id, submission, { viaSync: true }),
  );
  res.json({
    results: results.map((result) => ({
      clientSubmissionId: result.submission.clientSubmissionId,
      submission: result.submission,
      duplicate: result.duplicate,
    })),
  });
}
