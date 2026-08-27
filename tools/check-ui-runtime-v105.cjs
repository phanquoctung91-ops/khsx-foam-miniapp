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
  await page.evaluate(()=>{
    currentUser={code:'ui-test',name:'Nhân viên Tổ 1',role:'nhan_vien',unit:'Tổ 1'};
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
    currentUser={code:'ui-manager',name:'Quản lý',role:'quan_ly',unit:''};
    managerStageTestMode=null;
    applyRoleUI();renderProgress();
  });
  const manager=await page.evaluate(()=>({
    workspace:getComputedStyle(document.getElementById('employeeStageWorkspace')).display,
    table:getComputedStyle(document.getElementById('progressTable')).display,
    testButton:!!document.getElementById('stageTestMenuBtn')
  }));
  if(manager.workspace!=='none'||manager.table==='none'||!manager.testButton)
    throw new Error(`Manager mobile failed: ${JSON.stringify(manager)}`);
  console.log('PASS  manager keeps full dashboard and 3-stage test control');

  await page.locator('#managementToolsBtn').click();
  await page.locator('#stageTestMenuBtn').click();
  const testModal=await page.evaluate(()=>getComputedStyle(document.getElementById('stageTestModal')).display);
  if(testModal==='none') throw new Error('Stage test modal did not open from manager control');
  await page.locator('#testMayWorker').selectOption('loan_anh');
  await page.locator('#stageTestModal [data-test-stage="may"]').click();
  const clickedPreview=await page.evaluate(()=>({
    workspace:getComputedStyle(document.getElementById('employeeStageWorkspace')).display,
    table:getComputedStyle(document.getElementById('progressTable')).display,
    stage:document.body.className
  }));
  if(clickedPreview.workspace==='none'||clickedPreview.table!=='none'||!clickedPreview.stage.includes('stage-view-may'))
    throw new Error(`Stage test button flow failed: ${JSON.stringify(clickedPreview)}`);
  console.log('PASS  manager stage test button opens May workspace');
  await page.locator('#exitStagePreviewBtn').click();

  await page.evaluate(()=>{
    managerStageTestMode={stage:'may',workerId:'loan_anh',workerName:'Loan Anh'};
    applyRoleUI(); renderProgress();
  });
  const stagePreview=await page.evaluate(()=>({
    workspace:getComputedStyle(document.getElementById('employeeStageWorkspace')).display,
    table:getComputedStyle(document.getElementById('progressTable')).display,
    stage:document.body.className
  }));
  if(stagePreview.workspace==='none'||stagePreview.table!=='none'||!stagePreview.stage.includes('stage-view-may'))
    throw new Error(`Manager stage preview failed: ${JSON.stringify(stagePreview)}`);
  console.log('PASS  manager can preview stage UI on mobile');
  await page.evaluate(()=>{managerStageTestMode=null;applyRoleUI();renderProgress();});

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
