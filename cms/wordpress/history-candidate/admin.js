(function () {
  'use strict';
  const root = document.getElementById('dd-cms-root');
  let records = [], selected = null, reviewer = false, releases = null, busy = false;
  function node(tag, text, className) { const item = document.createElement(tag); if (text != null) item.textContent = text; if (className) item.className = className; return item; }
  async function request(path, data) {
    const response = await fetch(window.DongDaCms.api + path, { method: data ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-WP-Nonce': window.DongDaCms.nonce, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.message || result.error || '请求失败'); return result;
  }
  const statuses = { draft: '草稿', pending: '待审核', publish: '已批准内容' };
  function button(text, action, disabled = false) { const item = node('button', text, 'button'); item.type = 'button'; item.disabled = disabled || busy; item.dataset.lock = String(disabled); item.addEventListener('click', action); return item; }
  function feedback(message, error = false) { const target = document.getElementById('dd-feedback'); if (target) { target.textContent = message; target.classList.toggle('dd-error', error); } }
  function getPath(data, path) { return path.split('.').reduce((value, key) => value[key], data); }
  function recordName(record) {
    if (record.kind === 'company-profile') return record.data.copy.ab_h1.zh;
    if (record.kind === 'history') return `${record.data.year} - ${record.data.title.zh}`;
    if (record.kind === 'resource-field') return record.data.label.zh;
    return ['insight', 'resource'].includes(record.kind) ? record.data.title.zh : record.data.name.zh;
  }
  function titleField(field) { return field.startsWith('name.') || field.startsWith('title.') || field.startsWith('label.') || field.includes('.title.') || /^copy\.(ab_h1|ab_ey|ab_cap_e|company_atlas_ey|company_atlas_h|journey_ey|journey_h|journey_[1-4]_t|panorama_label|ab_pl_e)\./.test(field); }
  function recordKind(record) { return ({'company-profile':'企业概况', history:'企业历程', industry:'行业', insight:'采购指南', resource:'需求资料', 'resource-field':'资料公共字段'})[record.kind] || (record.data.kind === 'technical' ? '材料模块' : '产品'); }
  function fieldLabel(kind, field) {
    if (kind === 'company-profile') {
      if (field.startsWith('copy.')) return ({ab_h1:'页面标题',ab_sub:'页面引言',ab_ey:'企业介绍标签',ab_body:'企业介绍正文',ab_cap_e:'能力标签',company_atlas_ey:'企业信息标签',company_atlas_h:'企业信息标题',company_atlas_p:'企业信息正文',journey_ey:'阶段标签',journey_h:'阶段标题',journey_1_t:'阶段1标题',journey_1_p:'阶段1正文',journey_2_t:'阶段2标题',journey_2_p:'阶段2正文',journey_3_t:'阶段3标题',journey_3_p:'阶段3正文',journey_4_t:'阶段4标题',journey_4_p:'阶段4正文',panorama_label:'影像标签',panorama_cap:'影像说明',ab_pl_e:'支柱标签'})[field.split('.')[1]];
      return field.startsWith('capabilities.') ? `能力 ${Number(field.split('.')[1])+1}` : `支柱 ${Number(field.split('.')[1])+1}${field.includes('.title.')?'标题':'正文'}`;
    }
    if (field.startsWith('title.')) return kind === 'history' ? '节点标题' : '标题';
    if (field.startsWith('description.')) return '节点正文';
    if (field.startsWith('name.')) return '名称';
    if (field.startsWith('summary.')) return '摘要';
    if (field.startsWith('label.')) return '字段名称';
    if (field.startsWith('hint.')) return '字段说明';
    const index = Number(field.split('.')[1]) + 1;
    if (field.startsWith('sections.')) return `段落 ${index}${field.includes('.title.') ? '标题' : '正文'}`;
    if (field.startsWith('faq.')) return `常见问题 ${index}${field.includes('.question.') ? '问题' : '回答'}`;
    return field.startsWith('specs.') ? `技术条件 ${index}` : `采购条件 ${index}${field.includes('.title.') ? '标题' : '正文'}`;
  }
  function fieldLimit(kind, field) {
    if (kind === 'company-profile') {
      if (/^copy\.(ab_body|company_atlas_p)\./.test(field) || /^pillars\.\d+\.desc\./.test(field)) return 1000;
      if (/^copy\.(ab_sub|journey_[1-4]_p)\./.test(field) || field.startsWith('capabilities.')) return 600;
      if (field.startsWith('copy.panorama_cap.')) return 300;
      return 120;
    }
    if (['resource', 'resource-field'].includes(kind)) return 800;
    if (kind === 'insight') {
      if (field.startsWith('summary.')) return 500;
      if (field.startsWith('sections.') && field.includes('.body.')) return 2000;
      if (field.startsWith('faq.')) return field.includes('.question.') ? 200 : 1000;
      return 160;
    }
    return titleField(field) ? 120 : field.startsWith('specs.') ? 400 : 600;
  }
  function recordExcerpt(kind, data) { return kind === 'company-profile' ? data.copy.ab_body.zh : kind === 'history' ? data.description.zh : kind === 'resource-field' ? data.hint.zh : data.summary.zh; }
  function setControlsBusy(value) {
    root.querySelectorAll('button,input,textarea,select').forEach(item => {
      if (!Object.hasOwn(item.dataset, 'lock')) item.dataset.lock = String(item.disabled);
      item.disabled = value || item.dataset.lock === 'true';
    });
  }
  async function execute(action) { if (busy) return; busy = true; setControlsBusy(true); feedback('正在处理…'); try { await action(); } catch (error) { feedback(error.message, true); } finally { busy = false; setControlsBusy(false); } }
  function editableFields() { return Object.fromEntries([...document.querySelectorAll('[data-content-field]')].map(input => [input.dataset.contentField, input.value])); }
  async function save(action, revisionId) {
    await execute(async () => { selected = await request(`records/${selected.postId}`, { action, expectedRevision: selected.revision, ...(action === 'restore' ? { revisionId } : { fields: editableFields() }) }); await load(); feedback('内容已保存。'); });
  }
  function display() {
    root.replaceChildren();
    const feedbackNode = node('p', '', 'dd-feedback'); feedbackNode.id = 'dd-feedback'; feedbackNode.setAttribute('role', 'status'); feedbackNode.setAttribute('aria-live', 'polite'); root.append(feedbackNode);
    const layout = node('div', null, 'dd-layout'), list = node('nav', null, 'dd-list'); list.setAttribute('aria-label', '内容记录');
    for (const record of records) {
      const item = button(`${recordName(record)} · ${statuses[record.status]}`, () => { selected = record; display(); }); item.classList.toggle('selected', selected?.postId === record.postId); list.append(item);
    }
    const editor = node('section', null, 'dd-editor');
    if (selected) {
      editor.append(node('h2', recordName(selected)), node('p', `${recordKind(selected)} / ${selected.id} / 修订 ${selected.revision} / ${statuses[selected.status]}`, 'dd-record-meta'));
      const names = { zh: '中文', en: 'English', ru: 'Русский' };
      const editable = records.find(r => r.postId === selected.postId).editable;
      const locked = !reviewer && selected.status === 'publish';
      for (const language of ['zh', 'en', 'ru']) {
        const group = node('fieldset'); group.append(node('legend', names[language]));
        for (const field of editable.filter(f => f.endsWith('.' + language))) {
          const row = node('label'), label = fieldLabel(selected.kind, field);
          const input = node(titleField(field) ? 'input' : 'textarea'); input.dataset.contentField = field; input.dataset.lock = String(locked); input.value = getPath(selected.data, field); input.disabled = locked || busy; input.maxLength = fieldLimit(selected.kind, field);
          row.append(node('span', label), input); group.append(row);
        }
        editor.append(group);
      }
      const actions = node('div', null, 'dd-actions'); actions.append(button('保存草稿', () => save('draft'), locked), button('提交审核', () => save('pending'), locked));
      if (reviewer) actions.append(button('批准内容', () => save('publish')));
      actions.append(button('重新载入', () => execute(load)));
      if (reviewer) actions.append(button('修订记录', async () => { await execute(async () => {
        const rows = await request(`records/${selected.postId}/revisions`), history = node('div', null, 'dd-revisions');
        for (const revision of rows.filter(r => r.data)) { const row = node('div'); row.append(node('span', `#${revision.id} · ${revision.date} · ${recordExcerpt(selected.kind, revision.data)}`), button('还原此修订', () => save('restore', revision.id))); history.append(row); }
        editor.querySelector('.dd-revisions')?.remove(); editor.append(history); feedback(rows.length ? '修订记录已载入。' : '暂无修订记录。');
      }); }));
      editor.append(actions);
    } else editor.append(node('p', '暂无内容记录'));
    layout.append(list, editor); root.append(layout);
    const publishing = node('section', null, 'dd-publishing'); publishing.append(node('h2', '静态版本'));
    const state = releases?.state || { current: null, revision: 0 }, status = node('p', `当前 ${state.current || '未激活'} · 发布修订 ${state.revision}`); publishing.append(status);
    const releaseActions = node('div', null, 'dd-actions');
    releaseActions.append(button('生成草稿预览', () => build('preview')));
    if (reviewer) releaseActions.append(button('构建批准内容', () => build('published')));
    releaseActions.append(button('刷新版本', () => execute(async () => { await refreshReleases(); display(); })));
    if (reviewer && state.previous) releaseActions.append(button('回滚上一版', () => release({ action: 'rollback', expectedRevision: state.revision })));
    publishing.append(releaseActions);
    for (const item of releases?.releases || []) {
      const row = node('div', null, 'dd-release-row'); row.append(node('span', `${item.id} · ${item.scope === 'preview' ? '草稿预览' : '批准内容'} · ${item.status}`));
      if (item.status === 'ready') {
        const previewSupported = ['company-profile','history','industry','insight','resource','resource-field'].includes(selected?.kind) || selected?.data.kind === 'product';
        const previewButton = button('只读预览', () => preview(item.id), !previewSupported);
        if (!previewSupported) previewButton.title = '材料模块没有独立实体页';
        row.append(previewButton);
        if (reviewer && item.scope === 'published' && state.current !== item.id) row.append(button('激活此版', () => release({ action: 'activate', releaseId: item.id, expectedRevision: state.revision })));
      }
      publishing.append(row);
    }
    root.append(publishing);
  }
  async function refreshReleases() { releases = await request('release', { action: 'status' }); }
  async function load() { const response = await request('records'); records = response.records; reviewer = response.reviewer; selected = records.find(r => r.postId === selected?.postId) || records[0] || null; await refreshReleases(); display(); }
  async function build(scope) { await execute(async () => { await request('release', { action: 'build', scope }); await load(); feedback('版本已构建，尚未激活。'); }); }
  async function release(data) { await execute(async () => { await request('release', data); await load(); feedback('静态版本已更新。'); }); }
  async function preview(releaseId, language = 'zh') { await execute(async () => {
    const record = selected || records[0]; if (!record) throw new Error('没有可预览内容');
    if (record.kind === 'product' && record.data.kind === 'technical') throw new Error('材料模块没有独立实体页');
    const response = await request('release', { action: 'preview', releaseId, kind: record.kind, contentId: record.id, language });
    document.getElementById('dd-preview')?.remove(); const panel = node('section', null, 'dd-preview'); panel.id = 'dd-preview'; panel.append(node('h2', '只读预览'), button('关闭预览', () => panel.remove()));
    const languageLabel = node('label'), languageSelect = node('select'); languageSelect.dataset.lock = 'false'; languageSelect.disabled = busy; languageSelect.setAttribute('aria-label', '预览语言'); languageLabel.append(node('span', '预览语言'));
    for (const [value, name] of [['zh','中文'],['en','English'],['ru','Русский']]) { const option = node('option', name); option.value = value; languageSelect.append(option); }
    languageSelect.value = language; languageSelect.addEventListener('change', () => preview(releaseId, languageSelect.value)); languageLabel.append(languageSelect); panel.append(languageLabel);
    const frame = node('iframe'); frame.title = '内容只读预览'; frame.setAttribute('sandbox', ''); frame.srcdoc = response.html; panel.append(frame); root.append(panel); panel.scrollIntoView({ block: 'start' }); feedback('只读预览已载入。');
  }); }
  load().catch(error => { root.append(node('p', error.message, 'dd-error')); });
})();
