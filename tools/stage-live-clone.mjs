import fs from 'node:fs';
const [file,section,indexRaw]=process.argv.slice(2);
if(!file||!section) throw new Error('Dùng: node stage-live-clone.mjs <payload.json> <section|meta> [index]');
const p=JSON.parse(fs.readFileSync(file,'utf8'));
const size=section==='progress'?180:section==='orders'?100:250;
if(section==='meta'){
  const sections=['workers','orders','orderAssignments','dailyAssignments','progress','stageCredits','dayLocks','planSnapshots','quarterTargets'];
  console.log(JSON.stringify({runId:p.runId,sections:Object.fromEntries(sections.map(k=>[k,{rows:p[k].length,chunks:Math.ceil(p[k].length/(k==='progress'?180:k==='orders'?100:250))}]))}));
  process.exit(0);
}
if(!Array.isArray(p[section])) throw new Error(`Section không tồn tại: ${section}`);
const i=Number(indexRaw); if(!Number.isInteger(i)||i<0) throw new Error('Index không hợp lệ');
const rows=p[section].slice(i*size,(i+1)*size);
const key=`clone_stage_${p.runId}_${section}_${String(i).padStart(3,'0')}`;
const json=JSON.stringify(rows).replaceAll("'","''");
console.log(`insert into public.khsx_app_settings(key,value,updated_by,updated_at) values ('${key}','${json}'::jsonb,null,now()) on conflict (key) do update set value=excluded.value,updated_by=null,updated_at=now();`);
