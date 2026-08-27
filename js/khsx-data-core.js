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
  global.KhsxDataCore=Object.freeze({clampQuantity,classifyWriteError});
})(window);
