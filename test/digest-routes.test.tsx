import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };
const jobs = ['backup', 'report', 'sync-cache'];

const goodNight = [
  '{"at":"2026-10-28T02:00:00+01:00","job":"backup","status":"ok","owner":"ana"}',
  '{"at":"2026-10-28T02:10:00+01:00","job":"sync-cache","status":"retry","owner":null,"error":"timeout"}',
  '{"at":"2026-10-28T02:20:00+01:00","job":"sync-cache","status":"retry","owner":null,"error":"timeout"}',
  '{"at":"2026-10-28T02:30:00+01:00","job":"sync-cache","status":"retry","owner":null,"error":"timeout"}',
  '{"at":"2026-10-28T02:40:00+01:00","job":"sync-cache","status":"ok","owner":null}',
  '{"at":"2026-10-28T03:00:00+01:00","job":"report","status":"fail","owner":"bo","error":"disk full"}',
  'this line does not parse {',
].join('\n');

let tmp: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(tmp, '2026-10-28.jsonl'), goodNight + '\n');
  writeFileSync(join(tmp, '2026-10-30.jsonl'), '');
  app = createApp({ ...base, runsDir: tmp });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders the night: each job, in job order, and the bad-line count', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of jobs) expect(html).toContain(`<td>${job}</td>`);
    const positions = jobs.map((job) => html.indexOf(`<td>${job}</td>`));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain('bad lines: 1');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/1999-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for this night');
  });

  it('answers 200 with "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the rows in the same job order as the page, and badLines 1', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      night: string;
      rows: { job: string; owner: string | null; retries: number; lastStatus: string }[];
      badLines: number;
    };
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(jobs);

    const page = await (await app.request('/digest/2026-10-28')).text();
    const pageOrder = jobs
      .map((job) => ({ job, at: page.indexOf(`<td>${job}</td>`) }))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.job);
    expect(body.rows.map((r) => r.job)).toEqual(pageOrder);

    const sync = body.rows.find((r) => r.job === 'sync-cache');
    expect(sync).toMatchObject({ owner: null, retries: 3, lastStatus: 'ok' });
    const report = body.rows.find((r) => r.job === 'report');
    expect(report).toMatchObject({ lastStatus: 'fail' });
  });

  it('answers 404 with an error body for a night with no file', async () => {
    const res = await app.request('/api/digest/1999-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: '1999-01-01' });
  });

  it('answers 200 with no rows for an empty night', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ night: '2026-10-30', rows: [], badLines: 0 });
  });
});
