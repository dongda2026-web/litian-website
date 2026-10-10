(function(root){
  'use strict';
  var copy={
    en:{
      missingTitle:'Page unavailable',missingDescription:'This link does not point to an available page. Explore our product series or share your requirements.',missingProducts:'Browse products',missingInquiry:'Contact us',
      rfq_e:'Procurement Review',rfq_h:'From requirements to sales review',rfq_lead:'Describe the application, filling method, quantity and destination. Suitability, samples, price and delivery terms need confirmation for each request.',
      rfq_s1t:'Describe the application',rfq_s1p:'Specify the contents, filling equipment, load, handling and destination.',rfq_s2t:'Prepare the specification',rfq_s2p:'List dimensions, bag structure, liner, printing and any required test documents. Unresolved items can be submitted for technical advice.',rfq_s3t:'Request samples and terms',rfq_s3p:'State the sample purpose and delivery details. Availability, sample costs, freight, price and lead time require sales confirmation.',rfq_s4t:'Confirm before ordering',rfq_s4p:'Agree on specifications, artwork, quantity and delivery terms before placing an order.',rfq_sum_t:'Keep each requirement clear.',rfq_sum_p:'Submitting an inquiry is not a confirmed sample, quotation or order.',
      explore:'Explore',productsDetail:'Compare the catalogue series and prepare the specifications you need.',sustainDetail:'Review the material information and request the supporting documents for your project.',insightsDetail:'Buyer guides for filling, handling and packaging requirements.',inquiryDetail:'Share your requirements for review. Price, samples and delivery need separate confirmation.',customDetail:'Prepare dimensions, loading and printing requirements for each item.',
      valveAction:'Valve bag requirements',tonAction:'FIBC requirements',leadAction:'Delivery requirements',transferAction:'Move to inquiry',messageAction:'Send message',transferBlocked:'Your inquiry already has notes, is being submitted or has a receipt. Review it or start a new inquiry before moving this conversation.',transferLong:'The conversation exceeds the inquiry note limit. Summarize the requirements in the inquiry form; nothing has been sent.',
      title:'DongDa Product Assistant',sub:'Requirement guidance / sales confirmation',hello:'Share your product, quantity and application. I can collect common requirements; suitability, price, samples and delivery need sales confirmation.',placeholder:'Product, quantity and application',sent:'The conversation is in your inquiry form. Add company, contact person and email before submitting. Nothing has been sent to sales yet.',need:'Include quantity, dimensions, destination, printing requirements and contact details. Price and feasibility require review.',valve:'For valve bags, describe the contents, filling equipment, requested load, valve, bag structure and printing. Compatibility and any required tests need project-specific confirmation.',ton:'For FIBC, specify the requested load, dimensions, loops, liner, filling and discharge. Handling conditions, suitability and any required tests need confirmation.',lead:'Delivery needs sales confirmation after reviewing the requirements. Include your requested delivery date.',sampleAnswer:'Describe the sample purpose, product requirements and destination. Sample availability, costs and freight need sales confirmation.',email:'You can move this conversation to the inquiry form, add contact details and submit it yourself.',fallback:'Share the packaging type, quantity, requirements and destination. Unresolved specifications can be submitted for technical advice.'
    },
    zh:{
      missingTitle:'页面暂不可用',missingDescription:'此链接未指向有效页面。您可以查看产品系列，或提交采购需求。',missingProducts:'查看产品',missingInquiry:'联系东大',
      rfq_e:'采购需求确认',rfq_h:'从采购需求到人工确认',rfq_lead:'说明用途、灌装方式、数量与目的地。适用性、样品、价格和交付条件均需针对每份需求确认。',
      rfq_s1t:'说明应用条件',rfq_s1p:'注明内容物、灌装设备、装载需求、搬运方式和目的地。',rfq_s2t:'整理技术要求',rfq_s2p:'列出尺寸、袋型、内衬、印刷与所需检测文件。暂未确定的参数可提交技术咨询。',rfq_s3t:'提出样品与商务需求',rfq_s3p:'说明样品用途和收件信息。供应情况、样品费用、运费、价格与交期需销售确认。',rfq_s4t:'下单前确认',rfq_s4p:'下单前就规格、印刷稿、数量和交付条款达成一致。',rfq_sum_t:'让每项采购要求更清楚。',rfq_sum_p:'提交询盘不等同于已确认样品、正式报价或订单。',
      explore:'查看详情',productsDetail:'对比目录中的产品系列，整理需要的技术规格。',sustainDetail:'查看材料信息，并提出项目所需的证明文件。',insightsDetail:'了解灌装、搬运和包装需求的采购指南。',inquiryDetail:'提交需求供审核。价格、样品和交付条件需单独确认。',customDetail:'按产品分别整理尺寸、装载和印刷要求。',
      valveAction:'阀口袋需求',tonAction:'集装袋需求',leadAction:'交付要求',transferAction:'带入询盘',messageAction:'发送消息',transferBlocked:'询盘已有备注、正在提交或已有回执。请先查看现有询盘，或明确发起新询盘，再带入本次对话。',transferLong:'对话超过询盘备注长度，请在询盘表单中整理需求要点；尚未发送。',
      title:'东大选型助手',sub:'需求指引 / 销售确认',hello:'请告诉我产品、数量和用途。我可以整理常见采购要求；适用性、价格、样品与交期需销售确认。',placeholder:'请输入产品、数量和用途',sent:'对话已带入询价表单。请补充公司、联系人和邮箱并提交，尚未发送给销售。',need:'请补充数量、尺寸、目的地、印刷要求及联系方式。价格与可行性需进一步审核。',valve:'阀口袋需求请注明内容物、灌装设备、期望装载量、阀口形式、袋体结构和印刷。设备兼容性及所需检测应按项目确认。',ton:'集装袋/FIBC 需求请注明期望装载量、尺寸、吊带、内衬及进出料方式。搬运条件、适用性与所需检测均需确认。',lead:'交期需在审核需求后由销售确认。请注明期望收货日期。',sampleAnswer:'请说明样品用途、产品要求与目的地。样品供应、费用及运费需销售确认。',email:'可将当前对话带入询价表单，补充联系方式后自行提交。',fallback:'请说明包装类型、数量、要求和目的地。尚未确定的规格可提出技术咨询。'
    },
    ru:{
      missingTitle:'Страница недоступна',missingDescription:'Эта ссылка не ведёт на доступную страницу. Ознакомьтесь с сериями продукции или отправьте требования.',missingProducts:'Смотреть продукцию',missingInquiry:'Связаться с нами',
      rfq_e:'Проверка требований',rfq_h:'От требований к согласованию',rfq_lead:'Укажите применение, способ наполнения, количество и место доставки. Пригодность, образцы, цена и условия поставки согласуются для каждого запроса.',
      rfq_s1t:'Опишите применение',rfq_s1p:'Укажите содержимое, оборудование, требуемую нагрузку, перемещение и место доставки.',rfq_s2t:'Подготовьте характеристики',rfq_s2p:'Укажите размеры, конструкцию, вкладыш, печать и документы испытаний. По неизвестным параметрам можно запросить консультацию.',rfq_s3t:'Запросите образцы и условия',rfq_s3p:'Укажите цель образца и место доставки. Наличие, стоимость образцов, перевозка, цена и сроки требуют согласования.',rfq_s4t:'Согласуйте до заказа',rfq_s4p:'Согласуйте характеристики, макет, количество и условия поставки до оформления заказа.',rfq_sum_t:'Сохраняйте требования понятными.',rfq_sum_p:'Запрос не означает подтверждение образца, цены или заказа.',
      explore:'Подробнее',productsDetail:'Сравните серии каталога и подготовьте нужные характеристики.',sustainDetail:'Изучите информацию о материалах и запросите документы для вашего проекта.',insightsDetail:'Руководства по наполнению, перемещению и требованиям к упаковке.',inquiryDetail:'Передайте требования на проверку. Цена, образцы и доставка согласуются отдельно.',customDetail:'Подготовьте размеры, нагрузку и печать для каждой позиции.',
      valveAction:'Клапанные мешки',tonAction:'Требования FIBC',leadAction:'Условия доставки',transferAction:'В форму запроса',messageAction:'Отправить сообщение',transferBlocked:'В запросе уже есть заметки, он отправляется или имеет квитанцию. Проверьте его или начните новый запрос перед переносом диалога.',transferLong:'Диалог превышает лимит заметки. Изложите требования в форме запроса; ничего не отправлено.',
      title:'Помощник DongDa',sub:'Требования / согласование с отделом продаж',hello:'Укажите продукт, количество и применение. Я помогу собрать требования; пригодность, цену, образцы и сроки подтверждает отдел продаж.',placeholder:'Продукт, количество и применение',sent:'Диалог перенесён в форму. Укажите компанию, контактное лицо и email. Запрос ещё не отправлен.',need:'Укажите количество, размеры, место доставки, печать и контакты. Цена и реализуемость требуют проверки.',valve:'Для клапанных мешков укажите содержимое, оборудование, требуемую нагрузку, клапан, конструкцию и печать. Совместимость и испытания согласуются для проекта.',ton:'Для FIBC укажите требуемую нагрузку, размеры, стропы, вкладыш, наполнение и разгрузку. Пригодность, перемещение и испытания требуют согласования.',lead:'Сроки подтверждает отдел продаж после проверки требований. Укажите желаемую дату доставки.',sampleAnswer:'Укажите цель образца, требования к продукту и место доставки. Наличие, стоимость образцов и перевозка согласуются с отделом продаж.',email:'Перенесите диалог в форму, добавьте контакты и отправьте запрос самостоятельно.',fallback:'Укажите тип упаковки, количество, требования и место доставки. По неизвестным характеристикам можно запросить консультацию.'
    }
  };
  var keys=Object.keys(copy.en);
  Object.keys(copy).forEach(function(locale){
    if(Object.keys(copy[locale]).sort().join('|')!==keys.slice().sort().join('|'))throw new TypeError('Incomplete procurement copy');
    Object.freeze(copy[locale]);
  });Object.freeze(copy);
  var routes=Object.freeze({products:'products',sustain:'sustain',about:'about',news:'news',inquiry:'inquiry',quote:'quote',sample:'sample',resources:'resources',faq:'faq','company-history':'company-history'});
  var homePages=Object.freeze(['products','sustain','about','news','inquiry','quote']);
  function language(locale){return Object.hasOwn(copy,locale)?locale:'en';}
  function text(key,locale){if(!Object.hasOwn(copy.en,key))throw new TypeError('Unknown procurement copy');return copy[language(locale)][key];}
  function escaped(value){return root.DongDaProductPage.escape(value);}
  function href(page,locale,catalog){
    if(typeof page!=='string')throw new TypeError('Invalid procurement destination');
    var product=catalog.resolve(page);
    if(product&&product.kind==='product')return root.DongDaProductPage.path(product,language(locale));
    if(!Object.hasOwn(routes,page))throw new TypeError('Unknown procurement destination');
    var physical={about:'company',news:'insights',resources:'resources',faq:'faq','company-history':'company/history'};
    return Object.hasOwn(physical,page)?'/'+language(locale)+'/'+physical[page]+'/':'/#'+page;
  }
  function link(page,label,locale,catalog,extra){
    var product=catalog.resolve(page),action=product?'navProd(\''+product.id+'\')':'nav(\''+page+'\')';
    return '<a href="'+escaped(href(page,locale,catalog))+'" data-public-task="'+escaped(page)+'" onclick="'+escaped(action+';return false;')+'"'+(extra||'')+'>'+label+'</a>';
  }
  function home(items,locale,catalog){
    if(!Array.isArray(items)||items.length!==6)throw new TypeError('Invalid home navigation');
    return items.map(function(item,index){
      if(item.num!==String(index+1).padStart(2,'0')||!item.title||!item.desc||typeof item.svg!=='string'||!/^<svg\s/.test(item.svg)||/<(?:script|foreignObject)|\bon\w+\s*=|(?:href|src)\s*=/i.test(item.svg))throw new TypeError('Invalid home navigation item');
      var page=homePages[index],description=index===2?(item.desc[language(locale)]||item.desc.en):text(['productsDetail','sustainDetail','','insightsDetail','inquiryDetail','customDetail'][index],locale);
      var title=item.title[language(locale)]||item.title.en;
      if(typeof title!=='string'||typeof description!=='string')throw new TypeError('Incomplete home navigation');
      return link(page,'<div class="hnav-icon" aria-hidden="true">'+item.svg+'</div><div class="hnav-card-title">'+escaped(title)+'</div><div class="hnav-card-desc">'+escaped(description)+'</div><div class="hnav-card-cta">'+escaped(text('explore',locale))+'</div>',locale,catalog,' class="hnav-card"');
    }).join('');
  }
  
  function assistant(locale){
    var result={};['title','sub','hello','placeholder','sent','need','valve','ton','lead','email','fallback'].forEach(function(key){result[key]=text(key,locale);});result.sample=text('sampleAnswer',locale);return Object.freeze(result);
  }
  function reply(input,locale){
    if(typeof input!=='string'||input.length>2400)throw new TypeError('Invalid assistant request');
    var labels=assistant(locale),value=input.toLowerCase(),parts=[];
    if(/阀口|valve|клапан/.test(value))parts.push(labels.valve);
    if(/吨袋|集装袋|fibc|bulk bag|ton bag|биг.?бэг/.test(value))parts.push(labels.ton);
    if(/交期|货期|delivery|lead time|多久|срок|достав/.test(value))parts.push(labels.lead);
    if(/样品|sample|образ/.test(value))parts.push(labels.sample);
    if(/邮箱|邮件|email|\bmail\b|人工|sales|почт|продаж/.test(value))parts.push(labels.email);
    if(/报价|价格|询价|quote|price|rfq|采购|цен|предложен/.test(value))parts.push(labels.need);
    return parts.length?parts.join('\n\n'):labels.fallback;
  }
  root.DongDaPublicProcurement=Object.freeze({version:'2026.10.09-public-procurement-v1',workflowKeys:Object.freeze(keys.filter(function(key){return key.startsWith('rfq_');})),language:language,text:text,href:href,home:home,assistant:assistant,reply:reply});
})(globalThis);
