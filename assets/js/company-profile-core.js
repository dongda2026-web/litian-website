(function(root){
  'use strict';
  var version='2026.10.09-company-profile-v1',id='dongda-profile',languages=['zh','en','ru','kk','ky','tg','tk','uz'],editableLanguages=['zh','en','ru'];
  var keys=['ab_h1','ab_sub','ab_ey','ab_body','ab_cap_e','company_atlas_ey','company_atlas_h','company_atlas_p','journey_ey','journey_h','journey_1_t','journey_1_p','journey_2_t','journey_2_p','journey_3_t','journey_3_p','journey_4_t','journey_4_p','panorama_label','panorama_cap','ab_pl_e'];
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  function exact(value,fields){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).sort().join('|')!==fields.slice().sort().join('|'))throw new TypeError('Invalid company profile fields');}
  function textLimit(field){
    if(/^copy\.(ab_body|company_atlas_p)\./.test(field)||/^pillars\.\d+\.desc\./.test(field))return 1000;
    if(/^copy\.(ab_sub|journey_[1-4]_p)\./.test(field)||field.startsWith('capabilities.'))return 600;
    if(field.startsWith('copy.panorama_cap.'))return 300;
    return 120;
  }
  function text(value,limit){if(typeof value!=='string'||!value.trim()||value.length>limit||/[<>\u0000-\u001f\u007f]/.test(value))throw new TypeError('Invalid company profile text');return value;}
  function localized(value,locales,field){exact(value,locales);return Object.fromEntries(locales.map(function(l){return[l,text(value[l],textLimit(field+'.'+l))];}));}
  function create(input){
    exact(input,['schemaVersion','id','reviewStatus','provenance','copy','capabilities','pillars','protected']);
    if(input.schemaVersion!==version||input.id!==id||input.reviewStatus!=='legacy-pending')throw new TypeError('Invalid company profile identity');
    exact(input.provenance,['source','sourceSha256']);if(input.provenance.source!=='legacy-index-company'||!/^[a-f0-9]{64}$/.test(input.provenance.sourceSha256))throw new TypeError('Invalid company profile provenance');
    exact(input.copy,keys);var copy=Object.fromEntries(keys.map(function(key){return[key,localized(input.copy[key],languages,'copy.'+key)];}));
    if(!Array.isArray(input.capabilities)||input.capabilities.length!==5||!Array.isArray(input.pillars)||input.pillars.length!==4)throw new TypeError('Invalid company profile sections');
    var capabilities=input.capabilities.map(function(row,i){exact(row,['id','marker','text']);if(row.id!=='cap-'+(i+1)||row.marker!==String(i+1).padStart(2,'0'))throw new TypeError('Invalid company capability identity');return{id:row.id,marker:row.marker,text:localized(row.text,editableLanguages,'capabilities.'+i+'.text')};});
    var pillars=input.pillars.map(function(row,i){exact(row,['id','code','tag','title','desc']);if(row.id!=='pillar-'+(i+1))throw new TypeError('Invalid company pillar identity');exact(row.code,editableLanguages);exact(row.tag,editableLanguages);return{id:row.id,code:localized(row.code,editableLanguages,'code'),tag:localized(row.tag,editableLanguages,'tag'),title:localized(row.title,editableLanguages,'pillars.'+i+'.title'),desc:localized(row.desc,editableLanguages,'pillars.'+i+'.desc')};});
    var protectedData=input.protected;exact(protectedData,['brand','facts','periods','image']);
    if(protectedData.brand!=='DongDa'||protectedData.image!=='assets/img/factory_panorama.jpg'||!Array.isArray(protectedData.facts)||protectedData.facts.length!==4||!Array.isArray(protectedData.periods)||protectedData.periods.join('|')!=='1987-1997|2001-2017|2019-2023|2024-2026')throw new TypeError('Invalid protected company identity');
    var facts=protectedData.facts.map(function(row,i){exact(row,['id','value']);if(row.id!=='company_fact_'+(i+1)||row.value!==['1991','3,000+','500M+','30+'][i])throw new TypeError('Invalid protected company facts');return{id:row.id,value:row.value};});
    var data=freeze({schemaVersion:version,id,reviewStatus:'legacy-pending',provenance:{...input.provenance},copy,capabilities,pillars,protected:{brand:'DongDa',facts,periods:protectedData.periods.slice(),image:protectedData.image}});
    return freeze({data,project:function(language){var l=languages.includes(language)?language:'en',sectionLanguage=editableLanguages.includes(l)?l:'en';return freeze({copy:Object.fromEntries(keys.map(function(key){return[key,data.copy[key][l]];})),capabilities:data.capabilities.map(function(row){return[row.marker,row.text[sectionLanguage]];}),pillars:data.pillars.map(function(row){return{code:row.code[sectionLanguage],tag:row.tag[sectionLanguage],title:row.title[sectionLanguage],desc:row.desc[sectionLanguage]};})});}});
  }
  function editablePaths(){return keys.flatMap(function(key){return editableLanguages.map(function(l){return'copy.'+key+'.'+l;});}).concat(Array.from({length:5},function(_,i){return editableLanguages.map(function(l){return'capabilities.'+i+'.text.'+l;});}).flat(),Array.from({length:4},function(_,i){return['title','desc'].flatMap(function(field){return editableLanguages.map(function(l){return'pillars.'+i+'.'+field+'.'+l;});});}).flat());}
  root.DongDaCompanyProfile=freeze({version,id,languages,editableLanguages,keys,create,textLimit,editablePaths});
})(typeof globalThis==='object'?globalThis:this);
