const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
vm.runInThisContext(fs.readFileSync(path.join(root,'js/khsx-capacity-core.js'),'utf8'));
const core=globalThis.KhsxCapacityCore,teams=['Tổ 1','Tổ 2','Tổ 3','Tổ 4','Tổ 5'];
let count=0;function check(name,fn){fn();console.log('PASS '+name);count++;}
const orders=[1,2,3,4].map(n=>({id:'o'+n,date:'08/09/2026',so_luong:n===4?17:40}));
orders.push({id:'help',date:'08/09/2026',so_luong:2,is_drop:true,source_order_id:'o1'});
const assignments={};[1,2,3,4].forEach(n=>{assignments['o'+n]={to:'Tổ '+n,to_goc:'Tổ '+n,stage_by_date:{'08/09/2026':{dan:n===1?38:n===4?17:40,may:n===4?0:38,dong_goi:n===4?0:38,_dan_to:'Tổ '+n}}};});
assignments.o1.spinoff_id='help';assignments.o1.support_by_date={'08/09/2026':'Tổ 4'};
assignments.help={to:'Tổ 4',to_goc:'Tổ 4',stage_by_date:{'08/09/2026':{dan:2,_dan_to:'Tổ 4'}}};
const base={orders,assignments,teams,history:o=>assignments[o.id]?.stage_by_date||{},warrantyByDay:{'08/09/2026':{theoTo:{'Tổ 1':8,'Tổ 3':8}}},from:20260908,to:20260908,today:20260909};
check('matches approved example; sewing/packing do not lower gluing capacity',()=>{
 const r=core.teamReport(base);
 assert.deepEqual(r.slice(0,4).map(x=>[x.keHoach,x.daDan,x.conCho,x.hoTro,x.baoHanh,x.tong]),[[40,38,2,0,8,46],[40,40,0,0,0,40],[40,40,0,0,8,48],[17,17,0,2,0,19]]);
 assert.equal(r.reduce((s,x)=>s+x.sanLuongTong,0),137);
});
check('reassignment alone is never support',()=>{
 const a=structuredClone(assignments);a.o1.to_goc='Tổ 3';
 assert.equal(core.teamReport({...base,assignments:a})[0].hoTro,0);
});
check('later completion cannot erase historical drops; recovered within week is counted',()=>{
 const a=structuredClone(assignments);a.o1.stage_by_date['09/09/2026']={dan:2,_dan_to:'Tổ 1'};
 const b={...base,assignments:a,history:o=>a[o.id]?.stage_by_date||{}};
 assert.equal(core.teamReport(b)[0].conCho,2);
 assert.equal(core.teamReport({...b,from:20260907,to:20260913})[0].conCho,0);
});
check('current and future plans are not final drops',()=>{
 const o=[{id:'today',date:'09/09/2026',so_luong:10},{id:'future',date:'10/09/2026',so_luong:20}];
 const r=core.teamReport({...base,orders:o,assignments:{today:{to:'Tổ 1'},future:{to:'Tổ 1'}},history:()=>({}),from:20260907,to:20260913})[0];
 assert.equal(r.conCho,0);assert.equal(r.choHomNay,10);assert.equal(r.keHoach,30);
});
check('lifetime does not change with period; exports honor exact period',()=>{
 const r=core.teamReport({...base,from:20260901,to:20260901});
 assert.equal(r[0].keHoach,0);assert.equal(r[0].tong,46);assert.equal(r[3].hoTro,2);
 const exp=core.teamReport({...base,from:20260901,to:20260901,totalsFrom:20260901,totalsTo:20260901});
 assert.equal(exp[0].tong,0);assert.equal(exp[3].hoTro,0);
});
check('Vietnam week rolls over at Monday midnight regardless of device zone',()=>{
 assert.deepEqual(core.weekRange(new Date('2026-09-06T17:05:00Z')),{from:'2026-09-07',to:'2026-09-13'});
 assert.deepEqual(core.weekRange(new Date('2026-09-06T16:59:00Z')),{from:'2026-08-31',to:'2026-09-06'});
});
console.log(`${count} capacity business checks passed`);
