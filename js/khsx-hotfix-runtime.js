// Bounded transport and invalidation for the existing operational data model.
(function(root){
  'use strict';
  const READ_RPCS=new Set(['khsx_guest_dashboard_v116','khsx_hotfix_get_mode','khsx_read_capacity_events']);
  function createTransport({fetch:send,context=()=>({}),now=Date.now,random=Math.random,onState=()=>{},readRpcs=[]}={}){
    const reads=new Set([...READ_RPCS,...readRpcs]);
    let active=0,failures=0,until=0,mode='normal',requests=0,errors=0,lastSuccess=0,lastProbe=0,writeActive=false;
    const waiters=[],controllers=new Set();
    const state=()=>({active,failures,until,mode,requests,errors,lastSuccess});
    const notify=()=>onState(state());
    const blocked=(code,message,status=503)=>new Response(JSON.stringify({code,message}),{status,headers:{'Content-Type':'application/json'}});
    const contextKey=c=>String(c.accountId||'');
    function available(){const c=context();return c.visible!==false&&c.online!==false&&now()>=until;}
    function pause(){for(const c of controllers)c.abort();notify();}
    async function request(input,init={}){
      const c0=context(),account=contextKey(c0);
      const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
      const method=String(init.method||(typeof input==='object'?input.method:'GET')||'GET').toUpperCase();
      const rpc=url.pathname.split('/rpc/')[1]||'';
      const control=rpc==='khsx_hotfix_get_mode'||rpc==='khsx_hotfix_set_mode';
      const write=url.pathname.startsWith('/rest/v1/')&&!['GET','HEAD'].includes(method)&&!reads.has(rpc);
      while(active>=3||(write&&writeActive)){
        if(waiters.length>=32)return blocked('HOTFIX_BUSY','Đang chờ đồng bộ');
        await new Promise(resolve=>waiters.push(resolve));
      }
      active++;
      if(write)writeActive=true;
      let timer,controller;
      try{
        const c=context();
        if(account!==contextKey(c))return blocked('HOTFIX_ACCOUNT_CHANGED','Tài khoản đã thay đổi',401);
        if(c.visible===false)return blocked('HOTFIX_HIDDEN','Tạm dừng khi ứng dụng ở nền');
        if(c.online===false)return blocked('HOTFIX_OFFLINE','Đang mất mạng');
        if(now()<until&&(!control||now()-lastProbe<30000))return blocked('HOTFIX_COOLDOWN','Máy chủ đang bận, đang chờ thử lại');
        if(control)lastProbe=now();
        if(write&&mode==='read_only'&&!control)return blocked('SYSTEM_READ_ONLY','Hệ thống tạm chỉ đọc');
        controller=new AbortController();controllers.add(controller);
        const signal=init.signal||(typeof input==='object'?input.signal:null);
        const abort=()=>controller.abort();
        if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(abort,20000);
        requests++;notify();
        let response;
        try{response=await send(input,{...init,signal:controller.signal});}
        finally{signal?.removeEventListener('abort',abort);}
        if(response.status===429||response.status>=500){
          const body=await response.clone().json().catch(()=>({}));
          if(body.message==='SYSTEM_READ_ONLY'||body.code==='SYSTEM_READ_ONLY'){mode='read_only';notify();return response;}
          failures++;errors++;
          const delay=failures>=3?300000:[30000,60000][failures-1];
          until=Math.max(until,now()+delay+Math.floor(random()*delay*.2));
        }else if(response.ok){failures=0;lastSuccess=now();}
        notify();return response;
      }catch(e){
        if(context().visible!==false&&context().online!==false){failures++;errors++;until=Math.max(until,now()+(failures>=3?300000:30000)* (1+random()*.2));}
        notify();return blocked('HOTFIX_NETWORK','Chưa kết nối được máy chủ');
      }finally{
        clearTimeout(timer);if(controller)controllers.delete(controller);
        active--;if(write)writeActive=false;waiters.splice(0).forEach(w=>w());
      }
    }
    return {fetch:request,available,pause,state,setMode(value){if(['normal','reduced','read_only'].includes(value))mode=value;notify();}};
  }
  const groups={
    khsx_orders:['khsx_orders','khsx_order_assignments','khsx_daily_assignments','khsx_stage_progress','khsx_stage_credits'],
    khsx_order_assignments:['khsx_order_assignments','khsx_daily_assignments'],
    khsx_daily_assignments:['khsx_daily_assignments','khsx_order_assignments'],
    khsx_stage_progress:['khsx_stage_progress','khsx_stage_credits'],
    khsx_stage_credits:['khsx_stage_credits','khsx_stage_progress'],
    khsx_day_locks:['khsx_day_locks','khsx_plan_snapshots'],
    khsx_profiles:['khsx_profiles','khsx_workers','khsx_worker_team_assignments'],
    khsx_workers:['khsx_workers','khsx_profiles','khsx_worker_team_assignments'],
    khsx_worker_team_assignments:['khsx_worker_team_assignments','khsx_profiles','khsx_workers']
  };
  function affectedTables(table){return groups[table]||[table];}
  root.KhsxHotfixRuntime={createTransport,affectedTables};
  if(typeof module==='object'&&module.exports)module.exports=root.KhsxHotfixRuntime;
})(typeof window==='object'?window:globalThis);
