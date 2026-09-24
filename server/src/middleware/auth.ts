import type { NextFunction, Request, Response } from 'express';
import { sessionFromToken } from '../services/auth.js';
import type { Role } from '../../../shared/src/types/index.js';

export interface AuthenticatedRequest extends Request {
  session?: { token: string; user: { id: string; name: string; role: Role } };
}

export function attachSession(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const request = req as AuthenticatedRequest;
  request.session = sessionFromToken(token);
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.session?.user) {
    res.status(401).json({ message: 'Please sign in to continue' });
    return;
  }
  next();
}

export function requireRole(role: Role) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session?.user) {
      res.status(401).json({ message: 'Please sign in to continue' });
      return;
    }
    if (req.session.user.role !== role) {
      res.status(403).json({ message: 'This page is only available to teachers' });
      return;
    }
    next();
  };
}
