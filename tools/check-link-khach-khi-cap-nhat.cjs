// Link khách tự tải lại lên bản mới phải giữ view=guest (lỗi 25/09/2026: khách bị đá về màn đăng nhập).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const i=html.indexOf('function getCanonicalDashboardUrl(');
let sau=0,j=html.indexOf('{',i),k=j; for(;k<html.length;k++){ if(html[k]==='{')sau++; else if(html[k]==='}'){ sau--; if(!sau) break; } }
const chay=(href,khach)=>{ const ctx={URL,location:{href},SUPABASE_VARIANT:true,PUBLIC_VIEW_MODE:khach}; vm.createContext(ctx); vm.runInContext(html.slice(i,k+1),ctx); return ctx.getCanonicalDashboardUrl().href; };
const khach=chay('https://phanquoctung91-ops.github.io/khsx-foam-miniapp/index.html?view=guest&cb=1',true);
assert.match(khach,/[?&]view=guest/,'Tải lại bản mới làm mất view=guest — khách bị đá ra');
assert.doesNotMatch(chay('https://phanquoctung91-ops.github.io/khsx-foam-miniapp/index.html?source=supabase',false),/view=guest/,'Tài khoản thường bị biến thành link khách');
console.log('PASS  tự cập nhật giữ nguyên link khách, không ảnh hưởng tài khoản thường');
