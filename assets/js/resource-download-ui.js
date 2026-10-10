var activeResourceDownload=null;
var resourceDownloadCopy={
  en:{checking:'Checking file…',started:'File verified. Download started.',failed:'Download unavailable. Please retry.',stale:'File changed. Reload this page.',timeout:'Request timed out. Please retry.'},
  zh:{checking:'正在校验文件…',started:'文件校验通过，已发起下载。',failed:'暂时无法下载，请重试。',stale:'文件已更新，请刷新页面。',timeout:'请求超时，请重试。'},
  ru:{checking:'Проверка файла…',started:'Файл проверен. Загрузка начата.',failed:'Загрузка недоступна. Повторите попытку.',stale:'Файл изменён. Обновите страницу.',timeout:'Время ожидания истекло. Повторите попытку.'}
};
function cancelResourceDownloads() {
  var operation=activeResourceDownload;
  if(!operation)return;
  activeResourceDownload=null;operation.controller.abort();clearTimeout(operation.timer);
  operation.link.removeAttribute('aria-busy');operation.status.textContent='';
}
async function startResourceDownload(link) {
  if(activeResourceDownload?.link===link)return;
  cancelResourceDownloads();
  var status=link.closest('.resource-download')?.querySelector('.resource-download-status');
  if(!status)return;
  var language=link.dataset.resourceLanguage,copy=resourceDownloadCopy[language]||resourceDownloadCopy.en;
  var file=typeof resourceDelivery==='object'&&resourceDelivery?.resolve(link.dataset.resourceDownload,language);
  status.removeAttribute('data-error');
  if(!file||link.getAttribute('href')!==file.path){status.textContent=copy.stale;status.setAttribute('data-error','');return;}
  var operation={link:link,status:status,controller:new AbortController(),timedOut:false};
  activeResourceDownload=operation;link.setAttribute('aria-busy','true');status.textContent=copy.checking;
  operation.timer=setTimeout(function(){operation.timedOut=true;operation.controller.abort();},30000);
  try {
    var bytes=await DongDaResourceDelivery.verifiedBytes(file,resourceRegistry,{origin:location.origin,fetch:window.fetch.bind(window),signal:operation.controller.signal});
    if(activeResourceDownload!==operation||!link.isConnected||operation.controller.signal.aborted)return;
    var blob=new Blob([bytes],{type:file.mediaType}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=file.legacyPath.split('/').pop();anchor.hidden=true;
    try{document.body.appendChild(anchor);anchor.click();status.textContent=copy.started;}
    finally{anchor.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);}
  } catch(error) {
    if(activeResourceDownload!==operation||!link.isConnected)return;
    status.textContent=operation.timedOut?copy.timeout:['stale','integrity'].includes(error.code)?copy.stale:copy.failed;
    status.setAttribute('data-error','');
  } finally {
    clearTimeout(operation.timer);
    if(!activeResourceDownload||activeResourceDownload===operation||activeResourceDownload.link!==link)link.removeAttribute('aria-busy');
    if(activeResourceDownload===operation)activeResourceDownload=null;
  }
}
document.addEventListener('click',function(event){
  var link=event.target.closest?.('a[data-resource-download]');
  if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();startResourceDownload(link);
});
window.addEventListener('pagehide',cancelResourceDownloads);
