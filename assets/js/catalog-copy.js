(function (root) {
  'use strict';
  var values = {
    addList:['加入询价清单','Add to inquiry list','Добавить в запрос'],
    requestSample:['申请样品','Request a sample','Запросить образец'],
    sample:['既有样品图','Existing sample image','Имеющееся фото образца'],customerExample:['既有客户包装案例','Existing customer packaging example','Имеющийся пример упаковки клиента'],samplePending:['产品实拍与技术资料待确认','Product photography & technical data pending review','Фото изделия и технические данные ожидают согласования'],
    search:['搜索产品','Search products','Поиск продукции'],placeholder:['名称、编号或用途','Name, code or application','Название, код или назначение'],
    family:['产品系列','Product series','Серия продукции'],industry:['应用方向','Application','Применение'],all:['全部系列','All series','Все серии'],allUses:['全部用途','All applications','Все назначения'],
    family_bulk:['集装袋','FIBC bulk bags','Биг-бэги'],family_valve:['阀口袋','Valve bags','Клапанные мешки'],family_woven:['PP 编织袋','PP woven bags','Тканые PP мешки'],family_specialty:['专项包装','Specialty packaging','Специальная упаковка'],family_custom:['定制印刷','Custom printing','Индивидуальная печать'],
    industry_cement:['水泥与建材','Cement & construction','Цемент и стройматериалы'],industry_chemicals:['化工物料','Chemical materials','Химические материалы'],industry_agriculture:['农业与饲料','Agriculture & feed','Сельское хозяйство и корма'],industry_industrial:['工业与物流','Industry & logistics','Промышленность и логистика'],
    count:['个系列','series','серий'],clear:['清除筛选','Clear filters','Сбросить фильтры'],compare:['对比系列','Compare series','Сравнить серии'],selected:['已选','Selected','Выбрано'],selection:['加入对比','Compare','Сравнить'],clearCompare:['清空对比','Clear comparison','Очистить сравнение'],close:['关闭对比','Close comparison','Закрыть сравнение'],
    empty:['未找到匹配产品','No matching products','Совпадений не найдено'],emptyText:['可调整产品系列或应用方向，或提交具体包装需求。','Adjust the series or application, or send your packaging requirements.','Измените серию или назначение либо отправьте требования к упаковке.'],
    detail:['查看产品','View product','О продукции'],configure:['提交选型需求','Configure a request','Подобрать упаковку'],request:['发送询价','Send an inquiry','Отправить запрос'],requestNote:['需求产品：','Requested product:','Запрашиваемая продукция:'],
    review:['选型参数为采购需求，供货能力、检测与适用性需技术确认。','Selection values are requested requirements; availability, testing and suitability need technical confirmation.','Параметры являются требованиями покупателя; поставка, испытания и пригодность требуют согласования.'],
    terms:['起订量与交期由销售确认','MOQ & lead time to be confirmed','Минимальный заказ и срок по согласованию'],
    compareNote:['系列结构对比，不代表具体型号的认证或性能承诺。','Series-level comparison, not certification or a performance commitment for a specific model.','Сравнение серий, а не сертификат или гарантия характеристик конкретной модели.'],
    production:['生产前需确认物料、图纸、样品和验收要求。检测报告及合规文件按具体产品与目的地核对。','Contents, drawings, samples and acceptance requirements must be agreed before production. Testing and compliance documents are reviewed for the specific product and destination.','До производства согласуются содержимое, чертежи, образцы и условия приёмки. Испытания и документы проверяются для конкретного изделия и рынка.'],
    technical:['材料与结构','Materials & construction','Материалы и конструкция'],discuss:['讨论材料方案','Discuss materials','Обсудить материалы'],
    faq:['采购确认','Procurement questions','Вопросы закупки'],faqRequest:['询价需要提供哪些信息？','What should I include in a request?','Что указать в запросе?'],faqRequestAnswer:['请说明包装物料、填充和搬运方式、需求数量及目的地，技术与销售团队据此确认方案。','Describe the contents, filling and handling method, requested quantity and destination for technical and sales review.','Укажите содержимое, способ наполнения и перемещения, количество и место доставки для технического согласования.'],faqSpec:['选型值是否为正式产品规格？','Are selection values confirmed specifications?','Являются ли выбранные параметры утверждёнными?'],faqSpecAnswer:['选型值用于记录您的需求；最终结构、测试、价格和交期以双方确认的技术方案与报价为准。','Selection values record your requirements. Final construction, testing, price and schedule are subject to the agreed technical proposal and quotation.','Выбранные значения фиксируют требования. Конструкция, испытания, цена и срок определяются согласованным предложением.'],
    buyerChecklist:['采购需求清单','Buyer requirement checklists','Списки требований покупателя'],documents:['技术文件','Technical documentation','Техническая документация'],documentsNote:['技术文件需按具体产品、工厂与目的地审核；当前未提供已获准公开的技术文件。','Documentation must be reviewed for the specific product, factory and destination. Approved public technical documents are not currently available.','Документы проверяются для конкретного изделия, завода и рынка. Утверждённые общедоступные технические документы пока не предоставлены.']
  };
  Object.values(values).forEach(Object.freeze);
  root.DongDaCatalogCopy = Object.freeze({ values: Object.freeze(values), text: function (key, language) {
    var text = values[key];
    return text ? text[language === 'zh' ? 0 : language === 'ru' ? 2 : 1] : key;
  }});
})(globalThis);
