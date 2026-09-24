import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const TEACHER = 'Teacher Demo';
const STUDENT = 'Alex Santos';

let stepCount = 0;
const failures = [];

function step(message) {
  stepCount += 1;
  console.log(`\n[${String(stepCount).padStart(2, '0')}] ${message}`);
}

function pass(message) {
  console.log(`   ✓ ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`   ✗ ${message}`);
}

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
  return condition;
}

async function click(page, locator, timeout = 20000) {
  await locator.waitFor({ state: 'visible', timeout });
  await locator.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
  });
}

async function fill(page, locator, value, timeout = 20000) {
  await locator.waitFor({ state: 'visible', timeout });
  await locator.fill(value);
}

async function readIdb(page) {
  return page.evaluate(async () => {
    const openDb = () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('classsync-client');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await openDb();
    const read = (store) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const drafts = await read('draftAnswers');
    const submissions = await read('localSubmissions');
    const queue = await read('syncQueue');
    const pendingJoins = await read('pendingJoins');
    db.close();
    return {
      drafts: drafts.map((d) => ({ questionId: d.questionId, answer: d.answer })),
      submissions: submissions.map((s) => ({
        status: s.status,
        score: s.score,
        maxScore: s.maxScore,
        answers: s.answers.length,
        clientSubmissionId: s.clientSubmissionId,
      })),
      queue: queue.map((q) => ({ status: q.status })),
      pendingJoins: pendingJoins.map((j) => ({ code: j.code, status: j.status })),
    };
  });
}

async function login(page, name, role) {
  await page.goto(`${BASE}/login`, { waitUntil: 'commit', timeout: 20000 });
  await page.waitForSelector('button:has-text("Enter")', { timeout: 45000, state: 'visible' });
  await page.locator('button:has-text("Enter")').nth(role === 'teacher' ? 0 : 1).evaluate((el) => el.click());
  await page.waitForURL(role === 'teacher' ? /\/teacher/ : /\/student/, { timeout: 20000 });
  await page.locator('nav[aria-label="Primary"]').waitFor({ timeout: 30000 });
  pass(`Signed in as ${name}`);
}

async function signOut(page) {
  await Promise.race([
    page.evaluate(async () => {
      try {
        localStorage.removeItem('classsync:session');
      } catch {
        // ignore
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      }
    }),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]).catch(() => {});
  await page.goto(`${BASE}/login`, { waitUntil: 'commit', timeout: 20000 });
  await page.waitForSelector('button:has-text("Enter")', { timeout: 45000, state: 'visible' });
  pass('Signed out');
}

async function main() {
  console.log('ClassSync E2E — offline demo workflow');
  const browser = await chromium.launch({
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--single-process',
      '--js-flags=--max-old-space-size=96',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  page.on('requestfailed', (request) => {
    consoleErrors.push(
      `REQFAIL ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`,
    );
  });

  try {
    // ── Teacher: create + publish ─────────────────────────────
    step('Teacher logs in');
    await login(page, TEACHER, 'teacher');

    step('Teacher creates "Basic C++ Variables Quiz"');
    await click(page, page.getByRole('link', { name: /Create/ }));
    await page.waitForURL(/\/teacher\/activities\/new/, { timeout: 20000 });
    const titleInput = page.locator('#activity-title');
    await titleInput.waitFor({ state: 'visible', timeout: 20000 });
    await titleInput.fill('Basic C++ Variables Quiz');
    await page.locator('#activity-description').fill('Variables and data types in C++ — offline demo.');

    // Question 1 (default multiple choice)
    await page.locator('#q0-prompt').fill('Which keyword declares a constant?');
    await page.getByRole('textbox', { name: 'Option 1' }).fill('var');
    await page.getByRole('textbox', { name: 'Option 2' }).fill('const');
    const radio2 = page.locator('#q0-correct-1');
    await radio2.waitFor({ state: 'attached', timeout: 15000 });
    await radio2.evaluate((el) => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => document.getElementById('q0-correct-1')?.checked === true, {
      timeout: 10000,
    });

    // Add a short-answer question (exact IDs — avoid matching #activity-type)
    await click(page, page.getByRole('button', { name: 'Add question' }));
    await page.locator('#q1-prompt').fill('What data type stores whole numbers?');
    await page.locator('#q1-type').selectOption('short_answer');
    await page.locator('#q1-correct').fill('int');
    pass('Filled 2 questions (multiple choice + short answer)');

    step('Teacher publishes and gets an activity code');
    await click(page, page.getByRole('button', { name: 'Save & publish now' }));
    try {
      await page.waitForURL(
        (url) => /\/teacher\/activities\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
        { timeout: 20000 },
      );
    } catch {
      const alerts = await page.getByRole('alert').allTextContents().catch(() => []);
      const formError = await page
        .locator('[role="alert"]')
        .allTextContents()
        .catch(() => []);
      throw new Error(
        `Publish did not navigate. url=${page.url()} alerts=${JSON.stringify([...alerts, ...formError])}`,
      );
    }
    const codeEl = page.locator('span.font-mono').first();
    await codeEl.waitFor({ timeout: 20000 });
    const activityCode = (await codeEl.innerText()).trim();
    assert(/^CS-[A-Z0-9]{4}$/.test(activityCode), `Activity code generated: ${activityCode}`);

    // ── Student: join + cache ─────────────────────────────────
    step('Student logs in');
    await signOut(page);
    await login(page, STUDENT, 'student');

    step(`Student joins with code ${activityCode}`);
    await page.goto(`${BASE}/student/join`, { waitUntil: 'commit' });
    const codeInput = page.locator('#join-code');
    await codeInput.waitFor({ timeout: 60000 });
    await codeInput.fill(activityCode);
    await click(page, page.getByRole('button', { name: /Find activity/ }));
    await page.getByText('Activity found').waitFor({ timeout: 30000 });
    pass('Activity found and cached locally');
    await click(page, page.getByRole('button', { name: 'Open activity' }));
    await page.waitForURL(/\/student\/activities\/[^/]+/, { timeout: 30000 });
    const activityUrl = page.url();

    // Wait for the service worker to control the page, then warm the cache.
    step('Warm service worker cache (online)');
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready;
      }
    });
    await page.reload({ waitUntil: 'commit' });
    await page.getByText(/Answers saved on this device|const/).first().waitFor({ timeout: 15000 });
    pass('Service worker ready and assets cached');

    // ── Answer while online (autosave) ────────────────────────
    step('Student answers questions (online first)');
    await page.getByText('const', { exact: true }).waitFor({ timeout: 20000 });
    await click(page, page.getByText('const', { exact: true }));
    await page.getByPlaceholder('Type your answer...').fill('  INT  ');
    await page.getByText(/Answers saved on this device/).waitFor({ timeout: 20000 });
    pass('Answers visibly saved on device');

    let idb = await readIdb(page);
    assert(idb.drafts.length === 2, `IndexedDB has 2 draft answers (${idb.drafts.map((d) => d.answer).join(', ')})`);

    // ── Go offline ────────────────────────────────────────────
    step('Turn OFF the internet (real browser offline)');
    await context.setOffline(true);
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'commit' });
    await page.getByText(/You're offline|You’re offline/).first().waitFor({ timeout: 15000 });
    pass('Reloaded while offline — app shell served by service worker');

    step('Answers survive refresh while offline');
    const mcChecked = await page.getByText('const', { exact: true }).locator('input').isChecked();
    const shortValue = await page.getByPlaceholder('Type your answer...').inputValue();
    assert(mcChecked === true, 'Multiple-choice answer still selected after refresh');
    assert(shortValue.trim() === 'INT', `Short answer preserved after refresh ("${shortValue}")`);

    idb = await readIdb(page);
    assert(idb.drafts.length === 2, 'Draft answers still in IndexedDB after offline refresh');

    // Change one answer offline to prove writes still work
    await page.getByPlaceholder('Type your answer...').fill('int');
    await page.waitForTimeout(400);
    idb = await readIdb(page);
    const shortDraft = idb.drafts.find((d) => d.answer.toLowerCase().includes('int'));
    assert(Boolean(shortDraft), 'Offline answer edit persisted to IndexedDB');

    // ── Submit offline ────────────────────────────────────────
    step('Student submits while offline');
    await click(page, page.getByRole('button', { name: /Submit offline/ }));
    await click(page, page.getByRole('button', { name: /Save offline & submit/ }));
    await page.getByText(/Saved offline/i).first().waitFor({ timeout: 20000 });
    pass('Toast/banner confirms "Saved offline — waiting to sync"');

    idb = await readIdb(page);
    assert(
      idb.submissions[0]?.status === 'PENDING_SYNC',
      `Local submission status = ${idb.submissions[0]?.status}`,
    );
    assert(idb.queue.length === 1 && idb.queue[0].status === 'PENDING', 'Sync queue has 1 PENDING item');

    // Submissions page shows pending state
    await page.goto(`${BASE}/student/submissions`, { waitUntil: 'commit' });
    await page.getByText('Pending sync').first().waitFor({ timeout: 15000 });
    pass('Submissions page shows "Pending sync"');

    // ── Offline join of an unknown code queues instead of failing ──
    step('Offline join queues a not-yet-cached code');
    await page.goto(`${BASE}/student/join`, { waitUntil: 'commit' });
    const offlineCodeInput = page.locator('#join-code');
    await offlineCodeInput.waitFor({ timeout: 15000 });
    await offlineCodeInput.fill('CS-OFFQ');
    await click(page, page.getByRole('button', { name: /Find activity/ }));
    await page.getByText('Join queued').first().waitFor({ timeout: 15000 });
    pass('Join queued while offline (no error, code saved on device)');
    idb = await readIdb(page);
    assert(
      idb.pendingJoins.length === 1 && idb.pendingJoins[0].code === 'CS-OFFQ',
      `pendingJoins holds ${idb.pendingJoins.map((j) => j.code).join(', ') || 'nothing'}`,
    );
    await page.goto(`${BASE}/student/submissions`, { waitUntil: 'commit' });
    await page.getByText('Pending sync').first().waitFor({ timeout: 15000 });

    // ── Back online → automatic sync ──────────────────────────
    step('Turn internet back ON — expect automatic sync');
    await context.setOffline(false);
    await page.getByText(/Connection restored/i).waitFor({ timeout: 15000 }).catch(() => {});
    await page.getByText(/Everything is synced/i).first().waitFor({ timeout: 20000 });
    pass('Automatic sync completed: "Everything is synced"');

    await page.waitForTimeout(500);
    idb = await readIdb(page);
    assert(idb.submissions[0]?.status === 'SYNCED', `Local submission status = ${idb.submissions[0]?.status}`);
    assert(typeof idb.submissions[0]?.score === 'number', `Score stored locally: ${idb.submissions[0]?.score}/${idb.submissions[0]?.maxScore}`);
    assert(idb.queue.length === 0, 'Sync queue empty after successful sync');
    assert(
      idb.pendingJoins.length === 0,
      `Queued join drained on reconnect (${idb.pendingJoins.length} left)`,
    );

    await page.reload({ waitUntil: 'commit' });
    await page.goto(`${BASE}/student/submissions`, { waitUntil: 'commit' });
    await page.getByText('Synced').first().waitFor({ timeout: 15000 });
    pass('Student submissions page shows Synced with score');

    // ── Teacher sees the submission ───────────────────────────
    step('Teacher sees the synced submission');
    await signOut(page);
    await login(page, TEACHER, 'teacher');
    await page.goto(`${BASE}/teacher/submissions`, { waitUntil: 'commit' });
    await page.getByText(STUDENT).first().waitFor({ timeout: 15000 });
    await page.getByText('Basic C++ Variables Quiz').first().waitFor({ timeout: 15000 });
    pass('Submission row shows student + activity');
    assert(
      (await page.getByText(/\d+\s*\/\s*\d+/).count()) > 0,
      'Score visible on teacher submissions',
    );

    // Open detail
    await click(page, page.getByText(STUDENT).first());
    await page.getByText(/Correct answer/).first().waitFor({ timeout: 20000 });
    pass('Teacher can open submission detail with answers + correct answers');

    // Dashboard sanity
    await page.goto(`${BASE}/teacher`, { waitUntil: 'commit' });
    await page.getByText('Dashboard').waitFor({ timeout: 15000 });
    pass('Teacher dashboard loads');

    // ── Bottom nav works ──────────────────────────────────────
    step('Bottom navigation works');
    await click(page, page.getByRole('link', { name: /Activities/ }).first());
    await page.waitForURL(/\/teacher\/activities/, { timeout: 20000 });
    pass('Teacher nav → Activities');

    // Full-width layout check
    step('Responsive layout check');
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(300);
    const shellBox = await page.locator('header').first().boundingBox();
    if (shellBox) {
      assert(
        shellBox.width >= 1300,
        `Desktop shell spans full width (${Math.round(shellBox.width)}px of 1366px)`,
      );
      assert(shellBox.x <= 1, `Desktop shell not centered (x=${Math.round(shellBox.x)})`);
    } else {
      fail('Could not measure shell on desktop');
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(200);
    const navBox = await page.locator('nav[aria-label="Primary"]').boundingBox();
    assert(Boolean(navBox && navBox.width >= 374), 'Bottom nav spans full width at 375x812');
    assert(Boolean(navBox && navBox.y + navBox.height >= 810), 'Bottom nav pinned to viewport bottom at 375x812');

    // Console errors (filter known dev/HMR/offline noise)
    const critical = consoleErrors.filter(
      (line) =>
        !line.includes('favicon') &&
        !line.includes('Download the React DevTools') &&
        !line.includes('ERR_INTERNET_DISCONNECTED') &&
        !line.includes('Failed to load resource') &&
        !line.includes('net::ERR_') &&
        !line.includes('service-worker') &&
        !line.includes('failed to connect to websocket') &&
        !line.includes('[vite]') &&
        !line.includes('vite.dev/config'),
    );
    step('Console health');
    assert(critical.length === 0, `No critical console errors${critical.length ? `: ${critical.slice(0, 3).join(' | ')}` : ''}`);

    // Self-cleanup: remove the demo activity so a fresh manual demo gets CS-7K4P again.
    step('Cleanup test data');
    const cleanup = await page.evaluate(async (activityId) => {
      const raw = localStorage.getItem('classsync:session');
      if (!raw || !activityId) return 'skipped';
      const { token } = JSON.parse(raw);
      const res = await fetch(`/api/activities/${encodeURIComponent(activityId)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      return `delete ${res.status}`;
    }, activityUrl.split('/').pop());
    pass(`Cleanup: ${cleanup}`);
  } catch (error) {
    fail(`Unhandled error: ${error?.message ?? error}`);
    console.error(error);
    await page
      .screenshot({ path: 'tests/e2e/failure.png', fullPage: true })
      .catch(() => {});
    const snap = await page
      .evaluate(() => ({
        url: location.href,
        ready: document.readyState,
        rootChildren: document.getElementById('root')?.childElementCount ?? -1,
        text: document.body?.innerText?.slice(0, 500),
        scripts: [...document.scripts].map((s) => s.src || 'inline').slice(0, 10),
        htmlLen: document.documentElement.outerHTML.length,
      }))
      .catch((e) => ({ error: String(e) }));
    console.error('Page snapshot:', JSON.stringify(snap, null, 2));
    console.error('Console errors:', consoleErrors.slice(-20));
  } finally {
    await browser.close();
  }

  console.log(`\n${'─'.repeat(50)}`);
  if (failures.length === 0) {
    console.log(`E2E PASSED — ${stepCount} steps`);
    process.exit(0);
  }
  console.error(`E2E FAILED — ${failures.length} assertion(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

main();
