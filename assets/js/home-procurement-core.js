(function(root){
  'use strict';
  var copy={
    en:{
      kicker:'DongDa / Industrial Packaging',title:'DongDa\nIndustrial Packaging',lead:'Bulk bags, valve bags and woven sacks. Start with your filling method, load and destination; confirm the specification before ordering.',
      series:'Product Series',seriesTitle:'Find the structure for your next order',all:'All products',
      pathLabel:'Procurement steps',choose:'Choose a series',chooseDetail:'Compare bag structures and requested specifications.',prepare:'Prepare requirements',prepareDetail:'Bring filling, handling and document requirements together.',request:'Request a quote',requestDetail:'Send separately configured items in one RFQ.',
      industryTitle:'Start with the application',industryLead:'Describe the contents, filling equipment, handling and destination requirements. Suitability and any required test evidence need confirmation for each project.',industryAction:'Application guides',
      internationalTitle:'A clear brief for international procurement',internationalLead:'Keep product requirements, destination and documentation together when discussing a cross-border order.',internationalOne:'Specify dimensions, load, filling and discharge first. Add printing requirements and requested quantities for each item.',internationalTwo:'Ask for the relevant documentation and samples. Availability, testing, price, freight and lead time are confirmed separately.',
      routeLabel:'Destination',routeTitle:'Delivery requirements',routeDetail:'Name the destination and requested delivery terms; do not assume stock or a shipping schedule.',buyerLabel:'Application',buyerTitle:'Contents and handling',buyerDetail:'Describe the material being packed, filling equipment and handling conditions.',documentLabel:'Documentation',documentTitle:'Evidence for your project',documentDetail:'State the certificate or test scope you need. A catalogue entry is not a certificate.',responseLabel:'Inquiry',responseTitle:'One structured RFQ',responseDetail:'Keep each item and configuration distinct. Submission is not a quotation or order.',
      advantages:'Before You Order',advantagesTitle:'Agree on the details that matter',
      oneTitle:'Bag structure',oneDetail:'Confirm dimensions, filling, discharge, liner and handling requirements against the intended application.',
      twoTitle:'Delivery terms',twoDetail:'Confirm destination, quantities, packing, freight and requested dates with the sales team.',
      threeTitle:'Quality evidence',threeDetail:'Request the test method, applicable scope and batch documents required for your project.',
      fourTitle:'Material requirements',fourDetail:'Specify any recycled-content, recyclability or environmental requirements. Supporting evidence and feasibility require review.'
    },
    zh:{
      kicker:'东大 / 工业包装',title:'东大 DongDa\n工业包装',lead:'集装袋、阀口袋与编织袋。从灌装方式、装载需求和目的地开始选型，下单前确认具体规格。',
      series:'产品系列',seriesTitle:'为下一笔采购选择合适的袋型',all:'全部产品',
      pathLabel:'采购步骤',choose:'选择产品系列',chooseDetail:'对比袋型结构，明确需要的技术规格。',prepare:'整理采购需求',prepareDetail:'汇总灌装、搬运和文件要求。',request:'发起产品询盘',requestDetail:'在一份 RFQ 中提交独立配置的多个产品。',
      industryTitle:'从应用需求开始',industryLead:'说明包装内容物、灌装设备、搬运方式和目的地要求。每个项目的适用性及所需检测依据均需单独确认。',industryAction:'查看应用指南',
      internationalTitle:'让跨境采购的需求更清晰',internationalLead:'讨论跨境订单时，将产品要求、目的地与文件需求放在同一份采购说明中。',internationalOne:'先说明尺寸、装载、灌装与卸料方式，再按产品分别填写印刷要求及需求数量。',internationalTwo:'提出需要的文件和样品。供应情况、检测、价格、运费及交期均需分别确认。',
      routeLabel:'目的地',routeTitle:'交付要求',routeDetail:'明确目的地和所需贸易条款，不预设库存或发运时间。',buyerLabel:'应用',buyerTitle:'内容物与搬运',buyerDetail:'说明被包装物料、灌装设备及搬运条件。',documentLabel:'文件',documentTitle:'与项目相符的依据',documentDetail:'注明需要的证书或检测范围。目录信息不等同于认证。',responseLabel:'询盘',responseTitle:'一份结构化 RFQ',responseDetail:'保留各项产品及配置的独立性。提交需求不等同于报价或订单。',
      advantages:'下单前确认',advantagesTitle:'先把关键要求确认清楚',
      oneTitle:'袋型结构',oneDetail:'结合预定用途，确认尺寸、灌装、卸料、内衬和搬运要求。',
      twoTitle:'交付条件',twoDetail:'与销售团队确认目的地、数量、包装、运费和期望日期。',
      threeTitle:'质量依据',threeDetail:'提出项目所需的检测方法、适用范围和批次文件要求。',
      fourTitle:'材料要求',fourDetail:'注明再生成分、可回收性或环保要求。相关依据及可行性需进一步审核。'
    },
    ru:{
      kicker:'DongDa / Промышленная упаковка',title:'DongDa\nПромышленная упаковка',lead:'Биг-бэги, клапанные и тканые мешки. Начните со способа наполнения, нагрузки и места доставки; согласуйте характеристики до заказа.',
      series:'Серии продукции',seriesTitle:'Выберите конструкцию для следующего заказа',all:'Все продукты',
      pathLabel:'Этапы закупки',choose:'Выберите серию',chooseDetail:'Сравните конструкции и необходимые характеристики.',prepare:'Подготовьте требования',prepareDetail:'Соберите требования к наполнению, перемещению и документам.',request:'Отправьте запрос',requestDetail:'Передайте несколько отдельно настроенных позиций в одном RFQ.',
      industryTitle:'Начните с условий применения',industryLead:'Укажите содержимое, оборудование для наполнения, способ перемещения и место доставки. Пригодность и необходимые испытания согласуются для каждого проекта.',industryAction:'Руководства по применению',
      internationalTitle:'Чёткое задание для международной закупки',internationalLead:'При обсуждении международного заказа объедините требования к продукции, место доставки и необходимые документы.',internationalOne:'Сначала укажите размеры, нагрузку, наполнение и разгрузку. Добавьте требования к печати и количество для каждой позиции.',internationalTwo:'Запросите документы и образцы. Наличие, испытания, цена, перевозка и сроки согласуются отдельно.',
      routeLabel:'Доставка',routeTitle:'Условия поставки',routeDetail:'Укажите пункт назначения и условия поставки; наличие и график отгрузки требуют подтверждения.',buyerLabel:'Применение',buyerTitle:'Содержимое и перемещение',buyerDetail:'Опишите материал, оборудование для наполнения и условия перемещения.',documentLabel:'Документы',documentTitle:'Данные для вашего проекта',documentDetail:'Укажите нужные сертификаты и область испытаний. Запись в каталоге не является сертификатом.',responseLabel:'Запрос',responseTitle:'Один структурированный RFQ',responseDetail:'Сохраняйте отдельные позиции и настройки. Отправка запроса не означает предложение цены или заказ.',
      advantages:'До Заказа',advantagesTitle:'Согласуйте ключевые требования',
      oneTitle:'Конструкция мешка',oneDetail:'Согласуйте размеры, наполнение, разгрузку, вкладыш и перемещение для выбранного применения.',
      twoTitle:'Условия доставки',twoDetail:'Согласуйте с отделом продаж место доставки, количество, упаковку, перевозку и желаемые даты.',
      threeTitle:'Данные о качестве',threeDetail:'Запросите нужный метод испытаний, область применения и документы партии.',
      fourTitle:'Требования к материалу',fourDetail:'Укажите требования к вторичному сырью, переработке или экологии. Доказательства и реализуемость требуют проверки.'
    }
  };
  var languages=Object.freeze(['zh','en','ru']);
  Object.keys(copy).forEach(function(locale){Object.freeze(copy[locale]);});Object.freeze(copy);
  function language(value){return Object.hasOwn(copy,value)?value:'en';}
  function text(key,locale){if(!Object.hasOwn(copy.en,key))throw new TypeError('Unknown homepage copy key');return copy[language(locale)][key];}
  function links(locale){return Object.freeze({choose:'/#products',prepare:'/'+language(locale)+'/resources/',request:'/#rfq',industry:'/'+language(locale)+'/industries/'});}
  function cards(catalog,locale,arrow){
    return catalog.search({}).filter(function(product){return product.homepage;}).map(function(product){
      return '<article class="pl2 catalog-product">'+root.DongDaProductPage.card(product,locale,arrow)+'</article>';
    }).join('');
  }
  root.DongDaHomeProcurement=Object.freeze({version:'2026.10.08-home-procurement-v1',languages:languages,keys:Object.freeze(Object.keys(copy.en)),language:language,text:text,links:links,cards:cards});
})(globalThis);
