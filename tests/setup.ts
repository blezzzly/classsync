import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach } from 'vitest';
import { closeDb } from '../server/src/db/database';

const databaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'classsync-tests-'));
const databasePaths: string[] = [];
let databaseCounter = 0;

function removeDatabase(databasePath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

beforeEach(() => {
  closeDb();
  databaseCounter += 1;
  const databasePath = path.join(databaseRoot, `database-${databaseCounter}.sqlite`);
  databasePaths.push(databasePath);
  process.env.DATABASE_PATH = databasePath;
});

afterEach(() => {
  closeDb();
  const databasePath = databasePaths.at(-1);
  if (databasePath) removeDatabase(databasePath);
});

afterAll(() => {
  closeDb();
  for (const databasePath of databasePaths) removeDatabase(databasePath);
  fs.rmSync(databaseRoot, { recursive: true, force: true });
  delete process.env.DATABASE_PATH;
});
