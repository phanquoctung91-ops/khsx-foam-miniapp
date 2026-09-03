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
    overflow:document.documentElement.scrollWidth-window.innerWidth,
    progressPanel:document.getElementById('panel-progress').classList.contains('active')
  }));
  if(employee.workspace==='none'||employee.cards!==1||employee.inputs!==1||employee.table!=='none'||employee.overflow>2||!employee.progressPanel)
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

  const managerPreview=await page.evaluate(()=>{
    managerStagePreview={stage:'dan',unit:'Tổ 1'};
    applyRoleUI();renderProgress();
    // Mô phỏng lượt đồng bộ phiên gọi lại applyRoleUI.
    applyRoleUI();renderProgress();
    const state={
      role:currentUser.role,
      preview:managerStagePreview?.stage,
      workspace:getComputedStyle(document.getElementById('employeeStageWorkspace')).display,
      progressPanel:document.getElementById('panel-progress').classList.contains('active'),
      exit:getComputedStyle(document.getElementById('exitManagerStageBtn')).display,
      input:document.querySelectorAll('#employeeOrderList .stage-qty-input').length
    };
    managerStagePreview=null;applyRoleUI();renderProgress();
    state.closed=getComputedStyle(document.getElementById('employeeStageWorkspace')).display==='none'&&getComputedStyle(document.getElementById('exitManagerStageBtn')).display==='none';
    return state;
  });
  if(managerPreview.role!=='quan_ly'||managerPreview.preview!=='dan'||managerPreview.workspace==='none'||!managerPreview.progressPanel||managerPreview.exit==='none'||managerPreview.input!==1||!managerPreview.closed)
    throw new Error(`Manager stage preview stability failed: ${JSON.stringify(managerPreview)}`);
  console.log('PASS  manager stage preview survives session refresh and exits cleanly');

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
    overflow:document.documentElement.scrollWidth-window.innerWidth,
    tableWidth:document.getElementById('progressTable').getBoundingClientRect().width,
    scrollClient:document.getElementById('progressTable').closest('.table-scroll').clientWidth,
    scrollWidth:document.getElementById('progressTable').closest('.table-scroll').scrollWidth,
    statusLeft:document.querySelector('#progressTable tbody .col-status')?.getBoundingClientRect().left||0,
    actionRight:document.querySelector('#progressTable tbody .col-action')?.getBoundingClientRect().right||0
  }));
  if(desktop.workspace!=='none'||desktop.table==='none'||desktop.overflow>2||desktop.tableWidth<1479||desktop.scrollWidth<desktop.scrollClient||desktop.statusLeft<desktop.actionRight-1)
    throw new Error(`Manager desktop failed: ${JSON.stringify(desktop)}`);
  console.log('PASS  manager desktop layout with non-overlapping scroll table');

  const overtime=await page.evaluate(()=>{
    progressDaySelect.value='27/08/2026';
    document.getElementById('overtimeBtn').click();
    const check=[...document.querySelectorAll('#overtimeWorkers input[type="checkbox"]')].find(x=>x.value==='employee-auth');
    if(check)check.checked=true;
    return {open:document.getElementById('overtimePanel').classList.contains('is-open'),label:check?.closest('label')?.textContent||'',checked:!!check?.checked,stageSelect:!!document.getElementById('overtimeStage')};
  });
  if(!overtime.open||!overtime.checked||!overtime.label.includes('Tổ 1')||!overtime.label.includes('Dán')||overtime.stageSelect)
    throw new Error(`Overtime simple flow failed: ${JSON.stringify(overtime)}`);
  console.log('PASS  OT uses employee ticks and derives team/stage from account');

  const liveWarranty=await page.evaluate(async()=>{
    await fetchBaoHanh({force:true,silent:true});
    return {
      d27:Number(baoHanhTheoNgay['27/08/2026']?.tong)||0,
      d28:Number(baoHanhTheoNgay['28/08/2026']?.tong)||0,
      aug:Object.entries(baoHanhTheoNgay).filter(([day])=>day.endsWith('/08/2026')).reduce((sum,[,value])=>sum+(Number(value?.tong)||0),0)
    };
  });
  if(liveWarranty.d27!==29||liveWarranty.d28!==23||liveWarranty.aug!==122)
    throw new Error(`Live warranty refresh failed: ${JSON.stringify(liveWarranty)}`);
  console.log('PASS  warranty loads 27-28/08 and August total 122');

  const monthScope=await page.evaluate(()=>{
    supabaseOrdersLoaded=false;
    sheetRows=[
      {id:'aug-order',date:'29/08/2026',ma:'AUG',dong:'Sora',ngang:'160',dai:'200',day:'10',so_luong:15},
      {id:'sep-order',date:'03/09/2026',ma:'SEP',dong:'Premium',ngang:'160',dai:'200',day:'10',so_luong:15}
    ];
    dynamicOrders=[];
    assignments={
      'aug-order':{to:'Tổ 1',stage_by_date:{},support_by_date:{}},
      'sep-order':{to:'Tổ 2',stage_by_date:{},support_by_date:{}}
    };
    rebuildOrderEntityStore();
    monthFilterSelect.innerHTML='<option value="8">8</option><option value="9">9</option>';
    yearFilterSelect.innerHTML='<option value="2026">2026</option>';
    const read=()=>({
      khsxDays:[...document.querySelectorAll('#autoPlanDaySelect option')].map(x=>x.value).filter(x=>x!=='all'),
      tdsxDays:[...document.querySelectorAll('#progressDaySelect option')].map(x=>x.value).filter(x=>x!=='all'),
      khsxRows:[...document.querySelectorAll('#autoPlanTable tbody tr')].map(x=>x.textContent),
      tdsxRows:[...document.querySelectorAll('#progressTable tbody tr')].map(x=>x.textContent)
    });
    monthFilterSelect.value='8';onHeaderMonthYearChanged();const aug=read();aug.khsxSelected=autoPlanDaySelect.value;aug.tdsxSelected=progressDaySelect.value;
    monthFilterSelect.value='9';onHeaderMonthYearChanged();const sep=read();sep.khsxSelected=autoPlanDaySelect.value;sep.tdsxSelected=progressDaySelect.value;
    return {aug,sep};
  });
  const onlyMonth=(values,month)=>values.length>0&&values.every(x=>x.includes(`/${month}/2026`));
  if(!onlyMonth(monthScope.aug.khsxDays,'08')||!onlyMonth(monthScope.aug.tdsxDays,'08')||monthScope.aug.khsxRows.some(x=>x.includes('SEP'))||monthScope.aug.tdsxRows.some(x=>x.includes('SEP'))||monthScope.aug.khsxSelected!=='31/08/2026'||monthScope.aug.tdsxSelected!=='31/08/2026'||!onlyMonth(monthScope.sep.khsxDays,'09')||!onlyMonth(monthScope.sep.tdsxDays,'09')||monthScope.sep.khsxRows.some(x=>x.includes('AUG'))||monthScope.sep.tdsxRows.some(x=>x.includes('AUG'))||monthScope.sep.khsxSelected!=='03/09/2026'||monthScope.sep.tdsxSelected!=='03/09/2026')
    throw new Error(`Header month scope failed: ${JSON.stringify(monthScope)}`);
  console.log('PASS  header month keeps KHSX and TDSX dates isolated');

  const operationalUi=await page.evaluate(()=>{
    currentUser={code:'ui-manager',name:'Quản lý',role:'quan_ly',unit:'',auth_user_id:'manager-auth'};
    sheetRows=[
      {id:'normal-order',date:'03/09/2026',ma:'NORMAL',dong:'Sora',ngang:'160',dai:'200',day:'10',so_luong:15},
      {id:'priority-order',date:'03/09/2026',ma:'PRIORITY',dong:'Premium',ngang:'160',dai:'200',day:'10',so_luong:15}
    ];
    dynamicOrders=[];
    assignments={
      'normal-order':{to:'Tổ 1',stage_by_date:{},support_by_date:{},priority:false},
      'priority-order':{to:'Tổ 1',stage_by_date:{},support_by_date:{},priority:true}
    };
    supabaseOrdersLoaded=false;rebuildOrderEntityStore();
    monthFilterSelect.value='9';renderAutoPlanDaySelect();autoPlanDaySelect.value='03/09/2026';renderAutoPlan();
    progressDaySelect.value='03/09/2026';renderProgress();
    managerStagePreview={stage:'dan',unit:'Tổ 1'};applyRoleUI();renderProgress();
    const first=document.querySelector('#employeeOrderList .employee-order-card');
    const result={
      first:first?.dataset.orderId,
      priority:first?.classList.contains('is-priority'),
      flag:first?.querySelector('.employee-priority-flag')?.textContent,
      deleteText:document.querySelector('#autoPlanTable .trash-btn')?.textContent,
      quickText:document.querySelector('#progressTable .complete-row-btn')?.textContent,
      status:tenTrangThaiDon('dang_san_xuat')
    };
    managerStagePreview=null;applyRoleUI();
    return result;
  });
  if(operationalUi.first!=='priority-order'||!operationalUi.priority||operationalUi.flag!=='ƯU TIÊN GẤP'||operationalUi.deleteText!=='Xóa'||operationalUi.quickText!=='Xong'||operationalUi.status!=='Đang sản xuất')
    throw new Error(`Operational UI regression failed: ${JSON.stringify(operationalUi)}`);
  console.log('PASS  priority, delete, quick-complete and Vietnamese status UI');

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
      b:{date:'02/08/2026',rows:[{ten_hang:'Sora',ke_hoach:0,dong_goi:12,_from_foam:true,_order_id:'o1',_root_id:'o1',_root_qty:10}]},
      c:{date:'03/08/2026',rows:[
        {ten_hang:'Classic',ke_hoach:72,dong_goi:0,_from_foam:true,_order_id:'legacy-missing',_root_id:'legacy-missing',_root_qty:72},
        {ten_hang:'Classic',ke_hoach:72,dong_goi:72}
      ]}
    });
    const k=tongKpiTuRowsTheoKeys(['a','b']);
    const legacyFallback=tongKpiTuRowsTheoKeys(['c']);
    applyDarkMode(true);
    document.getElementById('managerStageModal').style.display='block';
    return {deletedHidden:!orders.some(o=>o.id==='deleted-order'),warrantyRows:orders.filter(o=>o.id==='bh_22').length,k,legacyFallback,dark:document.body.classList.contains('dark-mode'),stageModal:getComputedStyle(document.getElementById('managerStageModal')).display};
  });
  if(!regressions.deletedHidden||regressions.warrantyRows!==1||regressions.k.plan!==10||regressions.k.done!==10||regressions.k.throughput!==12||regressions.k.warranty!==2||regressions.legacyFallback.throughput!==72||!regressions.dark||regressions.stageModal==='none')
    throw new Error(`Release regressions failed: ${JSON.stringify(regressions)}`);
  console.log('PASS  tombstone, warranty dedupe, KPI cap, dark mode and manager stage modal');

  if(errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
