(function(global){
  'use strict';
  const qty=v=>Math.max(0,Number(v)||0);
  const dayKey=s=>{
    const p=String(s||'').split('/');
    return p.length===3?Number(p[2]+p[1].padStart(2,'0')+p[0].padStart(2,'0')):0;
  };
  function vietnamToday(now=new Date()){
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function weekRange(now=new Date()){
    const d=new Date(vietnamToday(now)+'T12:00:00Z'),offset=(d.getUTCDay()+6)%7;
    d.setUTCDate(d.getUTCDate()-offset);
    const from=d.toISOString().slice(0,10); d.setUTCDate(d.getUTCDate()+6);
    return {from,to:d.toISOString().slice(0,10)};
  }
  function teamReport({orders,assignments,teams,history,warrantyByDay,from,to,today,totalsFrom=0,totalsTo=99991231}){
    const byId=new Map(orders.map(o=>[o.id,o]));
    const parentById=new Map();
    orders.forEach(o=>{
      if(o.source_order_id&&byId.has(o.source_order_id))parentById.set(o.id,o.source_order_id);
      const child=assignments[o.id]?.spinoff_id;
      if(child&&byId.has(child))parentById.set(child,o.id);
    });
    const rootOf=o=>{
      let r=o; const seen=new Set([r.id]);
      while(r.is_drop&&parentById.has(r.id)){
        const p=byId.get(parentById.get(r.id)); if(!p||seen.has(p.id))break;
        seen.add(p.id);r=p;
      }
      return r;
    };
    // Kế hoạch thuộc tổ đang được giao trong KHSX; plan_team cũ không chứng minh hỗ trợ.
    const owner=o=>assignments[o.id]?.to||assignments[o.id]?.to_goc||null;
    const rows=Object.fromEntries(teams.map(team=>[team,{team,keHoach:0,daDan:0,conCho:0,choHomNay:0,hoTro:0,baoHanh:0,baoHanhTong:0,sanLuongTong:0,hoTroTheoTo:{}}]));
    const ownByRoot=new Map();
    const inRange=(d,a,b)=>d&&d>=a&&d<=b;
    orders.filter(o=>!o.is_warranty&&!o.is_ghost).forEach(o=>{
      const root=rootOf(o),rootTeam=owner(root),a=assignments[o.id]||{},ra=assignments[root.id]||{};
      let remaining=qty(o.so_luong);
      Object.entries(history(o)).sort((a,b)=>dayKey(a[0])-dayKey(b[0])).forEach(([date,e])=>{
        const d=dayKey(date),n=Math.min(remaining,qty(e?.dan)); remaining-=n;
        if(!n||d>today)return;
        const team=e._dan_to||e._to||a.support_by_date?.[date]||owner(o);
        const row=rows[team];if(!row)return;
        const linkedSupport=root.id!==o.id&&Object.entries(ra.support_by_date||{}).some(([sd,t])=>t===team&&dayKey(sd)<=d);
        const directSupport=root.id===o.id&&ra.support_by_date?.[date]===team;
        const support=!!rootTeam&&team!==rootTeam&&(linkedSupport||directSupport);
        if(inRange(d,totalsFrom,totalsTo)){
          row.sanLuongTong+=n;
        }
        if(support&&inRange(d,from,to)){row.hoTro+=n;row.hoTroTheoTo[rootTeam]=(row.hoTroTheoTo[rootTeam]||0)+n;}
        if(team===rootTeam&&!support&&inRange(d,from,to))ownByRoot.set(root.id,(ownByRoot.get(root.id)||0)+n);
      });
    });
    orders.filter(o=>!o.is_manual&&!o.is_drop&&!o.is_ghost&&!o.is_warranty).forEach(o=>{
      const d=dayKey(o.date),row=rows[owner(o)]; if(!row||!inRange(d,from,to))return;
      const plan=qty(o.so_luong),done=Math.min(plan,ownByRoot.get(o.id)||0),left=plan-done;
      row.keHoach+=plan;row.daDan+=done;
      if(d<today)row.conCho+=left;
      else if(d===today)row.choHomNay+=left;
    });
    Object.entries(warrantyByDay||{}).forEach(([date,w])=>{
      const d=dayKey(date); if(!d||d>today)return;
      Object.entries(w.theoTo||{}).forEach(([team,n])=>{if(rows[team]){
        if(inRange(d,from,to))rows[team].baoHanh+=qty(n);
        if(inRange(d,totalsFrom,totalsTo))rows[team].baoHanhTong+=qty(n);
      }});
    });
    return teams.map(team=>({...rows[team],tong:rows[team].sanLuongTong+rows[team].baoHanhTong}));
  }
  global.KhsxCapacityCore=Object.freeze({vietnamToday,weekRange,teamReport,dayKey});
})(typeof window==='undefined'?globalThis:window);
