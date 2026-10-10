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
  async function execute(action) { if (busy) return; busy = true; root.querySelectorAll('button').forEach(b => b.disabled = true); feedback('正在处理…'); try { await action(); } catch (error) { feedback(error.message, true); } finally { busy = false; root.querySelectorAll('button[data-lock="false"]').forEach(b => b.disabled = false); } }
  function editableFields() { return Object.fromEntries([...document.querySelectorAll('[data-content-field]')].map(input => [input.dataset.contentField, input.value])); }
  async function save(action, revisionId) {
    await execute(async () => { selected = await request(`records/${selected.postId}`, { action, expectedRevision: selected.revision, ...(action === 'restore' ? { revisionId } : { fields: editableFields() }) }); await load(); feedback('内容已保存。'); });
  }
  function display() {
    root.replaceChildren();
    const feedbackNode = node('p', '', 'dd-feedback'); feedbackNode.id = 'dd-feedback'; feedbackNode.setAttribute('role', 'status'); feedbackNode.setAttribute('aria-live', 'polite'); root.append(feedbackNode);
    const layout = node('div', null, 'dd-layout'), list = node('nav', null, 'dd-list'); list.setAttribute('aria-label', '内容记录');
    for (const record of records) {
      const item = button(`${record.data.name.zh} · ${statuses[record.status]}`, () => { selected = record; display(); }); item.classList.toggle('selected', selected?.postId === record.postId); list.append(item);
    }
    const editor = node('section', null, 'dd-editor');
    if (selected) {
      editor.append(node('h2', selected.data.name.zh), node('p', `${selected.kind === 'industry' ? '行业' : selected.data.kind === 'technical' ? '材料模块' : '产品'} / ${selected.id} / 修订 ${selected.revision} / ${statuses[selected.status]}`, 'dd-record-meta'));
      const names = { zh: '中文', en: 'English', ru: 'Русский' };
      const editable = records.find(r => r.postId === selected.postId).editable;
      const locked = !reviewer && selected.status === 'publish';
      for (const language of ['zh', 'en', 'ru']) {
        const group = node('fieldset'); group.append(node('legend', names[language]));
        for (const field of editable.filter(f => f.endsWith('.' + language))) {
          const row = node('label'), label = field.startsWith('name.') ? '名称' : field.startsWith('summary.') ? '摘要' : field.startsWith('specs.') ? `技术条件 ${Number(field.split('.')[1]) + 1}` : `采购条件 ${Number(field.split('.')[1]) + 1}${field.includes('.title.') ? '标题' : '正文'}`;
          const input = node(field.startsWith('name.') || field.includes('.title.') ? 'input' : 'textarea'); input.dataset.contentField = field; input.value = getPath(selected.data, field); input.disabled = locked; input.maxLength = field.startsWith('name.') || field.includes('.title.') ? 120 : field.startsWith('specs.') ? 400 : 600;
          row.append(node('span', label), input); group.append(row);
        }
        editor.append(group);
      }
      const actions = node('div', null, 'dd-actions'); actions.append(button('保存草稿', () => save('draft'), locked), button('提交审核', () => save('pending'), locked));
      if (reviewer) actions.append(button('批准内容', () => save('publish')));
      actions.append(button('重新载入', () => execute(load)));
      if (reviewer) actions.append(button('修订记录', async () => { await execute(async () => {
        const rows = await request(`records/${selected.postId}/revisions`), history = node('div', null, 'dd-revisions');
        for (const revision of rows.filter(r => r.data)) { const row = node('div'); row.append(node('span', `#${revision.id} · ${revision.date} · ${revision.data.summary.zh}`), button('还原此修订', () => save('restore', revision.id))); history.append(row); }
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
        const previewSupported = selected?.kind === 'industry' || selected?.data.kind === 'product';
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
    const languageLabel = node('label'), languageSelect = node('select'); languageSelect.setAttribute('aria-label', '预览语言'); languageLabel.append(node('span', '预览语言'));
    for (const [value, name] of [['zh','中文'],['en','English'],['ru','Русский']]) { const option = node('option', name); option.value = value; languageSelect.append(option); }
    languageSelect.value = language; languageSelect.addEventListener('change', () => preview(releaseId, languageSelect.value)); languageLabel.append(languageSelect); panel.append(languageLabel);
    const frame = node('iframe'); frame.title = '内容只读预览'; frame.setAttribute('sandbox', ''); frame.srcdoc = response.html; panel.append(frame); root.append(panel); panel.scrollIntoView({ block: 'start' }); feedback('只读预览已载入。');
  }); }
  load().catch(error => { root.append(node('p', error.message, 'dd-error')); });
})();
