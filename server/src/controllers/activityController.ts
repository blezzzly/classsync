import type { AuthenticatedRequest } from '../middleware/auth';
import type { Response } from 'express';
import { listActivities, createActivity, updateActivity, deleteActivity, publishActivity, findActivityByCode, findActivity } from '../services/activities';
import { getProgressRoster, markActivityStarted } from '../services/progress';
import { activityFormSchema } from '../services/validation';

export function listActivitiesController(req: AuthenticatedRequest, res: Response): void {
  const user = req.session?.user;
  const activities = user?.role === 'teacher' ? listActivities(user.id) : [];
  res.json({ activities });
}

export function getActivityController(req: AuthenticatedRequest, res: Response): void {
  if (typeof req.params.id !== 'string') {
    res.status(400).json({ message: 'Invalid activity id' });
    return;
  }
  res.json({ activity: findActivity(req.params.id) });
}

export function createActivityController(req: AuthenticatedRequest, res: Response): void {
  const input = activityFormSchema.parse(req.body);
  const activity = createActivity(req.session!.user.id, input);
  res.status(201).json({ activity });
}

export function updateActivityController(req: AuthenticatedRequest, res: Response): void {
  const input = activityFormSchema.parse(req.body);
  if (typeof req.params.id !== 'string') {
    res.status(400).json({ message: 'Invalid activity id' });
    return;
  }
  const activity = updateActivity(req.params.id, req.session!.user.id, input);
  res.json({ activity });
}

export function deleteActivityController(req: AuthenticatedRequest, res: Response): void {
  if (typeof req.params.id !== 'string') {
    res.status(400).json({ message: 'Invalid activity id' });
    return;
  }
  deleteActivity(req.params.id, req.session!.user.id);
  res.status(204).send();
}

export function publishActivityController(req: AuthenticatedRequest, res: Response): void {
  if (typeof req.params.id !== 'string') {
    res.status(400).json({ message: 'Invalid activity id' });
    return;
  }
  const activity = publishActivity(req.params.id, req.session!.user.id);
  res.json({ activity });
}

export function joinActivityController(req: AuthenticatedRequest, res: Response): void {
  if (typeof req.params.code !== 'string') {
    res.status(400).json({ message: 'Invalid activity code' });
    return;
  }
  const activity = findActivityByCode(req.params.code);
  res.json({ activity });
}

export function startActivityController(req: AuthenticatedRequest, res: Response): void {
  if (typeof req.params.id !== 'string') {
    res.status(400).json({ message: 'Invalid activity id' });
    return;
  }
  markActivityStarted(req.params.id, req.session!.user.id);
  res.status(204).send();
}

export function progressController(req: AuthenticatedRequest, res: Response): void {
  if (typeof req.params.id !== 'string') {
    res.status(400).json({ message: 'Invalid activity id' });
    return;
  }
  const roster = getProgressRoster(req.params.id, req.session!.user.id);
  res.json({ roster });
}
