// Exercise the actual queue/send functions without production connections.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const extract=name=>{const start=html.search(new RegExp('(?:async )?function '+name+'\\('));assert(start>=0,name);return html.slice(start,html.indexOf('\n}',start)+2);};
let seq=0,saved='',fail=true,calls=[];
const ctx=vm.createContext({CONG_DOAN:['dan','may','dong_goi'],supabaseStageOutbox:{},
 hotfixBindAccount:()=>{},hotfixBindItem:x=>({...x,owner_account_id:'LOCAL'}),hotfixOwnItem:()=>true,
 hotfixDirtyTables:new Set(),scheduleSupabaseReload:()=>{},
 makeOperationId:()=>String(++seq),getSupabaseDeviceId:()=> 'LOCAL',soCongDoan:Number,toKpiKhiNhapCongDoan:()=> 'Tổ 1',
 markLocalWrite:()=>{},persistSupabaseStageOutbox:()=>{saved=JSON.stringify(ctx.supabaseStageOutbox)},flushSupabaseStageOutbox:()=>{},
 parseDMY:s=>{const [d,m,y]=s.split('/').map(Number);return {d,m,y}},uiUnitToSupabase:s=>s.replace('Tổ','To'),
 supabaseStatus:()=>{},console:{warn:()=>{}},window:{KhsxDataCore:{classifyWriteError:()=>({retryable:true}),retryDelay:()=>1}},
 supabaseDb:{auth:{getSession:async()=>({data:{session:{user:{id:'LOCAL'}}}})},rpc:async(name,args)=>{calls.push({name,args});return fail?{error:{message:'LOCAL offline'}}:{data:[{operation_id:args.p_operation_id,applied_quantity:args.p_quantity}]}}}
});
vm.runInContext(extract('queueStagePatchForSupabase')+'\n'+extract('sendSupabaseStageItem'),ctx);
(async()=>{
 ctx.queueStagePatchForSupabase({id:'LOCAL-A'},'08/09/2026','dan',5,'Tổ 1',null,false);
 let item=Object.values(ctx.supabaseStageOutbox)[0];const original=item.occurred_at;assert(Number.isFinite(Date.parse(original)));
 assert.equal((await ctx.sendSupabaseStageItem(item)).error.message,'LOCAL offline');
 ctx.supabaseStageOutbox=JSON.parse(saved);item=Object.values(ctx.supabaseStageOutbox)[0];fail=false;
 assert.equal((await ctx.sendSupabaseStageItem(item)).status,'applied');assert.equal(item.occurred_at,original);
 assert.equal(calls[0].args.p_operation_id,calls[1].args.p_operation_id);assert.equal(calls[1].args.p_occurred_at,original);assert.equal(calls[1].name,'khsx_apply_stage_progress_timed');
 delete item.occurred_at;await ctx.sendSupabaseStageItem(item);assert.equal(calls.at(-1).args.p_occurred_at,null);
 console.log('PASS offline persistence/retry keeps original operation/time; legacy outbox sends null, never reload time');
})().catch(e=>{console.error(e);process.exitCode=1});
