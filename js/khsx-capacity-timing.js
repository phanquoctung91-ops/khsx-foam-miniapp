(function(global){
  'use strict';
  const SHIFT=[[420,540],[555,690],[780,900],[915,1020]],MINUTE=60000;
  const isoDay=t=>new Date(Number(t)+7*3600000).toISOString().slice(0,10);
  const at=(d,m)=>Date.parse(d+'T00:00:00+07:00')+m*MINUTE;
  const next=d=>new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const workday=d=>new Date(d+'T12:00:00Z').getUTCDay()!==0;
  function dates(from,to){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return [];
    const out=[];for(let d=from;d<=to;d=next(d)){out.push(d);if(out.length>36600)throw Error('Khoảng ngày quá dài');}return out;
  }
  function minutesBetween(start,end){
    const a=Number(start),b=Number(end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return 0;
    return dates(isoDay(a),isoDay(b)).reduce((sum,d)=>sum+(workday(d)?SHIFT.reduce((s,[x,y])=>s+Math.max(0,Math.min(b,at(d,y))-Math.max(a,at(d,x)))/MINUTE,0):0),0);
  }
  const dayMinutes=(d,now=Date.now())=>minutesBetween(at(d,420),Math.min(Number(now),at(d,1020)));
  const rate=(minutes,qty)=>minutes>0&&qty>0?minutes/qty:null;
  function dailyReport({from,to,details=[],now=Date.now(),unknown=false}){
    const byDay=new Map();details.forEach(x=>{if(x.date<=isoDay(now)){const d=byDay.get(x.date)||[];d.push(x);byDay.set(x.date,d);}});
    const rows=dates(from,to).filter(d=>d<=isoDay(now)&&(workday(d)||byDay.has(d))).map(date=>{
      const items=byDay.get(date)||[],production=items.filter(x=>!x.warranty).reduce((s,x)=>s+x.quantity,0),warranty=items.filter(x=>x.warranty).reduce((s,x)=>s+x.quantity,0);
      const minutes=unknown?null:dayMinutes(date,now),quantity=production+warranty;
      return {date,production,warranty,quantity,minutes,perPiece:rate(minutes,quantity),details:items,
        status:unknown?'Chưa ghi người':!workday(date)?'Ngoài lịch làm việc':date===isoDay(now)?'Tạm tính đến thời điểm xem':'Theo ca tiêu chuẩn'};
    });
    const minutes=unknown?null:rows.reduce((s,r)=>s+(r.minutes||0),0),quantity=rows.reduce((s,r)=>s+r.quantity,0);
    const outside=rows.some(r=>r.quantity>0&&!workday(r.date));
    return {rows,minutes,quantity,production:rows.reduce((s,r)=>s+r.production,0),warranty:rows.reduce((s,r)=>s+r.warranty,0),perPiece:outside?null:rate(minutes,quantity),outside};
  }
  // Events are immutable observations, never a substitute for production totals.
  // Progress rows passed by the caller remain the authoritative quantities.
  function gluingReport({orders=[],production=[],events=[],from,to,team,now=Date.now()}){
    const byId=new Map(orders.map(o=>[o.id,o]));
    const chronological=[...events].sort((a,b)=>Number(a.id)-Number(b.id));
    const receipts=new Map(),transfers=new Map(),progress=new Map(),baseline=new Map(),revisions=new Map();
    const uiTeam=t=>String(t||'').replace(/^To /,'Tổ ');
    chronological.forEach(e=>{
      const p=e.payload||{},o=p.order||{},after=p.after||{},before=p.before||{};
      const changedAssignment=e.kind==='assignment'&&(
        (before.spinoff_order_id&&before.spinoff_order_id!==after.spinoff_order_id)||
        (before.current_team&&before.current_team!==after.current_team));
      const changedSupport=e.kind==='support'&&before.team_name&&before.team_name!==after.team_name;
      const changedOrder=e.kind==='order'&&before.plan_qty!=null&&(
        before.plan_qty!==after.plan_qty||before.deleted_at!==after.deleted_at||before.source_order_id!==after.source_order_id);
      if(changedAssignment||changedSupport||changedOrder){
        const list=revisions.get(e.order_id)||[];list.push(Date.parse(e.recorded_at));revisions.set(e.order_id,list);
      }
      if(e.kind==='baseline')baseline.set(e.order_id,e);
      if(e.kind==='assignment'){
        const t=uiTeam(after.current_team||after.plan_team);
        if(t&&t!==uiTeam(before.current_team||before.plan_team)){
          const list=receipts.get(e.order_id)||[];list.push({team:t,time:Date.parse(e.recorded_at)});receipts.set(e.order_id,list);
        }
        if(after.spinoff_order_id&&after.spinoff_order_id!==before.spinoff_order_id){
          const list=transfers.get(e.order_id)||[];list.push({time:Date.parse(e.recorded_at),child:after.spinoff_order_id});transfers.set(e.order_id,list);
        }
      }
      if(e.kind==='support'&&after.team_name&&after.team_name!==before.team_name){
        const list=transfers.get(e.order_id)||[];list.push({time:Date.parse(e.recorded_at),team:uiTeam(after.team_name)});transfers.set(e.order_id,list);
        const received=receipts.get(e.order_id)||[];received.push({team:uiTeam(after.team_name),time:Date.parse(e.recorded_at)});receipts.set(e.order_id,received);
      }
      if(e.kind==='progress'){
        const t=uiTeam(after.kpi_team),key=[e.order_id,e.work_date,t].join('|'),list=progress.get(key)||[];
        list.push({...e,quantity:Number(after.quantity)||0,oldQuantity:Number(before.quantity)||0,plan:Number(o.plan_qty)||0,time:Date.parse(e.occurred_at),team:t});progress.set(key,list);
      }
    });
    const candidate=production.filter(p=>p.team===team&&p.date<=to&&p.date<=isoDay(now)).map(p=>{
      const o=byId.get(p.orderId)||{},es=progress.get([p.orderId,p.date,team].join('|'))||[];
      const transfer=(transfers.get(p.orderId)||[]).filter(t=>isoDay(t.time)>=p.date).sort((a,b)=>a.time-b.time)[0];
      const first=es[0],last=es[es.length-1];
      const receipt=(receipts.get(p.orderId)||[]).filter(x=>x.team===team&&x.time<=at(p.date,1020)).at(-1);
      const base=baseline.get(p.orderId),baseTeam=uiTeam(base?.payload?.assignment?.current_team||base?.payload?.assignment?.plan_team);
      const available=receipt?.time??(base&&baseTeam===team?Date.parse(base.recorded_at):null);
      let reason='';
      if(!last||!first||es.some(e=>!e.occurred_at||e.quality!=='device_time'||isoDay(e.time)!==p.date))reason='Chưa có thời gian';
      else if(es.some(e=>e.quantity<e.oldQuantity)||last.quantity!==p.quantity)reason='Số liệu đã sửa / thiếu sự kiện';
      else if(es.some((e,i)=>e.time>Number(now)||(i>0&&e.time<es[i-1].time)))reason='Mốc thời gian cần kiểm tra';
      else if((revisions.get(p.orderId)||[]).some(t=>t>=first.time))reason='Phân công / kế hoạch đã sửa, cần đối chiếu mốc';
      else if(available==null||available>last.time)reason='Chưa có mốc nhận việc';
      else if(first.oldQuantity>0)reason='Thiếu mốc đầu phần việc';
      // A baseline captured mid-shift cannot prove the previous job's finish.
      else if(base&&isoDay(Date.parse(base.recorded_at))===p.date&&!receipt)reason='Ngày bắt đầu theo dõi chưa đủ mốc';
      const closed=p.completed||!!(transfer&&last&&last.time<=transfer.time);
      const end=reason?null:closed?last.time:Math.min(at(p.date,1020),Number(now));
      return {...p,product:o.product||'',size:o.size||'',thickness:o.thickness||'',code:o.code||p.orderId,
        sourceOrderId:o.sourceOrderId||'',support:!!o.support,receivedAt:available,transferAt:transfer?.time||null,
        observedEnd:last?.time||null,start:null,end,minutes:null,perPiece:null,closed,reason,
        status:reason||(closed?'Đã kết thúc phần việc':'Tạm tính — Dán còn rớt')};
    });
    // Calendar gaps for a known unfinished job count working shifts, not nights.
    const carryRows=[];
    candidate.forEach(r=>{
      if(r.reason||r.closed)return;
      const later=candidate.filter(x=>x.orderId===r.orderId&&x.date>r.date).sort((a,b)=>a.date.localeCompare(b.date))[0];
      const stop=later?later.date:next(to<isoDay(now)?to:isoDay(now));
      for(let d=next(r.date);d<stop;d=next(d))if(workday(d))carryRows.push({...r,date:d,quantity:0,observedEnd:null,end:Math.min(at(d,1020),Number(now)),status:'Tạm tính — Dán chuyển ngày'});
    });
    const all=[...candidate,...carryRows];
    const days=[...new Set(all.map(r=>r.date))].sort();
    days.forEach(day=>{
      const rows=all.filter(r=>r.date===day).sort((a,b)=>(a.observedEnd??a.end??Infinity)-(b.observedEnd??b.end??Infinity));
      let cursor=at(day,420),uncertain=false;
      rows.forEach((r,i)=>{
        if(r.reason){uncertain=true;return;}
        const tied=rows.some((x,j)=>i!==j&&x.observedEnd&&r.observedEnd&&Math.abs(x.observedEnd-r.observedEnd)<1000);
        const missingPeer=rows.some(x=>x.reason);
        if(uncertain||missingPeer||tied){r.reason=tied?'Nhiều đơn ghi cùng lúc': 'Thứ tự trong ngày chưa đủ mốc';}
        else if(!workday(day)){r.reason='Ngoài lịch làm việc';}
        else{
          r.start=Math.max(cursor,r.receivedAt||0);r.minutes=minutesBetween(r.start,r.end);
          if(r.end<=r.start||r.minutes<=0){r.reason='Mốc thời gian cần kiểm tra';r.start=null;r.minutes=null;}
          else r.perPiece=rate(r.minutes,r.quantity);
        }
        if(r.reason){r.status=r.reason;r.minutes=null;r.perPiece=null;r.start=null;}
        cursor=Math.max(cursor,r.end||cursor);
        if(!r.closed)uncertain=true;
      });
    });
    const rows=all.filter(r=>r.date>=from&&r.date<=to).sort((a,b)=>a.date.localeCompare(b.date)||(a.start??Infinity)-(b.start??Infinity));
    return {rows,...gluingSummary(rows)};
  }
  function gluingSummary(rows){
    const valid=rows.filter(r=>r.minutes!=null),minutes=valid.reduce((s,r)=>s+r.minutes,0),measuredQuantity=valid.reduce((s,r)=>s+r.quantity,0);
    return {quantity:rows.reduce((s,r)=>s+r.quantity,0),minutes,measuredQuantity,perPiece:rate(minutes,measuredQuantity),missing:rows.length-valid.length};
  }
  global.KhsxCapacityTiming=Object.freeze({isoDay,at,dates,workday,minutesBetween,dayMinutes,dailyReport,gluingReport,gluingSummary});
})(typeof window==='undefined'?globalThis:window);
