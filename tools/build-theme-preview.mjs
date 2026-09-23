// Dung ban xem thu bang mau MOI tu chinh index.html dang chay - KHONG sua index.html.
// Ket qua: index_theme-preview.html (khong commit), mo bang dev server de xem that.
//   node tools/build-theme-preview.mjs
// Bam nut "Sang / Toi" goc phai tren de doi bang mau.
import fs from 'node:fs';

const src = new URL('../index.html', import.meta.url);
const out = new URL('../index_theme-preview.html', import.meta.url);
let html = fs.readFileSync(src, 'utf8');

const SANG = `
    --bg:#f2f6fb; --card:#ffffff; --border:#dbe4f0; --text:#16233f; --text2:#5d6b85;
    --sidebar-bg:#eaf0f9;
    --primary:#203a76; --primary-l:#e8eefb; --primary-dark:#16294f;
    --brand-light:#2b8ab0; --brand-light-l:#e3f4fb;
    --success:#1f8a5b; --success-l:#e4f4ec;
    --warning:#b5791a; --warning-l:#fbf0dc;
    --danger:#c43d3d; --danger-l:#fbe8e8;
    --accent:#2b8ab0; --accent-l:#e3f4fb;
    --shadow:0 1px 2px rgba(32,58,118,.05), 0 6px 18px rgba(32,58,118,.06);`;

const goc = html.match(/ {2}:root\{\n([\s\S]*?)\n {2}\}/);
if (!goc) throw new Error('Không tìm thấy khối :root trong index.html');
const TOI = goc[1];

html = html.replace(goc[0], `  :root{${SANG}\n  }\n  :root[data-theme="dark"]{\n${TOI}\n  }`);
html = html.replace('<body class="dark-mode">', '<body>');
html = html.replace(
  "document.body.classList.add('dark-mode');",
  "if(document.documentElement.getAttribute('data-theme')==='dark') document.body.classList.add('dark-mode');"
);

// Nut doi bang mau - chi co trong ban xem thu.
html = html.replace('</body>', `<button id="xemThuDoiMau" type="button" style="position:fixed;right:14px;bottom:14px;z-index:99999;border-radius:999px;padding:10px 18px;font:600 13px system-ui;cursor:pointer;border:1px solid var(--border);background:var(--card);color:var(--text);box-shadow:0 6px 20px rgba(0,0,0,.2);">Xem nền tối</button>
<script>
document.getElementById('xemThuDoiMau').addEventListener('click',function(){
  var toi=document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme',toi?'light':'dark');
  document.body.classList.toggle('dark-mode',!toi);
  this.textContent=toi?'Xem nền tối':'Xem nền sáng';
});
</script>
</body>`);

fs.writeFileSync(out, html);
console.log('Đã dựng index_theme-preview.html');
