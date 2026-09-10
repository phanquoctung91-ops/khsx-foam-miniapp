const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../js/khsx-capacity-timing.js'),'utf8'));
const T=globalThis.KhsxCapacityTiming,at=(d,t)=>Date.parse(d+'T'+t+':00+07:00');
let n=0;function check(name,fn){fn();console.log('PASS '+name);n++;}
check('calendar excludes breaks, nights and Sundays; today clamps elapsed minutes',()=>{
 assert.equal(T.minutesBetween(at('2026-09-08','07:00'),at('2026-09-08','17:00')),480);
 assert.equal(T.dayMinutes('2026-09-08',at('2026-09-08','09:30')),135);
 assert.equal(T.dayMinutes('2026-09-08',at('2026-09-08','12:00')),255);
 assert.equal(T.minutesBetween(at('2026-09-12','16:00'),at('2026-09-14','08:00')),120);
 assert.equal(T.dayMinutes('2026-09-09',at('2026-09-08','17:00')),0);
});
check('personal output includes warranty, zero-output days, weighted ratio and unknown worker',()=>{
 const details=[{date:'2026-09-08',quantity:70,warranty:false},{date:'2026-09-08',quantity:10,warranty:true}];
 let r=T.dailyReport({from:'2026-09-08',to:'2026-09-08',details,now:at('2026-09-09','17:00')});assert.equal(r.perPiece,6);assert.equal(r.quantity,80);
 r=T.dailyReport({from:'2026-09-08',to:'2026-09-09',details,now:at('2026-09-09','17:00')});assert.equal(r.perPiece,12);assert.equal(r.rows[1].perPiece,null);assert.equal(r.rows[1].quantity,0);
 assert.equal(T.dailyReport({from:'2026-09-08',to:'2026-09-08',details,now:at('2026-09-09','17:00'),unknown:true}).perPiece,null);
});
let id=0;
function receipt(order,team,time){return {id:++id,kind:'assignment',order_id:order,recorded_at:new Date(time).toISOString(),payload:{before:{},after:{current_team:team}}};}
function progress(order,team,date,time,quantity,old=0){return {id:++id,kind:'progress',order_id:order,work_date:date,recorded_at:new Date(time).toISOString(),occurred_at:new Date(time).toISOString(),quality:'device_time',payload:{order:{plan_qty:15},before:{quantity:old},after:{quantity,kpi_team:team}}};}
const base={from:'2026-09-08',to:'2026-09-08',now:at('2026-09-09','17:00'),team:'Tổ 1',orders:[{id:'a',code:'LAGO',product:'LAGO',size:'180×200',thickness:'10'}]};
check('15 mattresses 07–09 = 8 min/piece; late receipt starts when received',()=>{
 const p={orderId:'a',date:'2026-09-08',team:'Tổ 1',quantity:15,completed:true};
 let r=T.gluingReport({...base,production:[p],events:[receipt('a','To 1',at('2026-09-07','16:00')),progress('a','To 1',p.date,at(p.date,'09:00'),15)]});
 assert.equal(r.rows[0].start,at(p.date,'07:00'));assert.equal(r.minutes,120);assert.equal(r.perPiece,8);
 r=T.gluingReport({...base,production:[p],events:[receipt('a','To 1',at(p.date,'10:00')),progress('a','To 1',p.date,at(p.date,'11:00'),15)]});assert.equal(r.minutes,60);
});
check('support origin ends at 09:00, not 09:20; receiver waits behind existing work',()=>{
 const day='2026-09-08',time=t=>at(day,t),events=[receipt('a','To 1',at('2026-09-07','16:00')),receipt('own','To 4',at('2026-09-07','16:00')),progress('a','To 1',day,time('09:00'),5),
 {id:++id,kind:'assignment',order_id:'a',recorded_at:new Date(time('09:20')).toISOString(),payload:{before:{current_team:'To 1'},after:{current_team:'To 1',spinoff_order_id:'help'}}},
 receipt('help','To 4',time('09:20')),progress('own','To 4',day,time('10:00'),10),progress('help','To 4',day,time('11:00'),4)];
 const production=[{orderId:'a',date:day,team:'Tổ 1',quantity:5,completed:false},{orderId:'own',date:day,team:'Tổ 4',quantity:10,completed:true},{orderId:'help',date:day,team:'Tổ 4',quantity:4,completed:true}];
 let r=T.gluingReport({...base,events,production});assert.equal(r.rows[0].end,time('09:00'));assert.equal(r.rows[0].minutes,120);
 r=T.gluingReport({...base,team:'Tổ 4',events,production});assert.equal(r.rows[1].start,time('10:00'));assert.equal(r.rows[1].perPiece,15);
 r=T.gluingReport({...base,team:'Tổ 4',events,production:production.filter(p=>p.orderId!=='own')});assert.equal(r.rows[0].start,time('09:20'));
});
check('unfinished gluing carries working shifts only; period cuts retain matching quantity',()=>{
 const p=[{orderId:'a',date:'2026-09-08',team:'Tổ 1',quantity:5,completed:false},{orderId:'a',date:'2026-09-10',team:'Tổ 1',quantity:10,completed:true}];
 const events=[receipt('a','To 1',at('2026-09-07','16:00')),progress('a','To 1',p[0].date,at(p[0].date,'15:00'),5),progress('a','To 1',p[1].date,at(p[1].date,'09:00'),10)];
 let r=T.gluingReport({...base,to:'2026-09-10',now:at('2026-09-11','17:00'),production:p,events});assert.equal(r.minutes,1080);assert.equal(r.quantity,15);assert.equal(r.rows[1].quantity,0);
 r=T.gluingReport({...base,from:'2026-09-10',to:'2026-09-10',now:at('2026-09-11','17:00'),production:p,events});assert.equal(r.minutes,120);assert.equal(r.quantity,10);
});
check('legacy, corrections, mixed incomplete sequence and simultaneous completion never fabricate duration',()=>{
 const day='2026-09-08',p={orderId:'a',date:day,team:'Tổ 1',quantity:15,completed:true};
 let r=T.gluingReport({...base,production:[p],events:[]});assert.equal(r.rows[0].minutes,null);assert.equal(r.perPiece,null);
 const receive=receipt('a','To 1',at('2026-09-07','16:00'));
 r=T.gluingReport({...base,production:[{...p,quantity:14}],events:[receive,progress('a','To 1',day,at(day,'09:00'),15),progress('a','To 1',day,at(day,'10:00'),14,15)]});assert.equal(r.rows[0].minutes,null);
 r=T.gluingReport({...base,production:[p,{...p,orderId:'b'}],events:[receive,receipt('b','To 1',at('2026-09-07','16:00')),progress('a','To 1',day,at(day,'09:00'),15),progress('b','To 1',day,at(day,'09:00'),15)]});assert.equal(r.missing,2);
});
check('support revocation and later plan changes invalidate inference; future production is excluded',()=>{
 const day='2026-09-08',p={orderId:'a',date:day,team:'Tổ 1',quantity:5,completed:false};
 const initial=[receipt('a','To 1',at('2026-09-07','16:00')),progress('a','To 1',day,at(day,'09:00'),5),
 {id:++id,kind:'support',order_id:'a',recorded_at:new Date(at(day,'09:20')).toISOString(),payload:{before:{},after:{team_name:'To 4'}}}];
 let r=T.gluingReport({...base,production:[p],events:[...initial,{id:++id,kind:'support',order_id:'a',recorded_at:new Date(at(day,'10:00')).toISOString(),payload:{before:{team_name:'To 4'},after:{}}}]});
 assert.equal(r.rows[0].minutes,null);assert.match(r.rows[0].reason,/đã sửa/);
 r=T.gluingReport({...base,production:[p],events:[...initial,{id:++id,kind:'order',order_id:'a',recorded_at:new Date(at(day,'10:00')).toISOString(),payload:{before:{plan_qty:9},after:{plan_qty:15}}}]});assert.equal(r.rows[0].minutes,null);
 r=T.gluingReport({...base,to:'2026-09-15',production:[{...p,date:'2026-09-15'}],events:initial});assert.equal(r.rows.length,0);
});
console.log(n+' timing groups passed');
