(function(root, factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.KhsxHotfixSync=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DELAYS=[30000,60000,120000,300000,600000];
  const PENDING=new Set(['pending','retry','sending']);
  const str=v=>String(v==null?'':v);
  const timestamp=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
  const operation=item=>str(item&&(item.operation_id||item.revision));

  function classifyError(error){
    const e=error||{};
    const code=str(e.code||e.error_code).toUpperCase();
    const message=str(e.message||e.error_description||error);
    const status=Number(e.status||e.statusCode||e.http_status)||0;
    const text=(code+' '+message).toUpperCase();
    if(code==='PT409'||code==='40001'||text.includes('ASSIGNMENT_CONFLICT'))
      return {kind:'conflict',code:code||'ASSIGNMENT_CONFLICT',retryable:false};
    if(status===401||['PGRST301','PGRST302','PGRST303','SESSION_REQUIRED','AUTH_REQUIRED','JWT_EXPIRED'].includes(code)||
       /SESSION_REQUIRED|JWT EXPIRED|INVALID JWT|REFRESH TOKEN/.test(text))
      return {kind:'auth',code:code||'SESSION_REQUIRED',retryable:false};
    if(status===403||code==='42501'||/MANAGER_REQUIRED|PERMISSION_DENIED|PROGRESS_LOCKED|DAY_LOCKED/.test(text))
      return {kind:'rejected',code:code||'PERMISSION_DENIED',retryable:false};
    if(code.startsWith('HOTFIX_')||code==='SYSTEM_READ_ONLY'||e.retryable===true||status===408||status===429||status>=500||
       ['PGRST000','PGRST001','PGRST002','PGRST003','57014','53300','53400','55P03','57P01','57P02','57P03','08000','08003','08006','ACK_MISSING','NETWORK_ERROR','TRANSPORT_PAUSED'].includes(code)||
       /^08/.test(code)||/FAILED TO FETCH|FETCH FAILED|NETWORKERROR|NETWORK REQUEST FAILED|LOAD FAILED|ECONN|ETIMEDOUT|TIMEOUT|TIMED OUT|SERVICE UNAVAILABLE|GATEWAY TIMEOUT/.test(text))
      return {kind:'transient',code:code||('HTTP_'+status)||'NETWORK_ERROR',retryable:true};
    return {kind:'rejected',code:code||('HTTP_'+status)||'UNKNOWN_ERROR',retryable:false};
  }

  function retryDelay(attempts,random=Math.random){
    const base=DELAYS[Math.min(DELAYS.length-1,Math.max(0,(Number(attempts)||1)-1))];
    return Math.min(600000,Math.round(base*(1+Math.max(0,Math.min(1,Number(random())||0))*0.2)));
  }

  function bindItem(item,context={},now=Date.now()){
    const out={...item};
    out.owner_account_id=str(out.owner_account_id||context.accountId);
    out.device_id=str(out.device_id||context.deviceId);
    out.created_at=out.created_at||new Date(now).toISOString();
    out.status=out.status||'pending';
    out.attempts=timestamp(out.attempts);
    out.next_attempt_at=timestamp(out.next_attempt_at);
    if(!out.owner_account_id||!out.device_id||!operation(out)){
      out.status='quarantined';
      out.error_code=!out.owner_account_id?'LEGACY_OWNER_UNKNOWN':(!out.device_id?'LEGACY_DEVICE_UNKNOWN':'OPERATION_ID_MISSING');
    }
    return out;
  }

  function normalizeQueue(queue,now=Date.now()){
    const out={};
    if(!queue||typeof queue!=='object'||Array.isArray(queue)) return out;
    Object.entries(queue).forEach(([key,item])=>{
      if(!item||typeof item!=='object'||Array.isArray(item)){
        out[key]={key,legacy_payload:item,status:'quarantined',error_code:'INVALID_LEGACY_ENTRY'};
        return;
      }
      // Never bind an old payload to the account which happens to log in next.
      const value=bindItem({...item,key:item.key||key},{},now);
      if(value.status==='sending'){
        value.status='retry';
        value.next_attempt_at=Math.max(timestamp(value.next_attempt_at),now+DELAYS[0]);
      }
      out[key]=value;
    });
    return out;
  }

  function storageKey(base,accountId,deviceId){
    if(!accountId||!deviceId) throw new Error('Account and device are required for queue storage');
    return str(base)+':account:'+encodeURIComponent(accountId)+':device:'+encodeURIComponent(deviceId);
  }
  function loadQueue(storage,key,now=Date.now()){
    let raw;
    try{raw=storage.getItem(key);if(!raw)return {queue:{},error:null};return {queue:normalizeQueue(JSON.parse(raw),now),error:null};}
    catch(error){return {queue:{},error,raw};}
  }
  function saveQueue(storage,key,queue){
    try{storage.setItem(key,JSON.stringify(queue));return {ok:true};}
    catch(error){return {ok:false,error};}
  }
  // Two tabs of the same account+device share this storage key. Each tab only ever
  // writes its own in-memory snapshot, so a plain overwrite can silently drop an item
  // the OTHER tab just added or is still retrying. Merge with whatever is on disk right
  // before writing: never drop a key present on either side, and for a key present on
  // both sides keep whichever copy looks more advanced (more attempts / more recent
  // activity). A duplicate resend of an already-applied operation is safe (server-side
  // receipt makes it idempotent); a silently lost operation is not.
  function itemRank(item){
    if(!item||typeof item!=='object') return -1;
    return Math.max(timestamp(item.attempts),timestamp(item.last_attempt_at),
      item.created_at?(Date.parse(item.created_at)||0):0);
  }
  function mergeQueues(base,incoming){
    const out={...(base&&typeof base==='object'&&!Array.isArray(base)?base:{})};
    Object.entries(incoming||{}).forEach(([key,item])=>{
      const existing=out[key];
      out[key]=(!existing||itemRank(item)>=itemRank(existing))?item:existing;
    });
    return out;
  }
  function saveQueueMerged(storage,key,queue,baseline){
    let disk={};
    try{const raw=storage.getItem(key);if(raw)disk=JSON.parse(raw)||{};}
    catch(error){/* unreadable disk copy: still write our own items rather than blocking */}
    const known=baseline&&typeof baseline==='object'?baseline:{};
    const merged={...queue};
    Object.entries(disk).forEach(([k,item])=>{
      const ours=merged[k];
      if(ours){ if(itemRank(item)>itemRank(ours)) merged[k]=item; return; }
      // Present on disk but not in our in-memory queue. If OUR baseline already had this
      // key, we deleted it on purpose (it settled) — respect that instead of resurrecting
      // it. If we never knew about it, it is another tab's item — do not drop it.
      if(Object.prototype.hasOwnProperty.call(known,k)) return;
      merged[k]=item;
    });
    try{storage.setItem(key,JSON.stringify(merged));return {ok:true,queue:merged};}
    catch(error){return {ok:false,error,queue:merged};}
  }

  function summarize(queue,context={}){
    const result={pending:0,failed:0,quarantined:0,otherAccount:0,confirmed:0};
    Object.values(queue||{}).forEach(item=>{
      if(!item||item.status==='quarantined'||!item.owner_account_id){result.quarantined++;return;}
      if(str(item.owner_account_id)!==str(context.accountId)||str(item.device_id)!==str(context.deviceId)){
        result.otherAccount++;return;
      }
      if(item.status==='failed') result.failed++;
      else if(item.status==='confirmed') result.confirmed++;
      else if(PENDING.has(item.status||'pending')) result.pending++;
    });
    return result;
  }

  function createScheduler(options={}){
    const now=options.now||Date.now;
    const random=options.random||Math.random;
    const getContext=options.getContext||(()=>({}));
    const initial=options.initialState||{};
    const state={
      blocked_until:timestamp(initial.blocked_until),
      consecutive_failures:timestamp(initial.consecutive_failures),
      auth_paused_account:str(initial.auth_paused_account),
      next_drain_at:timestamp(initial.next_drain_at),
      last_error_code:str(initial.last_error_code)
    };
    let inFlight=false,queueOffset=0;
    const getState=()=>({...state,in_flight:inFlight});
    const emit=()=>{if(options.onState) options.onState(getState());};

    function pauseReason(context=getContext()){
      if(!context.accountId||!context.deviceId) return 'no_account';
      if(context.online===false) return 'offline';
      if(context.visible===false) return 'hidden';
      if(context.authPaused||state.auth_paused_account===str(context.accountId)) return 'auth';
      if(context.mode==='read_only') return 'read_only';
      if(state.blocked_until>now()) return 'server_busy';
      return '';
    }
    function sameItem(queue,key,item){
      const current=queue[key];
      return !!current&&(current===item||!!operation(item)&&operation(current)===operation(item));
    }
    function ready(item,context){
      return item&&PENDING.has(item.status||'pending')&&item.status!=='sending'&&
        str(item.owner_account_id)===str(context.accountId)&&str(item.device_id)===str(context.deviceId)&&
        !!operation(item)&&timestamp(item.next_attempt_at)<=now();
    }
    function settle(queue,key,item,outcome){
      const ack=outcome===true?{status:'applied'}:outcome;
      const status=str(ack&&ack.status).toLowerCase();
      const success=['applied','duplicate','confirmed'].includes(status);
      if(success){
        state.consecutive_failures=0;state.blocked_until=0;state.last_error_code='';
        if(sameItem(queue,key,item)) delete queue[key];
        emit();return 'applied';
      }
      const error=(ack&&ack.error)||{code:ack&&ack.code||'ACK_MISSING',message:ack&&ack.message||'Server has not acknowledged the operation'};
      let kind=classifyError(error);
      if(['conflict','rejected'].includes(status)) kind={kind:status,code:error.code||status.toUpperCase(),retryable:false};
      const value={
        status:kind.kind==='transient'||kind.kind==='auth'?'retry':'failed',
        attempts:timestamp(item.attempts)+1,
        error_code:kind.code,
        error_message:str(error.message).slice(0,200),
        last_attempt_at:now(),next_attempt_at:0
      };
      if(kind.kind==='transient'){
        value.next_attempt_at=now()+retryDelay(value.attempts,random);
        state.consecutive_failures++;
        state.blocked_until=Math.max(value.next_attempt_at,state.consecutive_failures>=3?now()+300000:0);
      }else if(kind.kind==='auth'){
        state.auth_paused_account=str(item.owner_account_id);
        value.next_attempt_at=now()+DELAYS[0];
      }
      state.last_error_code=kind.code;
      if(sameItem(queue,key,item)) Object.assign(queue[key],value);
      emit();return kind.kind;
    }

    async function drain(descriptors){
      if(inFlight) return {sent:0,reason:'in_flight'};
      const context={...getContext()},reason=pauseReason(context);
      if(reason) return {sent:0,reason};
      if(state.next_drain_at>now()) return {sent:0,reason:'batch_wait'};
      const queues=(descriptors||[]).map(d=>({...d,items:d.getItems()}));
      if(!queues.length) return {sent:0,reason:'empty'};
      inFlight=true;
      // A button, online event, or another polling loop cannot exhaust a backlog.
      state.next_drain_at=now()+5000;
      emit();
      let sent=0;
      const limit=context.mode==='reduced'?1:5;
      try{
        while(sent<limit){
          const current=getContext();
          if(str(current.accountId)!==str(context.accountId)||str(current.deviceId)!==str(context.deviceId)||pauseReason(current)) break;
          let selected=null;
          for(let i=0;i<queues.length;i++){
            const n=(queueOffset+i)%queues.length,descriptor=queues[n];
            const entry=Object.entries(descriptor.items).find(([,item])=>ready(item,current));
            if(entry){selected={descriptor,key:entry[0],item:entry[1]};queueOffset=(n+1)%queues.length;break;}
          }
          if(!selected) break;
          const {descriptor,key,item}=selected;
          item.status='sending';item.last_attempt_at=now();
          // Persist the intent before sending; storage failure must stop the write.
          const persisted=descriptor.persist?descriptor.persist(descriptor.items):undefined;
          if(persisted===false||persisted&&persisted.ok===false){
            item.status='retry';item.error_code='LOCAL_STORAGE_FAILED';break;
          }
          let outcome;
          try{outcome=await descriptor.send(item);}
          catch(error){outcome={error};}
          sent++;
          settle(descriptor.items,key,item,outcome);
          if(descriptor.persist) descriptor.persist(descriptor.items);
        }
        return {sent,reason:pauseReason()};
      }finally{inFlight=false;emit();}
    }
    return {
      drain,getState,
      canSend:()=>!pauseReason(),
      isPaused:()=>!!pauseReason(),
      pauseReason,
      resumeAuth(accountId){
        // Call only after a successful explicit session refresh/sign in.
        if(str(accountId)===state.auth_paused_account){state.auth_paused_account='';emit();}
      }
    };
  }
  return {classifyError,retryDelay,bindItem,normalizeQueue,storageKey,loadQueue,saveQueue,saveQueueMerged,mergeQueues,summarize,createScheduler};
});
