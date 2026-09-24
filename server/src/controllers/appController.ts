import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import { login } from '../services/auth';
import { getDashboardData } from '../services/dashboard';
import { loginSchema } from '../services/validation';

export function loginController(req: AuthenticatedRequest, res: Response): void {
  const input = loginSchema.parse(req.body);
  const session = login(input);
  res.json({ session });
}

export function healthController(_req: AuthenticatedRequest, res: Response): void {
  res.json({ status: 'ok', database: 'connected' });
}

export function dashboardController(req: AuthenticatedRequest, res: Response): void {
  res.json({ dashboard: getDashboardData(req.session!.user.id) });
}
