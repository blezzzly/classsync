import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { apiRouter } from './routes/api';
import { getDb } from './db/database';
import type { ErrorRequestHandler } from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', apiRouter);

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? 'Please check the form and try again';
      res.status(400).json({ message, details: error.flatten() });
      return;
    }
    const errorName = error?.name;
    const status =
      errorName === 'NotFoundError' ? 404
      : errorName === 'ForbiddenError' ? 403
      : errorName === 'ConflictError' ? 409
      : 400;
    res.status(status).json({ message: error?.message ?? 'Something went wrong. Please try again.' });
  };

  app.use(errorHandler);
  return app;
}

export function startServer() {
  const port = Number(process.env.PORT ?? 4000);
  const app = createApp();
  getDb();
  return app.listen(port, () => {
    process.stdout.write(`ClassSync server listening on http://localhost:${port}\n`);
  });
}
