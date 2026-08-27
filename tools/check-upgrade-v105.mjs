import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../js/khsx-data-core.js',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../supabase/schema/miniapp_upgrade_v1.sql',import.meta.url),'utf8');
const clone=fs.readFileSync(new URL('./build-live-clone.mjs',import.meta.url),'utf8');

const checks=[
  ['version 105 + cache-busted core',/const APP_VERSION = 105;/.test(html)&&/khsx-data-core\.js\?v=105/.test(html)],
  ['employee stage workspace',/id="employeeStageWorkspace"/.test(html)&&/function renderEmployeeStageWorkspace\(/.test(html)],
  ['differential progress realtime',/khsx_stage_progress'\},applySupabaseProgressEvent/.test(html)],
  ['credits realtime refresh',/khsx_stage_credits/.test(html)&&/scheduleSupabaseReload/.test(html)],
  ['server ACK required before queue delete',/String\(ack\.operation_id\)!==String\(item\.operation_id\)/.test(html)],
  ['retry backoff and normalized store',/retryDelay/.test(core)&&/createEntityStore/.test(core)&&/debounce/.test(core)],
  ['RPC operation id is unambiguous',/where op\.operation_id=p_operation_id/.test(schema)],
  ['RPC rejects invalid chain',/CHAIN_LIMIT_EXCEEDED/.test(schema)&&/Không tự tạo sản lượng công đoạn trước/.test(schema)],
  ['clone parses legacy dimensions',/function dimensions\(/.test(clone)&&/parts\.length===2/.test(clone)],
  ['clone only imports evidenced manual completion',/o\.is_manual&&!hasStage&&doneDate&&qty>0&&legacyDone>=qty/.test(clone)],
  ['historical completion survives missing team',/alter column kpi_team drop not null/.test(schema)&&/kpi_team:kpi/.test(clone)],
  ['clone reports chain issues without auto-fix',/const chainIssues=\[\]/.test(clone)&&!/function raiseStage\(/.test(clone)]
  ,['manager gets explicit chain review list',/id="dataIntegrityAlert"/.test(html)&&/function saiChuoiCongDoan\(/.test(html)]
];

let failed=0;
for(const [name,ok] of checks){
  console.log(`${ok?'PASS':'FAIL'}  ${name}`);
  if(!ok) failed++;
}
if(failed) process.exit(1);
console.log(`\nUpgrade v105 checks passed (${checks.length}/${checks.length}).`);
