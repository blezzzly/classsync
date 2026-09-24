import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { login, createToken, sessionFromToken } from '../services/auth.js';
import { getDb } from '../db/database.js';
import { getUserById, getUserByName } from '../db/queries.js';
import { getDashboardData } from '../services/dashboard.js';
import { loginSchema } from '../services/validation.js';

export function loginController(req: AuthenticatedRequest, res: Response): void {
  const input = loginSchema.parse(req.body);
  const session = login(input);
  res.json({ session });
}

export function healthController(req: AuthenticatedRequest, res: Response): void {
  if (req.headers['x-debug-auth'] === '1') {
    let selfTest = 'skip';
    let userRow: unknown = null;
    try {
      const db = getDb();
      userRow = getUserById(db, 'user-teacher-demo') ?? null;
      const byName = getUserByName(db, 'Teacher Demo', 'teacher');
      if (byName) {
        const tok = createToken(byName);
        const back = sessionFromToken(tok);
        selfTest = back?.user?.id ?? 'roundtrip-failed';
      } else {
        selfTest = 'no-user-by-name';
      }
    } catch (e) {
      selfTest = `err:${(e as Error).message}`;
    }
    res.json({
      status: 'ok',
      database: 'connected',
      debug: {
        authHeaderLen: req.headers.authorization?.length ?? 0,
        sessionUserId: req.session?.user?.id ?? null,
        secretSet: Boolean(process.env.AUTH_SECRET),
        secretLen: (process.env.AUTH_SECRET ?? '').length,
        maxAgeMs: Number(process.env.AUTH_SESSION_MAX_AGE_MS ?? -1),
        userRow,
        selfTest,
        databasePath: process.env.DATABASE_PATH ?? null,
      },
    });
    return;
  }
  res.json({ status: 'ok', database: 'connected' });
}

export function dashboardController(req: AuthenticatedRequest, res: Response): void {
  res.json({ dashboard: getDashboardData(req.session!.user.id) });
}
