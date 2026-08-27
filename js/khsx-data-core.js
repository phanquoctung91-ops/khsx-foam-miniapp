(function(global){
  const RETRYABLE=new Set(['network','timeout','PGRST000','PGRST001','PGRST002','57014','55P03']);
  function clampQuantity(value,plan){
    const n=Number(value),cap=Math.max(0,Number(plan)||0);
    return Number.isInteger(n)&&n>=0?Math.min(n,cap):0;
  }
  function classifyWriteError(error){
    const code=String(error?.code||'');
    const message=String(error?.message||'');
    const network=!code&&/fetch|network|offline|timeout/i.test(message);
    return {retryable:network||RETRYABLE.has(code),code:code||'UNKNOWN',message};
  }
  function createEntityStore(key='id'){
    let entities=new Map(),version=0;
    return Object.freeze({
      replace(rows){entities=new Map((rows||[]).map(row=>[row[key],row]));version+=1;return version;},
      patch(row){if(!row||row[key]==null)return version;entities.set(row[key],{...(entities.get(row[key])||{}),...row});version+=1;return version;},
      remove(id){if(entities.delete(id))version+=1;return version;},
      get(id){return entities.get(id)||null;},
      values(){return [...entities.values()];},
      get version(){return version;},
      get size(){return entities.size;}
    });
  }
  function debounce(fn,wait=180){
    let timer=null;
    return (...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),wait);};
  }
  function retryDelay(attempt,base=700,cap=15000){
    const exp=Math.min(cap,base*(2**Math.max(0,attempt-1)));
    return Math.round(exp*(0.85+Math.random()*0.3));
  }
  global.KhsxDataCore=Object.freeze({clampQuantity,classifyWriteError,createEntityStore,debounce,retryDelay});
})(window);
