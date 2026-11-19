// Plan morning-digest § 3/§ 4. Saves one rig page as one self-contained HTML file (ADR 0001, 0003).
// Usage: tsx --env-file-if-exists=.env scripts/save-page.ts /digest/2026-10-28 var/preview/index.html
// The banner shows LANE_MARKER from the environment; unset it to save the clean copy.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const [path = '/digest/2026-10-28', out = 'var/preview/index.html'] = process.argv.slice(2);
const res = await createApp(loadConfig()).request(path);
if (res.status !== 200) {
  console.error(`${path} answered ${res.status}`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await res.text());
console.log(`saved ${path} → ${out} (marker: ${process.env.LANE_MARKER?.trim() || 'no marker set'})`);
