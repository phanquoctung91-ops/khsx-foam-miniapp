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

// Người đã bị rơi view=guest (tab cũ ?source=supabase&v=205) mở lại ngoài Telegram: phải tự vào link khách,
// không phải gửi lại link. Trong Telegram hoặc đã có phiên thì giữ nguyên.
{
  const a=html.indexOf('function nenChuyenSangLinkKhach('),b=html.indexOf('\n}',a)+2;
  const xet=(o)=>{ const ctx={PUBLIC_VIEW_MODE:false,LOCAL_PREVIEW_MODE:false,TELEGRAM_WEBAPP:{initData:''},...o}; vm.createContext(ctx); vm.runInContext(html.slice(a,b),ctx); return ctx.nenChuyenSangLinkKhach(o.coPhien||false); };
  assert.equal(xet({}),true,'Mở ngoài Telegram chưa đăng nhập vẫn kẹt ở màn đăng nhập');
  assert.equal(xet({TELEGRAM_WEBAPP:null}),true,'Không có thư viện Telegram vẫn kẹt ở màn đăng nhập');
  assert.equal(xet({TELEGRAM_WEBAPP:{initData:'query_id=1'}}),false,'Nhân viên trong Telegram bị đẩy sang link khách');
  assert.equal(xet({coPhien:true}),false,'Người đã đăng nhập bị đẩy sang link khách');
  assert.equal(xet({PUBLIC_VIEW_MODE:true}),false,'Link khách tự chuyển vòng lặp');
  assert.equal(xet({LOCAL_PREVIEW_MODE:true}),false,'Bản xem thử local bị chuyển trang');
  assert.ok(html.includes("if(nenChuyenSangLinkKhach(!!session)){ location.replace(getCustomerViewUrl()); return; }"),'Chưa gọi chuyển trang ở bootstrap');
  console.log('PASS  tab cũ bị rơi view=guest mở ngoài Telegram tự vào link khách; Telegram / đã đăng nhập giữ nguyên');
}
