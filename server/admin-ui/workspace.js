'use strict';

const $ = id => document.getElementById(id);
const statusNames = { new: '新询盘', contacted: '已联系', qualified: '需求已确认', quoted: '已报价', closed: '已关闭' };
const notificationNames = { pending: '待通知', sending: '网关处理中', failed: '通知失败', accepted: '网关已接收' };
const crmNames = { pending: '待同步', sending: '同步中', failed: '同步失败', blocked: '需处理配置', synced: '主系统已保存' };
const state = { icons: {}, session: null, rows: [], summary: {}, total: 0, selected: null, page: 0, cursors: [''], next: null, epoch: 0, listRequest: 0, detailRequest: 0, monitorRequest: 0, view: 'inbox', saving: false, timer: null };
const sessionChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('dongda-admin:' + location.origin) : null;
let checkingSession = false;

function icon(name) {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  for (const [tag, attrs] of state.icons[name] || []) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.append(node);
  }
  return svg;
}
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(node => node.replaceChildren(icon(node.dataset.icon))); }
function element(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
function badge(value, names) { return element('span', names[value] || value, 'badge ' + value); }
function message(node, text = '', kind = '') { node.textContent = text; node.classList.add('feedback'); node.classList.toggle('error', kind === 'error'); node.classList.toggle('success', kind === 'success'); }
function date(value) { const d = new Date(value); return Number.isNaN(d.valueOf()) ? value : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d); }
function feedback(error) {
  if (error.status === 409) return '记录已发生变化或通知正在处理。请重新载入详情后检查；本次修改未保存。';
  if (error.status === 429) return '操作过于频繁，请稍后重试。';
  if (error.status === 422) return '内容不符合要求，请检查字段。';
  if (error.status === 403) return '本次操作未获授权，请重新登录。';
  if (error.status === 404) return '询盘不存在，请刷新列表。';
  return '暂时无法完成操作。请保留内容并重试。';
}
async function api(path, options = {}) {
  const epoch = state.epoch, controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('/api/admin/' + path, { ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.session ? { 'X-CSRF-Token': state.session.csrfToken } : {}) } });
    const data = await response.json();
    if (epoch !== state.epoch) throw Object.assign(new Error('session_changed'), { status: 401 });
    if (!response.ok || data.ok !== true) {
      if (response.status === 401 && state.session) lock('会话已失效，请重新登录。');
      throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    }
    return data;
  } finally { clearTimeout(timeout); }
}
function lock(text = '') {
  state.epoch++; clearTimeout(state.timer); state.session = null; state.selected = null; state.rows = []; state.summary = {};
  $('detail-content').replaceChildren(); $('inquiry-rows').replaceChildren(); $('search').value = ''; $('admin-token').value = '';
  $('status-filter').value = ''; $('notification-filter').value = ''; $('detail-placeholder').hidden = false;
  message($('detail-status')); message($('list-status'));
  $('workspace').hidden = true; $('login-view').hidden = false; $('session-tools').hidden = true;
  clearMonitoring();
  document.body.classList.remove('detail-open'); message($('login-status'), text, text ? 'error' : '');
}
function enter(session) {
  state.session = session; state.epoch++; state.page = 0; state.cursors = [''];
  $('login-view').hidden = true; $('workspace').hidden = false; $('session-tools').hidden = false;
  $('environment').hidden = !session.localPreview;
  setView('inbox');
  $('channel-status').textContent = session.crmConfigured ? '主系统通道已配置' : '主系统待接入';
  $('channel-status').classList.toggle('ready', session.crmConfigured);
  clearTimeout(state.timer); state.timer = setTimeout(() => lock('会话已过期，请重新登录。'), Math.max(1, session.expiresAt - Date.now()));
  loadList();
}

function clearMonitoring() {
  state.monitorRequest++;
  for (const id of ['monitor-daily', 'monitor-queues', 'monitor-service', 'monitor-types', 'monitor-progress', 'monitor-failures']) $(id).replaceChildren();
  for (const id of ['monitor-period', 'monitor-observation']) $(id).textContent = '';
  for (const id of ['received', 'crm', 'notification', 'failed']) $('monitor-' + id).textContent = '0';
  $('monitor-data').hidden = true; $('monitor-data').setAttribute('aria-busy', 'false'); $('refresh-monitor').disabled = false;
  message($('monitor-status'));
}
function setView(view) {
  state.view = view; $('inbox-view').hidden = view !== 'inbox'; $('monitor-view').hidden = view !== 'monitor';
  for (const name of ['inbox', 'monitor']) { const button = $(name + '-tab'); if (name === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
}
function facts(target, rows) {
  $(target).replaceChildren(...rows.map(([name, value]) => { const row = element('div'); row.append(element('dt', name), element('dd', value)); return row; }));
}
function utcDate(value) { return value ? value.slice(0, 16).replace('T', ' ') + ' UTC' : '尚无记录'; }
function renderMonitoring(data) {
  $('monitor-period').textContent = data.period.start.slice(0, 10) + ' 至 ' + data.period.end.slice(0, 10) + ' · UTC';
  for (const [id, key] of [['received','received'],['crm','crmSaved'],['notification','gatewayAccepted'],['failed','failedAttempts']]) $('monitor-' + id).textContent = data.totals[key];
  const workerNames = { not_configured: '未配置', not_observed: '未观测到运行', stale: '运行记录已过期', recently_observed: '最近有运行记录' };
  const queues = [];
  for (const [pipeline, title, names] of [['crm', '主系统同步', crmNames], ['notification', '销售通知', notificationNames]]) {
    const queue = data.queues[pipeline], section = element('section'), heading = element('div', null, 'queue-heading');
    heading.append(element('h4', title), element('span', workerNames[queue.worker.state], 'badge ' + (queue.worker.state === 'stale' ? 'failed' : 'pending')));
    const dl = element('dl', null, 'queue-counts');
    for (const [status, count] of Object.entries(queue.counts)) { const row = element('div'); row.append(element('dt', names[status]), element('dd', count)); dl.append(row); }
    section.append(heading, dl, element('p', queue.oldestPendingMinutes == null ? '没有待处理询盘' : '最早待处理：' + utcDate(queue.oldestPendingAt) + ' · 已等候 ' + queue.oldestPendingMinutes + ' 分钟', 'muted'), element('p', '最近运行记录：' + utcDate(queue.worker.checkedAt), 'muted'));
    queues.push(section);
  }
  $('monitor-queues').replaceChildren(...queues);
  $('monitor-daily').replaceChildren(...[...data.daily].reverse().map(row => { const tr = element('tr'); for (const key of ['day', 'received', 'crmSaved', 'gatewayAccepted']) tr.append(element('td', row[key])); return tr; }));
  const requestSum = predicate => data.requests.outcomes.filter(predicate).reduce((sum, row) => sum + row.count, 0);
  facts('monitor-service', [['POST 请求次数', data.requests.count], ['新建 / 相同请求重试', requestSum(row => row.status === 201) + ' / ' + requestSum(row => row.status === 200)], ['拒绝 / 服务异常', requestSum(row => row.status >= 400 && row.status < 500) + ' / ' + requestSum(row => row.status >= 500)], ['平均接口处理时间', data.requests.averageMilliseconds == null ? '尚无观测' : data.requests.averageMilliseconds + ' ms']]);
  const typeNames = { inquiry: '产品询盘', 'quote-calculator': '配置询价', 'multi-product-rfq': '多产品 RFQ', 'sample-request':'样品申请', 'ai-customer-service': '客服询盘', other: '其他' };
  facts('monitor-types', data.byType.length ? data.byType.map(row => [typeNames[row.type] || '其他', row.count]) : [['已保存询盘', 0]]);
  facts('monitor-progress', [['有状态推进的样本', data.localProgress.sampled], ['平均首次推进耗时', data.localProgress.averageMinutes == null ? '尚无样本' : data.localProgress.averageMinutes + ' 分钟'], ['本地未记录推进', data.localProgress.unrecordedLocal ?? '主系统负责'], ['ERP 已入库、跟进未观测', data.localProgress.erpUnobserved]]);
  const codeNames = { delivery_not_confirmed: '尚未确认接收', configuration_changed: '目标配置发生变化', origin_not_allowed: '来源不允许', origin_required: '缺少合法来源', rate_limited: '频率限制', idempotency_key_required: '缺少重试标识', idempotency_conflict: '相同标识内容冲突', invalid_payload: '请求格式错误', spam_detected: '反垃圾检查', validation_failed: '字段校验失败', json_required: '需要 JSON 请求', request_too_large: '请求超过上限', invalid_json: 'JSON 无效', service_unavailable: '服务暂不可用' };
  const failures = data.deliveryAttempts.filter(row => ['failed', 'blocked'].includes(row.outcome)).map(row => [row.pipeline === 'crm' ? 'ERP' : '通知', row.outcome === 'blocked' ? '需处理' : '失败', codeNames[row.code] || (/^http_\d{3}$/.test(row.code) ? 'HTTP ' + row.code.slice(5) : '未确认'), row.count]);
  for (const row of data.requests.outcomes.filter(row => row.status >= 400)) failures.push(['接收接口', 'HTTP ' + row.status, codeNames[row.code] || '未确认', row.count]);
  $('monitor-failures').replaceChildren(...failures.map(row => { const tr = element('tr'); row.forEach(value => tr.append(element('td', value))); return tr; }));
  $('monitor-failures-empty').hidden = failures.length > 0;
  $('monitor-observation').textContent = '请求与失败观测始于 ' + utcDate(data.observationStartedAt) + '，每日汇总保留 ' + data.retentionDays + ' 天。' + (data.legacyAcceptedWithoutTime ? '另有 ' + data.legacyAcceptedWithoutTime + ' 条历史网关接收记录缺少时间，未计入每日趋势。' : '');
  $('monitor-data').hidden = false;
  message($('monitor-status'), data.captureHealthy ? '' : '统计记录存在写入失败，部分请求或运行记录可能缺失。', data.captureHealthy ? '' : 'error');
}
async function loadMonitoring() {
  if (!state.session) return;
  clearMonitoring();
  const request = state.monitorRequest, epoch = state.epoch;
  $('monitor-data').setAttribute('aria-busy', 'true'); $('refresh-monitor').disabled = true;
  message($('monitor-status'), '正在读取运营记录…');
  try {
    const data = await api('monitoring?days=' + encodeURIComponent($('monitor-range').value));
    if (request !== state.monitorRequest || epoch !== state.epoch) return;
    renderMonitoring(data.monitoring);
  } catch (error) { if (request === state.monitorRequest && epoch === state.epoch) message($('monitor-status'), '运营记录暂不可用，请重试。' + (error.status === 429 ? '操作过于频繁。' : ''), 'error'); }
  finally { if (request === state.monitorRequest && epoch === state.epoch) { $('monitor-data').setAttribute('aria-busy', 'false'); $('refresh-monitor').disabled = false; } }
}
async function login(preview = false) {
  if (!preview && location.protocol !== 'https:') { message($('login-status'), '正式登录需要 HTTPS。', 'error'); return; }
  const payload = preview ? { preview: true } : { token: $('admin-token').value };
  $('login-button').disabled = true; $('preview-login').disabled = true; message($('login-status'), '正在登录…');
  try { const session = await api('session', { method: 'POST', body: JSON.stringify(payload) }); $('admin-token').value = ''; enter(session); }
  catch (error) { $('admin-token').value = ''; message($('login-status'), error.status === 401 ? '管理凭据不正确。' : feedback(error), 'error'); }
  finally { $('login-button').disabled = false; $('preview-login').disabled = false; }
}
function dirty() {
  const form = document.querySelector('.followup-form');
  return Boolean(form && state.selected && (form.elements.owner.value !== state.selected.owner || form.elements.status.value !== state.selected.status || form.elements.note.value.trim()));
}
function canLeave() { return !state.saving && (!dirty() || window.confirm('放弃未保存的跟进修改？')); }
function renderList() {
  const fragment = document.createDocumentFragment();
  for (const row of state.rows) {
    const tr = element('tr'); tr.classList.toggle('selected', row.id === state.selected?.id);
    const company = element('td'), button = element('button', null, 'company-button'); button.type = 'button';
    button.append(element('span', row.company)); const arrow = element('span'); arrow.append(icon('ChevronRight')); button.append(arrow);
    button.setAttribute('aria-label', '查看询盘：' + row.company); button.setAttribute('aria-pressed', String(row.id === state.selected?.id));
    button.addEventListener('click', () => openDetail(row.id));
    company.append(button, element('span', row.product, 'product-line'));
    const stage = element('td'); stage.append(badge(row.status, statusNames), element('span', row.owner || '未分配', 'owner-line'));
    const notification = element('td'); notification.append(badge(row.notificationStatus, notificationNames));
    tr.append(company, stage, notification, element('td', date(row.receivedAt), 'date-cell')); fragment.append(tr);
  }
  $('inquiry-rows').replaceChildren(fragment); $('list-empty').hidden = state.rows.length > 0;
  $('empty-heading').textContent = $('search').value || $('status-filter').value || $('notification-filter').value ? '没有符合条件的询盘' : '暂无询盘';
  for (const key of ['total', 'new', 'pending', 'failed']) $('metric-' + key).textContent = state.summary[key] ?? 0;
  $('result-count').textContent = `${state.total} 条询盘`; $('page-number').textContent = state.page + 1;
  $('previous-page').disabled = state.page === 0; $('next-page').disabled = !state.next;
}
async function loadList(reset = false) {
  if (!state.session) return;
  if (reset) { state.page = 0; state.cursors = ['']; state.rows = []; state.total = 0; state.next = null; renderList(); }
  const request = ++state.listRequest, epoch = state.epoch;
  const params = new URLSearchParams({ limit: '20', q: $('search').value.trim(), status: $('status-filter').value, notification: $('notification-filter').value, cursor: state.cursors[state.page] || '' });
  $('table-region').setAttribute('aria-busy', 'true'); $('refresh-list').disabled = true; $('previous-page').disabled = true; $('next-page').disabled = true;
  message($('list-status'), '正在读取询盘…');
  try {
    const data = await api('inquiries?' + params);
    if (request !== state.listRequest || epoch !== state.epoch) return;
    state.rows = data.inquiries; state.summary = data.summary; state.total = data.total; state.next = data.nextCursor;
    renderList(); message($('list-status'));
  } catch (error) { if (request === state.listRequest && epoch === state.epoch) message($('list-status'), feedback(error), 'error'); }
  finally { if (request === state.listRequest && epoch === state.epoch) { $('table-region').setAttribute('aria-busy', 'false'); $('refresh-list').disabled = false; $('previous-page').disabled = state.page === 0; $('next-page').disabled = !state.next; } }
}
function renderDetail(inquiry) {
  state.selected = inquiry;
  const fragment = $('detail-template').content.cloneNode(true), field = name => fragment.querySelector('[data-field="' + name + '"]');
  for (const key of ['id', 'company', 'contact', 'product', 'notes', 'phone', 'language']) field(key).textContent = (inquiry[key] ?? inquiry.lead[key]) || '—';
  field('receivedAt').textContent = date(inquiry.receivedAt); field('receivedAt').dateTime = inquiry.receivedAt;
  field('email').textContent = inquiry.lead.email; field('email').href = 'mailto:' + inquiry.lead.email;
  field('quantity').textContent = inquiry.lead.quantity ? inquiry.lead.quantity + (inquiry.lead.quantityUnit ? ' ' + inquiry.lead.quantityUnit : '') : '—';
  field('specifications').textContent = typeof inquiry.lead.specifications === 'object' ? Object.entries(inquiry.lead.specifications).map(([key, value]) => key + ': ' + value).join('\n') : inquiry.lead.specifications || '—';
  if (inquiry.lead.items) field('specifications').textContent = inquiry.lead.items.map((item, index) => `${index + 1}. ${item.product} [${item.productId}] · ${item.quantity} ${item.quantityUnit}\n${Object.entries(item.specifications).map(([key, value]) => key + ': ' + value).join('\n')}${item.customization ? '\n定制原始需求（待技术确认）:\n'+JSON.stringify(item.customization,null,2) : ''}`).join('\n\n') + '\n\n交付目的地: ' + inquiry.lead.destination + '\n期望交付时间: ' + inquiry.lead.deliveryWindow;
  if (inquiry.lead.customization) field('specifications').textContent += '\n定制原始需求（待技术确认）:\n'+JSON.stringify(inquiry.lead.customization,null,2);
  if (inquiry.lead.sampleRequest) field('specifications').textContent = '样品原始需求（状态请在主系统更新）\n' + JSON.stringify(inquiry.lead.sampleRequest,null,2);
  field('notification').textContent = notificationNames[inquiry.notification.status] || inquiry.notification.status; field('notification').className = 'badge ' + inquiry.notification.status;
  field('notificationInfo').textContent = !state.session.notificationConfigured ? '通知渠道未配置，询盘已保存。' : inquiry.notification.status === 'accepted' ? '网关已接收；收件箱送达尚未确认。' : `已尝试 ${inquiry.notification.attempts} 次`;
  const retry = fragment.querySelector('.retry-button'); retry.disabled = !state.session.notificationConfigured || ['accepted', 'sending'].includes(inquiry.notification.status);
  if (retry.disabled) retry.title = !state.session.notificationConfigured ? '通知渠道尚未配置' : '网关已接收或正在处理';
  const form = fragment.querySelector('.followup-form'); form.elements.owner.value = inquiry.owner; form.elements.status.value = inquiry.status;
  field('crm').textContent = crmNames[inquiry.crm.status] || inquiry.crm.status;
  field('crm').className = 'badge ' + (inquiry.crm.status === 'synced' ? 'accepted' : inquiry.crm.status === 'blocked' ? 'failed' : inquiry.crm.status);
  field('crmInfo').textContent = inquiry.crm.status === 'synced' ? '商机编号：' + inquiry.crm.mainLeadId + '\n后续分配与跟进在主系统处理。' : !state.session.crmConfigured ? '主系统尚未接入，原始询盘已保存。' : '已尝试 ' + inquiry.crm.attempts + ' 次；尚未确认主系统保存。';
  const crmRetry = fragment.querySelector('.crm-retry-button'); crmRetry.disabled = !state.session.crmConfigured || ['synced', 'sending'].includes(inquiry.crm.status);
  crmRetry.addEventListener('click', retryCrm);
  form.closest('section').hidden = state.session.crmConfigured || inquiry.crm.status === 'synced';
  form.addEventListener('input', () => { form.querySelector('.save-button').disabled = state.saving || !dirty(); });
  form.addEventListener('submit', saveFollowup); retry.addEventListener('click', retryNotification);
  fragment.querySelector('.detail-refresh').addEventListener('click', () => openDetail(inquiry.id));
  const history = fragment.querySelector('.history');
  for (const followup of inquiry.followups) {
    const item = element('li'), top = element('div', null, 'history-top');
    top.append(badge(followup.status, statusNames), element('span', followup.owner || '未分配'), element('time', date(followup.createdAt)));
    item.append(top, element('p', followup.note || '—'), element('small', followup.actor === 'local-preview' ? '本机测试操作' : followup.actor === 'site-administrator' ? '站点管理员操作' : followup.actor ? '接口操作' : '历史记录（操作者未记录）'));
    history.append(item);
  }
  fragment.querySelector('.history-empty').hidden = inquiry.followups.length > 0;
  $('detail-content').replaceChildren(fragment); $('detail-placeholder').hidden = true; hydrateIcons($('detail-content')); renderList();
}
async function openDetail(id) {
  if (!canLeave()) return;
  const request = ++state.detailRequest, epoch = state.epoch;
  if (!document.body.classList.contains('detail-open')) state.listScroll = window.scrollY;
  state.selected = null; $('detail-content').replaceChildren(); $('detail-placeholder').hidden = false; renderList();
  document.body.classList.add('detail-open'); message($('detail-status'), '正在读取详情…');
  try {
    const data = await api('inquiries/' + encodeURIComponent(id));
    if (request !== state.detailRequest || epoch !== state.epoch) return;
    renderDetail(data.inquiry); message($('detail-status'));
    $('detail-content').querySelector('h2').focus({ preventScroll: true });
    if (matchMedia('(max-width:800px)').matches) window.scrollTo({ top: 0 });
  } catch (error) { if (request === state.detailRequest && epoch === state.epoch) message($('detail-status'), feedback(error), 'error'); }
}
async function saveFollowup(event) {
  event.preventDefault(); if (state.saving || !dirty()) return;
  const form = event.currentTarget, selected = state.selected, epoch = state.epoch;
  if (!form.reportValidity()) return;
  state.saving = true; form.querySelector('.save-button').disabled = true;
  for (const control of form.elements) control.disabled = true;
  message(form.querySelector('.save-status'), '正在保存…');
  try {
    const data = await api('inquiries/' + selected.id + '/followups', { method: 'POST', body: JSON.stringify({ status: form.elements.status.value, owner: form.elements.owner.value.trim(), note: form.elements.note.value.trim(), expectedRevision: selected.revision }) });
    if (epoch !== state.epoch) return;
    renderDetail(data.inquiry); message(document.querySelector('.save-status'), '跟进已保存。', 'success'); await loadList();
  } catch (error) { if (epoch === state.epoch) message(form.querySelector('.save-status'), feedback(error), 'error'); }
  finally { state.saving = false; if (epoch === state.epoch) { for (const control of form.elements) control.disabled = false; const current = document.querySelector('.save-button'); if (current) current.disabled = !dirty(); } }
}
async function retryNotification(event) {
  if (state.saving) return;
  const button = event.currentTarget, epoch = state.epoch, id = state.selected.id; button.disabled = true;
  const target = document.querySelector('.retry-status'); message(target, '正在加入通知队列…');
  try {
    await api('inquiries/' + id + '/retry', { method: 'POST' });
    if (epoch !== state.epoch) return;
    if (state.selected?.id !== id) return;
    state.selected.notification.status = 'pending';
    const label = document.querySelector('[data-field="notification"]'); label.textContent = notificationNames.pending; label.className = 'badge pending';
    message(target, '已重新加入队列，尚未确认发送或送达。', 'success'); button.disabled = false; await loadList();
  } catch (error) { if (epoch === state.epoch) { message(target, feedback(error), 'error'); button.disabled = false; } }
}
async function retryCrm(event) {
  if (state.saving) return;
  const button = event.currentTarget, epoch = state.epoch, id = state.selected.id, target = document.querySelector('.crm-retry-status');
  button.disabled = true; message(target, '正在加入同步队列…');
  try {
    await api('inquiries/' + id + '/crm-retry', { method: 'POST' });
    if (epoch !== state.epoch || state.selected?.id !== id) return;
    message(target, '已加入队列，尚未确认主系统保存。', 'success');
  } catch (error) { if (epoch === state.epoch) message(target, feedback(error), 'error'); }
  finally { if (epoch === state.epoch) button.disabled = false; }
}
$('login-form').addEventListener('submit', event => { event.preventDefault(); login(); });
$('inbox-tab').addEventListener('click', () => setView('inbox'));
$('monitor-tab').addEventListener('click', () => { setView('monitor'); loadMonitoring(); });
$('monitor-range').addEventListener('change', loadMonitoring);
$('refresh-monitor').addEventListener('click', loadMonitoring);
$('preview-login').addEventListener('click', () => login(true));
$('filter-form').addEventListener('submit', event => { event.preventDefault(); loadList(true); });
for (const id of ['status-filter', 'notification-filter']) $(id).addEventListener('change', () => loadList(true));
$('reset-filters').addEventListener('click', () => { $('search').value = ''; $('status-filter').value = ''; $('notification-filter').value = ''; loadList(true); });
$('refresh-list').addEventListener('click', () => loadList());
$('previous-page').addEventListener('click', () => { if (state.page > 0) { state.page--; loadList(); } });
$('next-page').addEventListener('click', () => { if (state.next) { state.cursors[++state.page] = state.next; loadList(); } });
$('logout').addEventListener('click', async () => {
  if (!canLeave()) return;
  try { await api('session', { method: 'DELETE' }); sessionChannel?.postMessage({ type: 'signed-out' }); lock(); }
  catch (error) { if (state.session) message($('list-status'), feedback(error), 'error'); }
});
$('detail-return').addEventListener('click', () => {
  if (!canLeave()) return; state.selected = null; state.detailRequest++; $('detail-content').replaceChildren(); $('detail-placeholder').hidden = false;
  document.body.classList.remove('detail-open'); message($('detail-status')); renderList(); window.scrollTo({ top: state.listScroll || 0 });
});
window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
if (sessionChannel) sessionChannel.onmessage = event => { if (event.data?.type === 'signed-out' && state.session) lock('会话已退出，请重新登录。'); };
async function checkSession() {
  if (!state.session || checkingSession) return;
  checkingSession = true;
  try {
    const session = await api('session');
    if (!session.authenticated) lock('会话已失效，请重新登录。');
    else state.session.csrfToken = session.csrfToken;
  } catch {} finally { checkingSession = false; }
}
window.addEventListener('focus', checkSession);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSession(); });
(async () => {
  try {
    const icons = await fetch('/admin/icons.json', { cache: 'no-store' }); if (!icons.ok) throw new Error('icons_unavailable');
    state.icons = await icons.json(); hydrateIcons();
    const session = await api('session'); $('environment').hidden = !session.localPreview;
    $('preview-login').hidden = !session.localPreview; $('login-form').hidden = session.localPreview;
    if (session.authenticated) enter(session); else message($('login-status'));
  } catch (error) { message($('login-status'), feedback(error), 'error'); }
})();
