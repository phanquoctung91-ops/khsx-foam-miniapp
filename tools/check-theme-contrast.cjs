// Bat chu bi chim khi doi nen sang / nen toi.
// 1. Moi bien mau o ban sang deu phai co ban toi tuong ung.
// 2. Cac cap chu tren nen phai du tuong phan (WCAG AA: 4.5 cho chu thuong).
// 3. Khong con luat nao viet cung mau nen TOI o ban goc (ban goc = nen sang).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const style=html.slice(html.indexOf('<style'),html.indexOf('</style>'));

function docBien(khoi){
  const m=style.match(new RegExp(khoi.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([\\s\\S]*?)\\n  \\}'));
  assert.ok(m,'Không tìm thấy khối '+khoi);
  const bien={};
  for(const d of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) bien[d[1]]=d[2].trim();
  return bien;
}
const sang=docBien('  :root'), toi=docBien('  :root[data-theme="dark"]');

// --- 1. du cap ---
const thieu=Object.keys(sang).filter(k=>!(k in toi));
assert.equal(thieu.length,0,'Biến chỉ có ở bản sáng, đổi nền tối sẽ dùng nhầm màu sáng: '+thieu.join(', '));
assert.equal(Object.keys(toi).filter(k=>!(k in sang)).length,0,'Biến chỉ có ở bản tối');
console.log('PASS  '+Object.keys(sang).length+' biến màu đều có đủ hai bản sáng/tối');

// --- 2. tuong phan ---
const rgb=hx=>{hx=hx.replace('#','');if(hx.length===3)hx=[...hx].map(c=>c+c).join('');
  return [0,2,4].map(i=>parseInt(hx.slice(i,i+2),16)/255);};
const kenh=c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);
const sang_=hx=>{const[r,g,b]=rgb(hx).map(kenh);return .2126*r+.7152*g+.0722*b;};
const tuongPhan=(a,b)=>{const x=sang_(a),y=sang_(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};

const CAP=[['--text','--bg'],['--text','--card'],['--text2','--card'],['--text2','--bg'],
           ['--primary','--card'],['--accent','--card'],
           ['--success','--success-l'],['--warning','--warning-l'],['--danger','--danger-l']];
for(const [ten,bang] of [['sáng',sang],['tối',toi]]){
  for(const [chu,nen] of CAP){
    const ty=tuongPhan(bang[chu],bang[nen]);
    assert.ok(ty>=4.5,`Nền ${ten}: ${chu} (${bang[chu]}) trên ${nen} (${bang[nen]}) chỉ đạt ${ty.toFixed(2)}:1, dưới mức đọc được 4.5:1`);
  }
  console.log(`PASS  nền ${ten}: ${CAP.length} cặp chữ/nền đều đọc được (>= 4.5:1)`);
}

// --- 3. khong con nen toi viet cung o ban goc ---
const doSang=hx=>{hx=hx.replace('#','');if(hx.length===3)hx=[...hx].map(c=>c+c).join('');
  if(hx.length<6)return 1;return [0,2,4].map(i=>parseInt(hx.slice(i,i+2),16)/255).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);};
const sot=[];
for(const m of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  const sel=m[1].trim().replace(/\s+/g,' ');
  if(sel.includes('dark-mode')||sel.includes(':root')) continue;
  for(const d of m[2].matchAll(/background[^;:]*:\s*([^;]*)/g))
    for(const c of d[1].match(/#[0-9a-fA-F]{3,6}\b/g)||[])
      if(doSang(c)<0.32) sot.push(`${c} ở ${sel.slice(0,50)}`);
}
assert.equal(sot.length,0,'Còn nền tối viết cứng ở bản gốc (bản gốc phải là nền sáng):\n  '+sot.join('\n  '));
console.log('PASS  không còn nền tối viết cứng ở bản gốc');

// --- 4. nut doi nen ton tai va nho lua chon ---
assert.ok(/id="themeBtn"/.test(html),'Thiếu nút đổi nền');
assert.ok(/khsx_nen_giao_dien/.test(html),'Không nhớ lựa chọn nền theo máy');
assert.ok(!/<body class="dark-mode">/.test(html),'Vẫn còn khoá cứng nền tối ở thẻ body');
console.log('PASS  có nút đổi nền, nhớ theo máy, không còn khoá cứng nền tối');
