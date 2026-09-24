import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { login } from '../services/auth.js';
import { getDashboardData } from '../services/dashboard.js';
import { loginSchema } from '../services/validation.js';

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
