import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db/database.js';
import { getUserById, getUserByName } from '../db/queries.js';
import type { AuthSession, LoginInput, Role, User } from '../../../shared/src/types/index.js';

const tokenPrefix = 'classsync.';
const defaultSessionSecret = 'classsync-local-development-secret';
const parsedMaxAge = Number(process.env.AUTH_SESSION_MAX_AGE_MS);
const sessionMaxAgeMs = Number.isFinite(parsedMaxAge) && parsedMaxAge > 0 ? parsedMaxAge : 7 * 24 * 60 * 60 * 1000;

function getTokenSecret(): string {
  return process.env.AUTH_SECRET ?? defaultSessionSecret;
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload: string): string {
  return createHmac('sha256', getTokenSecret()).update(Buffer.from(payload)).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, Buffer.from(right));
}

function parseToken(token: string): { userId: string; role: Role; issuedAt: number } | undefined {
  if (!token.startsWith(tokenPrefix)) return undefined;
  const parts = token.slice(tokenPrefix.length).split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;

  let payload: { userId?: unknown; role?: unknown; issuedAt?: unknown } | undefined;
  try {
    payload = JSON.parse(decode(parts[0] as string)) as { userId?: unknown; role?: unknown; issuedAt?: unknown };
  } catch {
    return undefined;
  }

  if (!safeEqual(parts[1] as string, sign(parts[0] as string))) return undefined;
  if (typeof payload.userId !== 'string' || (payload.role !== 'teacher' && payload.role !== 'student')) return undefined;
  if (typeof payload.issuedAt !== 'number' || !Number.isFinite(payload.issuedAt)) return undefined;
  if (payload.issuedAt > Date.now() + 60_000 || payload.issuedAt < Date.now() - sessionMaxAgeMs) return undefined;
  return { userId: payload.userId, role: payload.role, issuedAt: payload.issuedAt };
}

export function login(input: LoginInput): AuthSession {
  const user = getUserByName(getDb(), input.name.trim(), input.role);
  if (!user) {
    throw new Error(`No ${input.role === 'teacher' ? 'teacher' : 'student'} account exists with that name`);
  }
  return { token: createToken(user), user };
}

export function createToken(user: User): string {
  const issuedAt = Date.now();
  const payload = encode(JSON.stringify({ userId: user.id, role: user.role, issuedAt }));
  return `${tokenPrefix}${payload}.${sign(payload)}`;
}

export function sessionFromToken(token?: string): AuthSession | undefined {
  if (!token) return undefined;
  const parsed = parseToken(token);
  if (!parsed) return undefined;
  const user = getUserById(getDb(), parsed.userId);
  if (!user || user.role !== parsed.role) return undefined;
  return { token, user };
}

export function assertSessionSecret(): void {
  if (!process.env.AUTH_SECRET) {
    process.stderr.write('Warning: AUTH_SECRET is not set; using the local development session secret.\n');
  }
}
