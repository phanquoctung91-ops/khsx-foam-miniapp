// Two tabs of the same account+device share one localStorage key. A plain overwrite
// (old saveQueue) can silently drop whatever the OTHER tab just wrote. saveQueueMerged
// must keep both tabs' independent additions, while still letting a genuine deletion
// (an item that settled and was removed on purpose) actually stick.
const assert=require('node:assert/strict');
const S=require('../hotfix-sync.js');

function fakeStorage(){
  const data={};
  return {getItem:k=>Object.prototype.hasOwnProperty.call(data,k)?data[k]:null,
    setItem:(k,v)=>{data[k]=v;},raw:data};
}

(()=>{
  const storage=fakeStorage(),key='stage:account:A:device:D';
  const ctx={accountId:'A',deviceId:'D'};

  // Both tabs open around the same time and load the SAME empty snapshot before either
  // has written anything — this is the realistic race (two tabs of one browser opened
  // close together), not one tab loading after the other has already written.
  const tab1Baseline=S.loadQueue(storage,key).queue; // {}
  const tab2Baseline=S.loadQueue(storage,key).queue; // {} — tab 2 has no idea tab 1 exists

  // Tab 1's live queue object accumulates item X, then persists.
  const tab1Queue={x:S.bindItem({operation_id:'op-x'},ctx)};
  const r1=S.saveQueueMerged(storage,key,tab1Queue,tab1Baseline);
  assert.equal(r1.ok,true);
  assert.deepEqual(Object.keys(r1.queue),['x']);

  // Tab 2's live queue object (built from ITS OWN stale baseline, unaware of X)
  // accumulates a DIFFERENT item Y, then persists.
  const tab2Queue={y:S.bindItem({operation_id:'op-y'},ctx)};
  const r2=S.saveQueueMerged(storage,key,tab2Queue,tab2Baseline);
  assert.equal(r2.ok,true);
  assert.deepEqual(Object.keys(r2.queue).sort(),['x','y']); // X must survive tab 2's overwrite

  console.log('PASS two tabs adding different items concurrently both survive on disk');
})();

(()=>{
  // Now the deletion case: tab 1 never learned about an item (never in its baseline),
  // so a disk-only key must be preserved. But once a tab HAS seen a key and it later
  // vanishes from its own queue (settled + removed), that deletion must stick even if
  // stale disk bytes still contain the old copy.
  const storage=fakeStorage(),key='stage:account:A:device:D';
  const ctx={accountId:'A',deviceId:'D'};
  storage.setItem(key,JSON.stringify({x:S.bindItem({operation_id:'op-x'},ctx)}));
  const baseline=S.loadQueue(storage,key).queue; // tab has now SEEN x
  const afterSettle={}; // x confirmed by server and removed locally
  const r=S.saveQueueMerged(storage,key,afterSettle,baseline);
  assert.deepEqual(Object.keys(r.queue),[]); // must not resurrect an item we knowingly deleted
  console.log('PASS a deliberate deletion of a previously-known item is respected, not resurrected');
})();

(()=>{
  // mergeQueues: used for the live cross-tab 'storage' event handler — union of keys,
  // keep whichever copy of a shared key looks more advanced (more attempts/more recent).
  const ctx={accountId:'A',deviceId:'D'};
  const older=S.bindItem({operation_id:'op-x',attempts:1},ctx);
  const newer=S.bindItem({operation_id:'op-x',attempts:3,last_attempt_at:999},ctx);
  const merged=S.mergeQueues({x:older,y:S.bindItem({operation_id:'op-y'},ctx)},{x:newer});
  assert.equal(merged.x.attempts,3);
  assert(merged.y);
  console.log('PASS mergeQueues keeps the more advanced copy of a shared key and never drops an unrelated key');
})();
