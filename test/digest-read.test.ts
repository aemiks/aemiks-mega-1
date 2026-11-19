import { describe, expect, it } from 'vitest';
import { digest, readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n).not.toBeNull();
    expect(n!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(n!.badLines).toBe(1);
  });

  it('counts runs and retries and keeps the last status and error', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const f = rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(f).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(f.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(rows.find((r) => r.job === 'notes/backup')!.lastStatus).toBe('fail');
  });

  it('keeps a row whose owner is null', () => {
    const r = readNight('runs', '2026-10-28')!.rows.find((x) => x.job === 'digest/render')!;
    expect(r.owner).toBeNull();
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
    expect(readNight('runs', '../etc')).toBeNull();
  });

  it('counts lines that do not parse and never throws', () => {
    const d = digest(['{"at":"x"', 'nope', '{"at":"2026-10-28T23:00:00+01:00","job":"a","status":"maybe","owner":"x"}']);
    expect(d).toEqual({ rows: [], badLines: 3 });
  });
});
