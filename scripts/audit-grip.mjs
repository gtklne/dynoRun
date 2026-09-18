/** Current executable regression checks. Historical experiments and their
 * immutable evidence are in audit-grip-baseline.mjs and docs/audits/. */
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
  'tests/analysis/grip', 'tests/ui/grip-playback.test.tsx',
  'tests/ui/session-canvas.test.tsx', 'tests/ui/compare-canvas.test.tsx',
  'tests/ui/grip-home.test.tsx', 'tests/ui/grip-session-screen.test.tsx',
  'tests/ui/grip-compare-screen.test.tsx',
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
