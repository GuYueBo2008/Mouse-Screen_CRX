/* 鼠标定位助手 —— 功能选单（popup）脚本 */

const $ = (sel) => document.querySelector(sel);

const DEFAULTS = {
  visible: true,
  showLabel: true,
  dispatchEvents: true,
  autoClick: false,
  duration: 600,
};

let opts = Object.assign({}, DEFAULTS);

/* -------------------- 通用工具 -------------------- */

function setStatus(text, kind) {
  const el = $('#status');
  el.textContent = text;
  el.className = 'status' + (kind ? ' ' + kind : '');
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0];
}

// 内容脚本可能尚未注入（例如刚安装、或页面在注入前就加载完成），此处做兜底注入
async function ensureContent(tab) {
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'ml-ping' });
    if (res && res.ok) return true;
  } catch (e) {
    /* 未注入，继续尝试 */
  }
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return true;
  } catch (e) {
    return false;
  }
}

async function send(msg) {
  const tab = await getActiveTab();
  if (!tab || tab.id == null) {
    setStatus('未找到可用标签页', 'error');
    return null;
  }
  const ok = await ensureContent(tab);
  if (!ok) {
    setStatus('当前页面不支持注入（如浏览器内置页面）', 'error');
    return null;
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    setStatus('与页面通信失败，请刷新页面后重试', 'error');
    return null;
  }
}

async function saveOptions() {
  try {
    await chrome.storage.local.set({ mlOptions: opts });
  } catch (e) {
    /* 忽略 */
  }
}

async function pushOptions() {
  await send({ type: 'ml-options', options: opts });
}

/* -------------------- 初始化 -------------------- */

async function init() {
  const stored = await chrome.storage.local.get(['mlOptions', 'mlPicked']);
  opts = Object.assign({}, DEFAULTS, stored.mlOptions || {});

  $('#optVisible').checked = opts.visible;
  $('#optLabel').checked = opts.showLabel;
  $('#optEvents').checked = opts.dispatchEvents;
  $('#optAutoClick').checked = opts.autoClick;
  $('#duration').value = opts.duration;
  $('#durationVal').textContent = opts.duration + ' ms';

  const state = await send({ type: 'ml-get-state' });
  if (state && state.ok) {
    $('#coordX').value = stored.mlPicked ? stored.mlPicked.x : state.x;
    $('#coordY').value = stored.mlPicked ? stored.mlPicked.y : state.y;
    $('#coordX').max = state.viewport.w - 1;
    $('#coordY').max = state.viewport.h - 1;
    if (stored.mlPicked) {
      setStatus('已取点 ' + stored.mlPicked.x + ', ' + stored.mlPicked.y, 'ok');
    }
  } else if (stored.mlPicked) {
    $('#coordX').value = stored.mlPicked.x;
    $('#coordY').value = stored.mlPicked.y;
  }
}

/* -------------------- 事件绑定 -------------------- */

document.querySelectorAll('[data-quick]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    setStatus('正在移动…');
    const res = await send({ type: 'ml-move-quick', kind: btn.dataset.quick, duration: opts.duration });
    if (res && res.ok) setStatus('已移动到 ' + res.x + ', ' + res.y, 'ok');
  });
});

$('#moveBtn').addEventListener('click', async () => {
  const x = Number($('#coordX').value);
  const y = Number($('#coordY').value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    setStatus('请输入有效的坐标', 'error');
    return;
  }
  setStatus('正在移动…');
  const res = await send({ type: 'ml-move', x: x, y: y, duration: opts.duration });
  if (res && res.ok) setStatus('已移动到 ' + res.x + ', ' + res.y, 'ok');
});

$('#selectorBtn').addEventListener('click', async () => {
  const selector = $('#selector').value.trim();
  if (!selector) {
    setStatus('请输入 CSS 选择器', 'error');
    return;
  }
  setStatus('正在定位…');
  const res = await send({ type: 'ml-move-selector', selector: selector, duration: opts.duration });
  if (res && res.ok) {
    setStatus('已定位到元素中心 ' + res.x + ', ' + res.y, 'ok');
  } else if (res && res.error) {
    setStatus(res.error, 'error');
  }
});

$('#clickBtn').addEventListener('click', async () => {
  const res = await send({ type: 'ml-click' });
  if (res && res.ok) setStatus('已在当前位置 ' + res.x + ', ' + res.y + ' 模拟点击', 'ok');
});

$('#pickBtn').addEventListener('click', async () => {
  const res = await send({ type: 'ml-pick', enabled: true });
  if (res && res.ok) {
    // 弹出层会遮挡页面点击，需要先关闭，用户点完页面后可从存储读回坐标
    setStatus('取点模式已开启，请在页面上点击目标位置');
    window.close();
  }
});

/* 开关 */
function bindToggle(id, key) {
  const el = $('#' + id);
  el.addEventListener('change', async () => {
    opts[key] = el.checked;
    await saveOptions();
    await pushOptions();
  });
}
bindToggle('optVisible', 'visible');
bindToggle('optLabel', 'showLabel');
bindToggle('optEvents', 'dispatchEvents');
bindToggle('optAutoClick', 'autoClick');

/* 动画时长 */
$('#duration').addEventListener('input', () => {
  $('#durationVal').textContent = $('#duration').value + ' ms';
});
$('#duration').addEventListener('change', async () => {
  opts.duration = Number($('#duration').value);
  await saveOptions();
  await pushOptions();
});

/* 重置 */
$('#resetBtn').addEventListener('click', async () => {
  opts = Object.assign({}, DEFAULTS);
  $('#optVisible').checked = opts.visible;
  $('#optLabel').checked = opts.showLabel;
  $('#optEvents').checked = opts.dispatchEvents;
  $('#optAutoClick').checked = opts.autoClick;
  $('#duration').value = opts.duration;
  $('#durationVal').textContent = opts.duration + ' ms';
  await saveOptions();
  await pushOptions();
  setStatus('已恢复默认设置', 'ok');
});

/* 接收到页面取点结果 */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'ml-picked') {
    $('#coordX').value = msg.x;
    $('#coordY').value = msg.y;
    setStatus('已取点 ' + msg.x + ', ' + msg.y, 'ok');
  }
});

init();
