import { Router } from 'express';
import { attachSession, requireAuth, requireRole } from '../middleware/auth.js';
import {
  listActivitiesController,
  createActivityController,
  getActivityController,
  updateActivityController,
  deleteActivityController,
  publishActivityController,
  joinActivityController,
  startActivityController,
  progressController,
} from '../controllers/activityController.js';
import {
  submitController,
  listSubmissionsController,
  getSubmissionController,
  syncController,
} from '../controllers/submissionController.js';
import { healthController, loginController, dashboardController } from '../controllers/appController.js';

export const apiRouter = Router();

apiRouter.use(attachSession);
apiRouter.post('/auth/login', loginController);
apiRouter.get('/health', healthController);

apiRouter.get('/dashboard', requireAuth, requireRole('teacher'), dashboardController);

apiRouter.get('/activities', requireAuth, listActivitiesController);
apiRouter.post('/activities', requireAuth, requireRole('teacher'), createActivityController);
apiRouter.get('/activities/:id', requireAuth, getActivityController);
apiRouter.put('/activities/:id', requireAuth, requireRole('teacher'), updateActivityController);
apiRouter.delete('/activities/:id', requireAuth, requireRole('teacher'), deleteActivityController);
apiRouter.post('/activities/:id/publish', requireAuth, requireRole('teacher'), publishActivityController);
apiRouter.get('/activities/:id/progress', requireAuth, requireRole('teacher'), progressController);
apiRouter.post('/activities/:id/start', requireAuth, requireRole('student'), startActivityController);
apiRouter.route('/join/:code').get(joinActivityController).post(joinActivityController);

apiRouter.post('/submissions', requireAuth, requireRole('student'), submitController);
apiRouter.get('/submissions', requireAuth, listSubmissionsController);
apiRouter.get('/submissions/:id', requireAuth, getSubmissionController);
apiRouter.post('/sync', requireAuth, requireRole('student'), syncController);
