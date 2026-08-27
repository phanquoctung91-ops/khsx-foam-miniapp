import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../js/khsx-data-core.js',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../supabase/schema/miniapp_upgrade_v1.sql',import.meta.url),'utf8');
const clone=fs.readFileSync(new URL('./build-live-clone.mjs',import.meta.url),'utf8');
const edgeAdmin=fs.readFileSync(new URL('../supabase/functions/khsx-admin-link-telegram/index.ts',import.meta.url),'utf8');

const checks=[
  ['version 114 + cache-busted core',/const APP_VERSION = 114;/.test(html)&&/khsx-data-core\.js\?v=114/.test(html)],
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
  ,['Supabase day-lock save path',/saveSupabaseDayLocks/.test(html)&&/khsx_set_day_locks/.test(html)&&/p_lock_changes/.test(schema)]
  ,['Realtime reconnect fallback',/scheduleSupabaseRealtimeReconnect/.test(html)&&/CHANNEL_ERROR/.test(html)&&/TIMED_OUT/.test(html)&&/supabaseRealtimeHealthy/.test(html)]
  ,['Telegram ID registration',/id="telegramRegisterBtn"/.test(html)&&/async function registerTelegramId\(\)/.test(html)&&/ACCESS_NOT_PROVISIONED/.test(html)]
  ,['Telegram admin linking',/id="supabaseTelegramAdmin"/.test(html)&&/khsx_telegram_links/.test(html)&&/linkTelegramToProfile/.test(html)]
  ,['Supabase worker team persistence',/khsx_worker_team_assignments/.test(html)&&/khsx_worker_team_assignments/.test(schema)&&/luuGanToCoXacNhan/.test(html)]
  ,['Telegram worker provisioning',/khsx-admin-link-telegram/.test(html)&&/worker:/.test(html)&&/provisionTelegramForWorker/.test(html)&&/Deno\.serve/.test(edgeAdmin)&&/khsx_profiles/.test(edgeAdmin)&&/createUser/.test(edgeAdmin)]
  ,['Team assignment read-after-write guard',/supabaseOperationalLoadSeq/.test(html)&&/maybeSingle\(\)/.test(html)&&/response cũ/.test(html)]
  ,['Management poison item cannot block later writes',/code==='23503'\|\|code==='22P02'/.test(html)&&/if\(ok==='terminal'\) continue/.test(html)]
  ,['Pending management patches survive reload',/overlayPendingSupabaseManagement/.test(html)&&/Object\.keys\(supabaseManagementOutbox\)\.length/.test(html)]
  ,['Manual orders exist remotely before assignment',/from\('khsx_orders'\)\.insert/.test(html)&&/source:'miniapp'/.test(html)&&/Chưa lưu được đơn/.test(html)]
  ,['Deleted orders are persisted and hidden while offline',/kind==='delete'/.test(html)&&/deleted_at/.test(html)&&/pendingDeleteIds/.test(html)&&/purgeSupabaseOutboxForOrder/.test(html)]
  ,['Support assignment honors explicit Dán=0 but blocks completed output',/function coTheGanHoTroTrongNgay/.test(html)&&/daNhap=daNhapDanTrongNgay/.test(html)&&/daDan>=keHoach/.test(html)&&/source_order_id/.test(html)]
  ,['Capacity defaults to today',/id="capacityQuickToday"/.test(html)&&/datCapacityRange\(d,d\)/.test(html)]
  ,['Mobile manager approval remains scrollable',/#staffUsersModal[\s\S]*?#telegramAccessRequests \.table-scroll[\s\S]*?overflow-x:auto/.test(html)&&/approve-telegram-btn/.test(html)]
  ,['Current manager excluded from Telegram link targets',/String\(p\.user_id\)!==String\(currentUser\?\.auth_user_id/.test(html)]
  ,['Test mode removed from production UI',!/stageTestMenuBtn|stageTestBtn|stageTestModal|managerStageTestMode/.test(html)]
  ,['Local Supabase requires real session',!/LOCAL_SUPABASE_UI_TEST|LOCAL_DROP_DEMO_MODE|TEST-RỚT-8/.test(html)]
];

let failed=0;
for(const [name,ok] of checks){
  console.log(`${ok?'PASS':'FAIL'}  ${name}`);
  if(!ok) failed++;
}
if(failed) process.exit(1);
console.log(`\nUpgrade v114 checks passed (${checks.length}/${checks.length}).`);

