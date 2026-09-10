const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const extract=name=>{const start=html.indexOf('async function '+name+'(');assert(start>=0);return html.slice(start,html.indexOf('\n}',start)+2)};
const run=[extract('reconcileSourceRowsToSupabase'),extract('syncMissingSheetOrdersToSupabase')].join(String.fromCharCode(10));
// 2026-09-10: ket noi tu dong toi Sheet cong ty da bi ngat theo yeu cau (chi con nap
// KHSX bang file tay qua nut "Nap file KHSX"). Nut autoPlanRefreshBtn va moi loi goi
// tu dong syncMissingSheetOrdersToSupabase() da bi go khoi index.html; ham nay chi con
// duoc giu lai (khong con noi nao goi) - test o day chi con xac nhan chinh ham nay
// van dung dan neu sau nay can dung lai.
assert(!/document\.getElementById\('autoPlanRefreshBtn'\)/.test(html),'nut Lam moi du lieu phai da bi xoa');
assert(!/syncMissingSheetOrdersToSupabase\(\{silent:true\}\)\);?\s*\n.*jobs\.push|jobs\.push\(syncMissingSheetOrdersToSupabase/.test(html),'khong duoc con noi tu dong goi dong bo Sheet');
let calls=[],reloads=0,notes=[],allowed=true,fail=false,reads=0;
const source={rows:[{id:'r_new',date:'05/09/2026'},{id:'r_existing',date:'05/09/2026'}]};
const ctx=vm.createContext({SUPABASE_VARIANT:true,PUBLIC_VIEW_MODE:false,sheetPlanSyncInFlight:false,
 canManage:()=>allowed,readSheetPlanSource:async()=>{reads++;return source},sheetOrderToSupabase:o=>o,
 supabaseStageOutbox:{a:{order_id:'r_pending',status:'failed'}},supabaseManagementOutbox:{b:{order_id:'r_assignment'}},
 pendingSheetChanges:{r_next:{old:{id:'r_old'},next:{id:'r_next'}}},
 getOrders:()=>[{id:'r_work',progress:1},{id:'r_zero',progress:0}],coTienDoDon:o=>o.progress>0,
 loadSupabaseOperationalData:async()=>{reloads++;return true},supabaseStatus:msg=>notes.push(msg),
 supabaseDb:{rpc:async(name,args)=>{calls.push({name,args});return fail?{error:new Error('LOCAL simulated RPC rejection')}:{data:{ok:true,changed:true,inserted:1,cancelled:1,review_count:1}}}},
 console:{warn:()=>{}}
});
vm.runInContext(run+'; globalThis.sync=syncMissingSheetOrdersToSupabase;',ctx);
(async()=>{
 let result=await ctx.sync();assert.equal(result.ok,true);assert.equal(reloads,1);assert.equal(calls.length,1);
 assert.equal(calls[0].name,'khsx_reconcile_sheet_plan');
 assert.deepEqual(calls[0].args.p_source_orders,source.rows);
 assert.deepEqual([...calls[0].args.p_pending_order_ids].sort(),['r_assignment','r_next','r_old','r_pending','r_work']);
 assert.ok(Date.parse(calls[0].args.p_source_read_at));assert.equal(ctx.sheetPlanSyncInFlight,false);
 console.log('PASS entire source and unsent/failed/local work IDs reach guarded server RPC; changed data reloads');
 fail=true;calls=[];reloads=0;result=await ctx.sync();assert.equal(result.ok,false);assert.equal(calls.length,1);assert.equal(reloads,0);assert.equal(ctx.sheetPlanSyncInFlight,false);
 console.log('PASS rejected RPC never falls back to direct writes');
 fail=false;allowed=false;calls=[];const oldReads=reads;result=await ctx.sync();assert.equal(result.skipped,true);assert.equal(reads,oldReads);assert.equal(calls.length,0);
 allowed=true;ctx.sheetPlanSyncInFlight=true;result=await ctx.sync();assert.equal(result.skipped,true);ctx.sheetPlanSyncInFlight=false;
 console.log('PASS non-manager and concurrent client requests do not sync');
 console.log('PASS auto-refresh button and its automatic sync call sites have been removed from index.html');
})().catch(e=>{console.error(e);process.exitCode=1});
