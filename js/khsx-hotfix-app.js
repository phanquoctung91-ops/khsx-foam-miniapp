// Loaded after the main definitions and before bootstrap; uses the existing app state.
const hotfixLegacyQueues={stage:KhsxHotfixSync.normalizeQueue(supabaseStageOutbox),management:KhsxHotfixSync.normalizeQueue(supabaseManagementOutbox)};
supabaseStageOutbox={};supabaseManagementOutbox={};
let hotfixAccount='',hotfixDevice='',hotfixMode='normal',hotfixModeReadAt=0,hotfixModeBusy=false;
let hotfixVerifiedVisible=!document.hidden,hotfixReturnBusy=false,hotfixLoginPromise=null;
let hotfixDataCache={},hotfixReadAccount='',hotfixFullReadAt=0,hotfixLoadBusy=false;
const hotfixDirtyTables=new Set();
// Last disk snapshot this tab has seen for each storage key (account+device specific).
// Lets saveQueueMerged tell "we deleted this on purpose" apart from "another tab's item".
const hotfixDiskBaseline={};
function hotfixContext(){return {accountId:currentUser?.auth_user_id||'',deviceId:getSupabaseDeviceId(),visible:!document.hidden,online:navigator.onLine,authPaused:!hotfixVerifiedVisible,mode:hotfixMode};}
const hotfixScheduler=KhsxHotfixSync.createScheduler({getContext:hotfixContext,onState:()=>renderHotfixStatus()});
function hotfixQueueKey(base){return KhsxHotfixSync.storageKey(base,hotfixAccount,hotfixDevice);}
function hotfixBindAccount(){
  const id=currentUser?.auth_user_id||'';
  if(id===hotfixAccount)return;
  if(!id){hotfixAccount='';hotfixDataCache={};supabaseStageOutbox={};supabaseManagementOutbox={};++supabaseOperationalLoadSeq;return;}
  hotfixAccount=id;hotfixDevice=getSupabaseDeviceId();hotfixDataCache={};hotfixReadAccount=id;hotfixDirtyTables.clear();
  ++supabaseOperationalLoadSeq;
  supabaseStageOutbox=hotfixLoadQueue(SUPABASE_STAGE_OUTBOX_KEY);
  supabaseManagementOutbox=hotfixLoadQueue(SUPABASE_MANAGEMENT_OUTBOX_KEY);
  hotfixScheduler.resumeAuth(id);renderHotfixStatus();
}
function hotfixLoadQueue(base){
  const key=hotfixQueueKey(base);
  const loaded=KhsxHotfixSync.loadQueue(localStorage,key);
  // Preserve unreadable bytes in the same queue before another action can overwrite storage.
  if(loaded.error){hotfixDiskBaseline[key]={};return {corrupt:{key:'corrupt',status:'quarantined',error_code:'CORRUPT_STORAGE',legacy_payload:loaded.raw,owner_account_id:hotfixAccount,device_id:hotfixDevice}};}
  hotfixDiskBaseline[key]=loaded.queue;
  return loaded.queue;
}
function hotfixPersist(base,queue,account=hotfixAccount,device=hotfixDevice){
  if(!account)return false;
  const key=KhsxHotfixSync.storageKey(base,account,device);
  const result=KhsxHotfixSync.saveQueueMerged(localStorage,key,queue,hotfixDiskBaseline[key]);
  // Another tab (same account+device share one storage key) may have added or
  // retried an item this tab does not know about yet. Bring it into THIS tab's
  // live queue object too, otherwise the next drain()/render() here would miss it,
  // and a later persist from this tab would re-lose it on the next overwrite.
  if(result.queue){
    for(const k in result.queue)if(queue[k]!==result.queue[k])queue[k]=result.queue[k];
    hotfixDiskBaseline[key]=result.queue;
  }
  if(!result.ok)supabaseStatus('Không lưu được vào bộ nhớ máy · giữ màn hình và xuất thao tác chờ',false);
  renderHotfixStatus();return result.ok;
}
function hotfixOwnItem(item){return !!currentUser?.auth_user_id&&item?.owner_account_id===currentUser.auth_user_id&&item?.device_id===hotfixDevice;}
function hotfixPending(item){return hotfixOwnItem(item)&&['pending','retry','sending'].includes(item.status||'pending');}
function hotfixBindItem(item){return KhsxHotfixSync.bindItem(item,{accountId:currentUser?.auth_user_id,deviceId:getSupabaseDeviceId()});}
async function hotfixDrain(){
  if(!SUPABASE_VARIANT||PUBLIC_VIEW_MODE||!hotfixVerifiedVisible||!hotfixTransport.available())return;
  hotfixBindAccount();
  // Read the circuit before the first write and at most every 30s thereafter.
  if(!await refreshHotfixMode())return;
  const account=hotfixAccount,device=hotfixDevice,management=supabaseManagementOutbox,stage=supabaseStageOutbox;
  return hotfixScheduler.drain([
    {getItems:()=>management,persist:q=>hotfixPersist(SUPABASE_MANAGEMENT_OUTBOX_KEY,q,account,device),send:sendSupabaseManagementItem},
    {getItems:()=>stage,persist:q=>hotfixPersist(SUPABASE_STAGE_OUTBOX_KEY,q,account,device),send:sendSupabaseStageItem}
  ]);
}
async function refreshHotfixMode(force=false){
  if(!supabaseDb||document.hidden||!navigator.onLine)return false;
  if(hotfixModeBusy)return false;
  if(!force&&Date.now()-hotfixModeReadAt<30000)return true;
  hotfixModeBusy=true;
  try{
    const {data,error}=await supabaseDb.rpc('khsx_hotfix_get_mode');
    if(error||!['normal','reduced','read_only'].includes(data?.mode))return false;
    hotfixModeReadAt=Date.now();hotfixMode=data.mode;hotfixTransport.setMode(hotfixMode);
    if(hotfixMode!=='normal')stopSupabaseRealtime({suspend:true});
    renderHotfixStatus();return true;
  }finally{hotfixModeBusy=false;}
}
async function hotfixChangeMode(){
  if(!canManage()||!supabaseDb)return;
  const mode=document.getElementById('hotfixMode').value;
  if(!confirm('Áp dụng chế độ '+document.getElementById('hotfixMode').selectedOptions[0].text+' cho toàn hệ thống?'))return;
  const {error}=await supabaseDb.rpc('khsx_hotfix_set_mode',{p_mode:mode});
  if(error){supabaseStatus('Chưa đổi được chế độ: '+error.message,false);return;}
  await refreshHotfixMode(true);if(hotfixMode==='normal')await startSupabaseRealtime();
}
function hotfixAllPending(){
  const active=[...Object.values(supabaseStageOutbox),...Object.values(supabaseManagementOutbox)].filter(hotfixOwnItem);
  // Untagged legacy payloads cannot be attributed safely. Keep the original storage intact.
  const legacy=[...Object.values(hotfixLegacyQueues.stage),...Object.values(hotfixLegacyQueues.management)].filter(x=>canManage()||hotfixOwnItem(x));
  return {active,legacy};
}
function renderHotfixStatus(){
  const el=document.getElementById('hotfixStatus');if(!el||!SUPABASE_VARIANT||PUBLIC_VIEW_MODE)return;
  el.hidden=!currentUser?.auth_user_id;if(el.hidden)return;
  const {active,legacy}=hotfixAllPending(),pending=active.filter(hotfixPending).length,failed=active.length-pending;
  const state=hotfixTransport.state();
  document.getElementById('hotfixSummary').textContent=(hotfixMode==='read_only'?'Hệ thống chỉ đọc · ':hotfixMode==='reduced'?'Đang giảm tải · ':'')+
    `${pending} thao tác chờ · ${failed+legacy.length} cần kiểm tra`+(Date.now()<state.until?' · Máy chủ đang bận, sẽ thử lại sau':'');
  const controls=document.getElementById('hotfixModeControls');if(controls)controls.hidden=!canManage();
  const select=document.getElementById('hotfixMode');if(select&&document.activeElement!==select)select.value=hotfixMode;
}
function showHotfixQueue(){
  const dialog=document.getElementById('hotfixQueueDialog'),{active,legacy}=hotfixAllPending();
  const rows=active.map(x=>({...x,legacy:false})).concat(legacy.map(x=>({...x,legacy:true})));
  const box=document.getElementById('hotfixQueueRows');box.replaceChildren();
  for(const x of rows.slice(0,100)){
    const line=document.createElement('p');
    line.textContent=`${x.order_id||'Gói cũ'} · ${x.stage||x.kind||'Thao tác'} · ${x.work_date||''} · ${x.legacy?'Gói cũ chưa xác định tài khoản':x.status==='failed'?'Cần đối chiếu và nhập lại':x.status==='quarantined'?'Chưa xác định chủ sở hữu':'Đang chờ'}${x.error_code?' · '+x.error_code:''}`;
    box.append(line);
  }
  if(!rows.length)box.textContent='Không có thao tác chờ.';
  document.getElementById('hotfixQueueCount').textContent=`${rows.length} thao tác. Hiển thị tối đa 100 dòng; xuất để lấy đầy đủ. Gói cũ được giữ trên máy, không tự gửi bằng tài khoản mới. Đối chiếu máy chủ rồi nhập lại thao tác cần thiết.`;
  dialog.showModal();
}
function exportHotfixQueue(){
  const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),app_version:APP_VERSION,device:hotfixDevice,account:hotfixAccount,...hotfixAllPending(),transport:hotfixTransport.state(),scheduler:hotfixScheduler.getState()},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hotfix-thao-tac-cho.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function hotfixReturnToApp(){
  if(!SUPABASE_VARIANT||PUBLIC_VIEW_MODE||document.hidden||hotfixReturnBusy||!hotfixTransport.available())return;
  hotfixReturnBusy=true;
  try{
    if(!currentUser?.auth_user_id)return;
    hotfixVerifiedVisible=false;
    if(!await revalidateSupabaseSession())return;
    hotfixVerifiedVisible=true;hotfixBindAccount();hotfixScheduler.resumeAuth(hotfixAccount);
    if(!await refreshHotfixMode())return;
    await pollForUpdates({forceSourceRefresh:true});
    await startSupabaseRealtime();await hotfixDrain();
  }finally{hotfixReturnBusy=false;}
}
document.addEventListener('visibilitychange',()=>{
  if(!SUPABASE_VARIANT)return;
  if(document.hidden){hotfixVerifiedVisible=false;stopSupabaseRealtime({suspend:true});hotfixTransport.pause();clearTimeout(supabaseReloadTimer);supabaseDb?.auth.stopAutoRefresh();}
  else {supabaseDb?.auth.startAutoRefresh();hotfixReturnToApp();}
});
window.addEventListener('online',hotfixReturnToApp);
window.addEventListener('storage',e=>{
  // Same account+device across two open tabs share one storage key. Pick up
  // whatever the other tab just wrote immediately, instead of waiting for this
  // tab's own next persist to (safely, but lazily) merge it in.
  if(!SUPABASE_VARIANT||!e.key||!hotfixAccount||!hotfixDevice)return;
  const target=e.key===hotfixQueueKey(SUPABASE_STAGE_OUTBOX_KEY)?supabaseStageOutbox
    :e.key===hotfixQueueKey(SUPABASE_MANAGEMENT_OUTBOX_KEY)?supabaseManagementOutbox:null;
  if(!target)return;
  let incoming;
  try{incoming=KhsxHotfixSync.normalizeQueue(e.newValue?JSON.parse(e.newValue):{});}catch(error){return;}
  const merged=KhsxHotfixSync.mergeQueues(target,incoming);
  for(const key in merged)if(target[key]!==merged[key])target[key]=merged[key];
  renderHotfixStatus();
});
setInterval(()=>{
  if(!SUPABASE_VARIANT||PUBLIC_VIEW_MODE||document.hidden||!hotfixTransport.available())return;
  if(!hotfixVerifiedVisible)hotfixReturnToApp();
  else if(currentUser?.auth_user_id)refreshHotfixMode().then(()=>{if(hotfixMode==='normal'&&supabasePrimaryActive)startSupabaseRealtime();});
},30000);
window.khsxHotfixReady=true;
