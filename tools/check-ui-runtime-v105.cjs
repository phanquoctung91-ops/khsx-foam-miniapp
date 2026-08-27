const {chromium}=require('playwright');

(async()=>{
  const url=process.argv[2];
  if(!url) throw new Error('Usage: node tools/check-ui-runtime-v105.cjs <local-url>');
  const browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||undefined});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{
    class TestChart{constructor(){this.data={datasets:[]};this.options={};}destroy(){}resize(){}update(){}}
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
      {user_id:'manager-auth',display_name:'Quản lý hiện tại',role:'quan_ly',active:true},
      {user_id:'employee-auth',display_name:'Nhân viên khác',role:'nhan_vien',active:true}
    ];
    supabaseWorkers=[];
    supabaseAdminTelegramRequests=[{telegram_user_id:'123',telegram_display_name:'Người chờ duyệt'}];
    renderSupabaseTelegramAdmin();
    document.getElementById('staffUsersModal').style.display='block';
    const modal=document.querySelector('#staffUsersModal>div');
    const options=supabaseAdminProfileOptions();
    return {
      modalWidth:modal.getBoundingClientRect().width,
      viewport:window.innerWidth,
      overflow:getComputedStyle(document.querySelector('#telegramAccessRequests .table-scroll')).overflowX,
      currentManagerHidden:!options.includes('Quản lý hiện tại'),
      employeeVisible:options.includes('Nhân viên khác')
    };
  });
  if(approval.modalWidth>approval.viewport||approval.overflow!=='auto'||!approval.currentManagerHidden||!approval.employeeVisible)
    throw new Error(`Manager approval mobile failed: ${JSON.stringify(approval)}`);
  console.log('PASS  mobile approval area and Telegram target filtering');
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

  if(errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
