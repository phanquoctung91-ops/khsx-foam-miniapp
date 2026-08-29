const {chromium}=require('playwright');

(async()=>{
  const url=process.argv[2];
  if(!url) throw new Error('Usage: node tools/check-ui-runtime-v105.cjs <local-url>');
  const browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||undefined});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{
    class TestChart{constructor(el,config={}){this.el=el;this.type=config.type;this.data=config.data||{datasets:[]};this.options=config.options||{};}destroy(){}resize(){}update(){}}
    TestChart.register=()=>{};
    window.Chart=TestChart;
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  try{
    await page.waitForFunction(()=>window.__khsxBootstrapDone===true,{timeout:15000});
  }catch(e){
    const state=await page.evaluate(()=>({ready:document.readyState,bootstrap:typeof bootstrap,render:typeof renderProgress,done:window.__khsxBootstrapDone||false}));
    await browser.close();
    throw new Error(`Bootstrap timeout: ${JSON.stringify(state)}; page errors: ${errors.join(' | ')}`);
  }
  const telegramRegistration=await page.evaluate(()=>({
    exists:!!document.getElementById('telegramRegisterBtn'),
    display:getComputedStyle(document.getElementById('telegramRegisterBtn')).display,
    status:!!document.getElementById('telegramRegisterStatus')
  }));
  if(!telegramRegistration.exists||telegramRegistration.display==='none'||!telegramRegistration.status)
    throw new Error(`Telegram registration UI failed: ${JSON.stringify(telegramRegistration)}`);
  console.log('PASS  Telegram ID registration control is available');
  await page.evaluate(()=>{
    currentUser={code:'ui-test',name:'Nhân viên Tổ 1',role:'nhan_vien',unit:'Tổ 1'};
    document.getElementById('loginOverlay').style.display='none';
    sheetRows=[{id:'ui_order_1',date:'27/08/2026',ma:'SORA15-6',dong:'Sora',ngang:'160',dai:'200',day:'15',so_luong:9,ghi_chu:'Ưu tiên kiểm tra'}];
    dynamicOrders=[];
    assignments={ui_order_1:{to:'Tổ 1',to_goc:'Tổ 1',stage_by_date:{},support_by_date:{}}};
    autoPlanLoaded=true;
    rebuildOrderEntityStore();
    applyRoleUI();
    populateProgressSelects();
    progressDaySelect.value='27/08/2026';
    renderProgress();
  });
  const employee=await page.evaluate(()=>({
    workspace:getComputedStyle(document.getElementById('employeeStageWorkspace')).display,
    cards:document.querySelectorAll('#employeeOrderList .employee-order-card').length,
    inputs:document.querySelectorAll('#employeeOrderList .stage-qty-input').length,
    table:getComputedStyle(document.getElementById('progressTable')).display,
    overflow:document.documentElement.scrollWidth-window.innerWidth
  }));
  if(employee.workspace==='none'||employee.cards!==1||employee.inputs!==1||employee.table!=='none'||employee.overflow>2)
    throw new Error(`Employee mobile failed: ${JSON.stringify(employee)}`);
  console.log('PASS  employee mobile one-screen workspace');
  if(process.env.KHSX_EMPLOYEE_SCREENSHOT) await page.screenshot({path:process.env.KHSX_EMPLOYEE_SCREENSHOT,fullPage:true});

  await page.evaluate(()=>{
    currentUser={code:'ui-manager',name:'Quản lý',role:'quan_ly',unit:'',auth_user_id:'manager-auth'};
    assignments.ui_order_1.stage_by_date={'27/08/2026':{dan:0}};
    applyRoleUI();renderProgress();
  });
  const manager=await page.evaluate(()=>({
    workspace:getComputedStyle(document.getElementById('employeeStageWorkspace')).display,
    table:getComputedStyle(document.getElementById('progressTable')).display,
    hasTestButton:!!document.getElementById('stageTestMenuBtn') || !!document.getElementById('stageTestBtn'),
    supportAfterZero:document.querySelectorAll('.support-day-select[data-order-id="ui_order_1"]').length
  }));
  if(manager.workspace!=='none'||manager.table==='none'||manager.hasTestButton||manager.supportAfterZero!==1)
    throw new Error(`Manager mobile failed: ${JSON.stringify(manager)}`);
  console.log('PASS  manager mobile + Dán 0 support assignment');

  const approval=await page.evaluate(()=>{
    supabaseAdminProfiles=[
      {user_id:'manager-auth',telegram_user_id:'111',display_name:'Quản lý hiện tại',role:'quan_ly',active:true},
      {user_id:'employee-auth',telegram_user_id:'999',display_name:'Nhân viên đã duyệt',role:'nhan_vien',unit_name:'To 1',active:true}
    ];
    supabaseAdminTelegramRequests=[{telegram_user_id:'12345',registered_at:new Date().toISOString(),last_seen_at:new Date().toISOString()}];
    renderSupabaseTelegramAdmin();renderStaffUsersList();
    document.getElementById('staffUsersModal').style.display='block';
    const modal=document.querySelector('#staffUsersModal>div');
    const name=document.querySelector('.telegram-request-name'),role=document.querySelector('.telegram-request-role'),unit=document.querySelector('.telegram-request-unit');
    const disabledInitially=unit.disabled;
    role.value='quan_ly_2';role.dispatchEvent(new Event('change',{bubbles:true}));
    const disabledManager2=unit.disabled;
    role.value='nhan_vien';role.dispatchEvent(new Event('change',{bubbles:true}));
    return {
      modalWidth:modal.getBoundingClientRect().width,
      viewport:window.innerWidth,
      overflow:getComputedStyle(document.querySelector('#telegramAccessRequests .table-scroll')).overflowX,
      hasManagerNameInput:!!name,disabledInitially,disabledManager2,enabledEmployee:!unit.disabled,
      approvedName:document.querySelector('.telegram-account-name')?.value||'',
      approvedText:document.getElementById('staffUsersList').innerText,
      noUuid:!document.getElementById('staffUsersList').innerText.includes('employee-auth')
    };
  });
  if(approval.modalWidth>approval.viewport||approval.overflow!=='auto'||!approval.hasManagerNameInput||!approval.disabledInitially||!approval.disabledManager2||!approval.enabledEmployee||approval.approvedName!=='Nhân viên đã duyệt'||!approval.noUuid)
    throw new Error(`Manager approval mobile failed: ${JSON.stringify(approval)}`);
  console.log('PASS  approval roles, approved-only list and hidden UUID');
  await page.evaluate(()=>document.getElementById('staffUsersModal').style.display='none');

  const ring=page.locator('#progressTeamRings .team-ring-clickable').first();
  if(await ring.count()===0) throw new Error('No clickable team order for stage-choice test');
  await ring.click();
  const choiceModal=await page.evaluate(()=>getComputedStyle(document.getElementById('stageChoiceModal')).display);
  if(choiceModal==='none') throw new Error('Manager team order did not open stage-choice modal');
  console.log('PASS  manager team order opens stage-choice modal');
  await page.locator('#closeStageChoiceBtn').click();

  await page.setViewportSize({width:1280,height:720});
  await page.evaluate(()=>renderProgress());
  const desktop=await page.evaluate(()=>({
    workspace:getComputedStyle(document.getElementById('employeeStageWorkspace')).display,
    table:getComputedStyle(document.getElementById('progressTable')).display,
    overflow:document.documentElement.scrollWidth-window.innerWidth
  }));
  if(desktop.workspace!=='none'||desktop.table==='none'||desktop.overflow>2)
    throw new Error(`Manager desktop failed: ${JSON.stringify(desktop)}`);
  console.log('PASS  manager desktop layout');

  const regressions=await page.evaluate(()=>{
    currentUser={code:'ui-manager',name:'Quản lý',role:'quan_ly',unit:'',auth_user_id:'manager-auth'};
    supabaseActiveOrderIds=new Set(['bh_22']);
    supabaseOrdersLoaded=true;
    sheetRows=[{id:'deleted-order',date:'25/08/2026',ma:'CLS',dong:'Classic',ngang:'220',dai:'200',day:'15',so_luong:5}];
    dynamicOrders=[{id:'bh_22',date:'22/08/2026',dong:'Bảo hành',so_luong:7,is_warranty:true,bh_theo_to:{'Tổ 2':7},bh_chi_tiet:[{to:'Tổ 2',so_luong:7}]}];
    baoHanhTheoNgay={'22/08/2026':{tong:7,theo_to:{'Tổ 2':7},chi_tiet:[{to:'Tổ 2',so_luong:7}]}};
    const orders=getOrders();
    Object.keys(allDays).forEach(k=>delete allDays[k]);
    Object.assign(allDays,{
      a:{date:'01/08/2026',rows:[
        {ten_hang:'Sora',ke_hoach:10,dong_goi:0,_from_foam:true,_order_id:'o1',_root_id:'o1',_root_qty:10},
        {ten_hang:'Sora',ke_hoach:999,dong_goi:999},
        {ten_hang:'Bảo hành',dong_goi:2,_from_foam:true}
      ]},
      b:{date:'02/08/2026',rows:[{ten_hang:'Sora',ke_hoach:0,dong_goi:12,_from_foam:true,_order_id:'o1',_root_id:'o1',_root_qty:10}]}
    });
    const k=tongKpiTuRowsTheoKeys(['a','b']);
    applyDarkMode(true);
    document.getElementById('managerStageModal').style.display='block';
    return {deletedHidden:!orders.some(o=>o.id==='deleted-order'),warrantyRows:orders.filter(o=>o.id==='bh_22').length,k,dark:document.body.classList.contains('dark-mode'),stageModal:getComputedStyle(document.getElementById('managerStageModal')).display};
  });
  if(!regressions.deletedHidden||regressions.warrantyRows!==1||regressions.k.plan!==10||regressions.k.done!==10||regressions.k.throughput!==12||regressions.k.warranty!==2||!regressions.dark||regressions.stageModal==='none')
    throw new Error(`Release regressions failed: ${JSON.stringify(regressions)}`);
  console.log('PASS  tombstone, warranty dedupe, KPI cap, dark mode and manager stage modal');

  if(errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
