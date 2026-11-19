import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// Parse one line at the edge; anything off-shape is a bad line.
export function parseLine(line: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string') return null;
  if (typeof o.status !== 'string' || !STATUSES.includes(o.status as RunStatus)) return null;
  if (o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status as RunStatus,
    owner: o.owner,
    ...(o.error !== undefined ? { error: o.error } : {}),
  };
}

export function digest(lines: string[]): { rows: DigestRow[]; badLines: number } {
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of lines) {
    if (raw.trim() === '') continue;
    const l = parseLine(raw);
    if (!l) {
      badLines++;
      continue;
    }
    const r = byJob.get(l.job);
    if (!r) {
      byJob.set(l.job, {
        job: l.job,
        owner: l.owner,
        runs: 1,
        retries: l.status === 'retry' ? 1 : 0,
        lastStatus: l.status,
        lastError: l.error ?? null,
        firstAt: l.at,
        lastAt: l.at,
      });
      continue;
    }
    r.runs++;
    if (l.status === 'retry') r.retries++;
    if (Date.parse(l.at) >= Date.parse(r.lastAt)) {
      r.lastAt = l.at;
      r.lastStatus = l.status;
      if (l.owner !== null) r.owner = l.owner;
    }
    if (Date.parse(l.at) < Date.parse(r.firstAt)) r.firstAt = l.at;
    if (l.error) r.lastError = l.error;
  }
  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines };
}

export function readNight(runsDir: string, night: string): Night | null {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  return { night, ...digest(text.split('\n')) };
}
