function customText(key) { return (DONGDA_CUSTOMIZATION_COPY[lang]||DONGDA_CUSTOMIZATION_COPY.en)[key]||key; }
function customPrintingText(value) { return customText({'not-specified':'notSpecified',none:'none','single-color':'singleColor','multi-color':'multiColor','technical-advice':'printingAdvice'}[value]); }
function customizationRows(value) {
  if (!DongDaCustomization.hasValue(value)) return [];
  value=DongDaCustomization.draft(value);
  var rows=[];
  ['length','width','height'].forEach(function (key) { if(value[key])rows.push([customText(key),value[key]+' '+value.dimensionUnit]); });
  ['material','bagColor','contents','notes'].forEach(function (key) { if(value[key])rows.push([customText(key),value[key]]); });
  if(value.loadKg)rows.push([customText('loadKg'),value.loadKg+' kg']);
  if(value.printing!=='not-specified')rows.push([customText('printing'),customPrintingText(value.printing)]);
  if(value.printColors)rows.push([customText('printColors'),value.printColors]);
  if(value.technicalAdvice)rows.push([customText('technicalAdvice'),customText('yes')]);
  return rows;
}
function customizationFields(prefix,value,handler,opened) {
  value=Object.assign({},DongDaCustomization.defaults,value||{});
  function control(key) {
    var id=prefix+'-'+key, action=handler+'(\''+key+'\',this.value)',label='<label for="'+id+'">'+esc(customText(key))+'</label>',input;
    if(key==='dimensionUnit'||key==='printing') {
      var options=key==='dimensionUnit'?['mm','cm']:DongDaCustomization.printing;
      input='<select id="'+id+'" onchange="'+action+'">'+options.map(function(option){return '<option value="'+option+'"'+(value[key]===option?' selected':'')+'>'+esc(key==='printing'?customPrintingText(option):option)+'</option>';}).join('')+'</select>';
    } else {
      var numeric=['length','width','height','loadKg','printColors'].includes(key);
      input='<input id="'+id+'" type="text"'+(numeric?' inputmode="'+(key==='printColors'?'numeric':'decimal')+'"':'')+' maxlength="'+DongDaCustomization.limits[key]+'" value="'+esc(value[key])+'" oninput="'+action+'">';
    }
    return '<div class="customization-field">'+label+input+'</div>';
  }
  return '<details class="customization-details" data-custom-prefix="'+prefix+'"'+(opened?' open':'')+'><summary>'+catalogIcon('Pencil')+esc(customText('title'))+'</summary><div class="customization-grid">'
    +['dimensionUnit','material','length','width','height','loadKg','bagColor','contents','printing','printColors','notes'].map(control).join('')
    +'<label class="customization-advice"><input id="'+prefix+'-technicalAdvice" type="checkbox" onchange="'+handler+'(\'technicalAdvice\',this.checked)"'+(value.technicalAdvice?' checked':'')+'><span>'+esc(customText('technicalAdvice'))+'</span></label></div><p class="customization-review">'+esc(customText('review'))+'</p></details>';
}
function qSetCustomization(key,value) {
  if(qState.busy)return;
  qState.customization=Object.assign({},DongDaCustomization.defaults,qState.customization||{});qState.customization[key]=value;
  document.getElementById('q-custom-'+key)?.removeAttribute('aria-invalid');
  if(window.DongDaFieldFeedback)DongDaFieldFeedback.clear('q-custom-'+key);
  if(!document.querySelector('#q-spec-fields [aria-invalid="true"]')) {
    var status=document.getElementById('q-spec-status');status.className='lead-status';status.textContent='';
  }
}
function updateRfqCustomization(id,key,value) {
  if(rfqListState.busy)return;
  var item=rfqListState.items.find(function(row){return row.lineId===id;});if(!item)return;
  item.customization=Object.assign({},DongDaCustomization.defaults,item.customization||{});item.customization[key]=value;
  document.getElementById('rfq-custom-'+id+'-'+key)?.removeAttribute('aria-invalid');
  if(window.DongDaFieldFeedback)DongDaFieldFeedback.clear('rfq-custom-'+id+'-'+key);
  if(!document.querySelector('#rfq-list-items [aria-invalid="true"]'))clearRfqFeedback();
}
function customValidation(value,prefix) {
  var first=null;
  if(!value)return null;
  DongDaCustomization.errors(value).forEach(function(key){
    var el=document.getElementById(prefix+'-'+key)||document.querySelector('[data-custom-prefix="'+prefix+'"] input');
    if(el){el.setAttribute('aria-invalid','true');if(window.DongDaFieldFeedback)DongDaFieldFeedback.show(el,DongDaFormFeedbackCore.customizationCode(key));el.closest('details').open=true;if(!first)first=el;}
  });
  return first;
}
