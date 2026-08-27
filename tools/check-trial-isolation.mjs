import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const checks = [
  {
    name: 'Supabase variant is enabled',
    ok: /const\s+SUPABASE_VARIANT\s*=\s*true\s*;/.test(html),
  },
  {
    name: 'Supabase uses its own login key',
    ok: /SUPABASE_VARIANT\s*\?\s*'khsx_supabase_login_session_v1'/.test(html),
  },
  {
    name: 'Supabase uses its own cache key',
    ok: /SUPABASE_VARIANT\s*\?\s*'khsx_supabase_local_cache_v1'/.test(html),
  },
  {
    name: 'Supabase uses its own stage outbox',
    ok: /const\s+SUPABASE_STAGE_OUTBOX_KEY\s*=\s*'khsx_supabase_stage_outbox_v1'/.test(html),
  },
  {
    name: 'Apps Script storage reads are disabled in trial',
    ok: /async\s+function\s+storageGet\s*\([^)]*\)\s*{\s*if\s*\(SUPABASE_VARIANT\)\s*return\s+null\s*;/.test(html),
  },
  {
    name: 'Apps Script storage batch reads are disabled in trial',
    ok: /async\s+function\s+storageGetAll\s*\([^)]*\)\s*{\s*if\s*\(SUPABASE_VARIANT\)\s*return\s+{}\s*;/.test(html),
  },
  {
    name: 'Apps Script storage writes are disabled in trial',
    ok: /async\s+function\s+storageSet\s*\([^)]*\)\s*{\s*if\s*\(SUPABASE_VARIANT\)\s*return\s+false\s*;/.test(html),
  },
  {
    name: 'Stage writes use idempotent Supabase RPC',
    ok: /\.rpc\(\s*'khsx_apply_stage_progress_v2'/.test(html) && /p_operation_id\s*:/.test(html),
  },
  {
    name: 'Stage writes carry the credited worker separately',
    ok: /p_worker_id\s*:/.test(html) && /completed_by_worker_id/.test(html),
  },
];

let failed = 0;
for (const check of checks) {
  if (!check.ok) failed += 1;
  process.stdout.write(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}\n`);
}

if (failed) {
  process.stderr.write(`\n${failed} isolation check(s) failed.\n`);
  process.exit(1);
}

process.stdout.write('\nTrial data isolation checks passed.\n');
