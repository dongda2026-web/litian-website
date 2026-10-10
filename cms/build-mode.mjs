export function releaseBuildScript(scope){
  if(scope==='published')return 'preflight:aliyun';
  if(scope==='preview')return 'preflight:preview';
  throw new TypeError('Unknown CMS build scope');
}
