/* 鼠标定位助手 —— 内容脚本
 *
 * 浏览器扩展无法驱动操作系统级的真实鼠标指针，因此这里在页面中绘制一个
 * 虚拟鼠标指针，把它平滑移动到指定坐标，并在目标位置派发真实的
 * mousemove / mousedown / mouseup / click 事件，从而触发页面的 hover、click 逻辑。
 */
(function () {
  if (window.__mouseLocatorLoaded) return;
  window.__mouseLocatorLoaded = true;

  const DEFAULTS = {
    visible: true,
    showLabel: true,
    dispatchEvents: true,
    autoClick: false,
    duration: 600,
  };

  const state = {
    x: Math.round(window.innerWidth / 2),
    y: Math.round(window.innerHeight / 2),
    options: Object.assign({}, DEFAULTS),
    pickMode: false,
    animId: 0,
    cursorEl: null,
    labelEl: null,
    highlightEl: null,
    highlightTimer: 0,
  };

  const root = () => document.documentElement || document.body;

  /* -------------------- 虚拟指针 -------------------- */

  const CURSOR_SVG = [
    '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">',
    '<path d="M0 0 L0 16.5 L4.2 12.6 L7 18.6 L9.6 17.4 L6.8 11.5 L12.6 11.4 Z"',
    ' fill="#ffffff" stroke="#111827" stroke-width="1.2" stroke-linejoin="round"/>',
    '</svg>',
  ].join('');

  function createCursor() {
    if (state.cursorEl || !root()) return;
    const cursor = document.createElement('div');
    cursor.className = 'ml-cursor';
    cursor.innerHTML = CURSOR_SVG;

    const label = document.createElement('div');
    label.className = 'ml-label';

    root().appendChild(cursor);
    root().appendChild(label);

    state.cursorEl = cursor;
    state.labelEl = label;
    applyVisibility();
    setPosition(state.x, state.y);
  }

  function applyVisibility() {
    if (state.cursorEl) {
      state.cursorEl.style.display = state.options.visible ? 'block' : 'none';
    }
    if (state.labelEl) {
      state.labelEl.style.display =
        state.options.visible && state.options.showLabel ? 'block' : 'none';
    }
  }

  function setPosition(x, y) {
    state.x = x;
    state.y = y;
    if (!state.cursorEl) return;
    state.cursorEl.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
    if (state.labelEl) {
      state.labelEl.style.transform =
        'translate3d(' + (x + 18) + 'px, ' + (y + 18) + 'px, 0)';
      state.labelEl.textContent = Math.round(x) + ', ' + Math.round(y);
    }
  }

  /* -------------------- 事件派发 -------------------- */

  function targetAt(x, y) {
    return document.elementFromPoint(x, y) || document.body || document.documentElement;
  }

  function fireMouse(type, x, y) {
    const target = targetAt(x, y);
    if (!target) return null;
    const ev = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: type === 'mousedown' ? 1 : 0,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
    });
    target.dispatchEvent(ev);
    return target;
  }

  function fireMove(x, y) {
    if (!state.options.dispatchEvents) return;
    fireMouse('mousemove', x, y);
  }

  function simulateClick(x, y) {
    fireMouse('mousedown', x, y);
    fireMouse('mouseup', x, y);
    fireMouse('click', x, y);
    showRipple(x, y);
  }

  function showRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'ml-ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    root().appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  /* -------------------- 元素高亮 -------------------- */

  function highlight(el, persist) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    if (!state.highlightEl) {
      state.highlightEl = document.createElement('div');
      state.highlightEl.className = 'ml-highlight';
      root().appendChild(state.highlightEl);
    }
    const rect = el.getBoundingClientRect();
    const box = state.highlightEl;
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
    box.style.display = 'block';

    clearTimeout(state.highlightTimer);
    if (!persist) {
      state.highlightTimer = setTimeout(() => {
        box.style.display = 'none';
      }, 1500);
    }
  }

  function clearHighlight() {
    if (state.highlightEl) state.highlightEl.style.display = 'none';
  }

  /* -------------------- 移动动画 -------------------- */

  function animateTo(tx, ty, duration, cb) {
    cancelAnimationFrame(state.animId);
    createCursor();
    applyVisibility();

    const sx = state.x;
    const sy = state.y;
    const dx = tx - sx;
    const dy = ty - sy;
    const dur = Math.max(0, Number(duration) || 0);

    function finish() {
      if (state.options.autoClick) simulateClick(tx, ty);
      if (typeof cb === 'function') cb();
    }

    if (dur === 0) {
      setPosition(tx, ty);
      fireMove(tx, ty);
      finish();
      return;
    }

    const t0 = performance.now();
    function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setPosition(sx + dx * e, sy + dy * e);
      fireMove(state.x, state.y);
      if (p < 1) {
        state.animId = requestAnimationFrame(step);
      } else {
        state.animId = 0;
        setPosition(tx, ty);
        fireMove(tx, ty);
        finish();
      }
    }
    state.animId = requestAnimationFrame(step);
  }

  function moveTo(x, y, duration) {
    const tx = Math.max(0, Math.min(Number(x) || 0, window.innerWidth - 1));
    const ty = Math.max(0, Math.min(Number(y) || 0, window.innerHeight - 1));
    return new Promise((resolve) => {
      animateTo(tx, ty, duration, () =>
        resolve({ ok: true, x: Math.round(state.x), y: Math.round(state.y) })
      );
    });
  }

  function moveQuick(kind, duration) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let x = w / 2;
    let y = h / 2;
    switch (kind) {
      case 'top-left':
        x = 8;
        y = 8;
        break;
      case 'top-right':
        x = w - 8;
        y = 8;
        break;
      case 'bottom-left':
        x = 8;
        y = h - 8;
        break;
      case 'bottom-right':
        x = w - 8;
        y = h - 8;
        break;
      case 'random':
        x = 20 + Math.random() * Math.max(1, w - 40);
        y = 20 + Math.random() * Math.max(1, h - 40);
        break;
      case 'center':
      default:
        break;
    }
    return moveTo(x, y, duration);
  }

  function moveToSelector(selector, duration) {
    let el;
    try {
      el = document.querySelector(selector);
    } catch (e) {
      return Promise.resolve({ ok: false, error: 'CSS 选择器语法错误' });
    }
    if (!el) return Promise.resolve({ ok: false, error: '未找到匹配的元素' });

    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    highlight(el, true);

    return new Promise((resolve) => {
      // 等待平滑滚动稳定后再计算元素位置
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        animateTo(cx, cy, duration, () =>
          resolve({ ok: true, x: Math.round(cx), y: Math.round(cy) })
        );
      }, 380);
    });
  }

  /* -------------------- 页面取点模式 -------------------- */

  function blockEvent(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function onPickClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.round(e.clientX);
    const y = Math.round(e.clientY);
    setPickMode(false);
    createCursor();
    applyVisibility();
    setPosition(x, y);
    fireMove(x, y);
    try {
      chrome.storage.local.set({ mlPicked: { x: x, y: y } });
      chrome.runtime.sendMessage({ type: 'ml-picked', x: x, y: y });
    } catch (err) {
      /* 忽略：扩展上下文可能已失效 */
    }
  }

  function setPickMode(on) {
    state.pickMode = on;
    const el = root();
    if (!el) return;
    if (on) {
      el.classList.add('ml-picking');
      window.addEventListener('click', onPickClick, true);
      window.addEventListener('mousedown', blockEvent, true);
      window.addEventListener('pointerdown', blockEvent, true);
    } else {
      el.classList.remove('ml-picking');
      window.removeEventListener('click', onPickClick, true);
      window.removeEventListener('mousedown', blockEvent, true);
      window.removeEventListener('pointerdown', blockEvent, true);
    }
  }

  /* -------------------- 消息通信 -------------------- */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'ml-ping':
        sendResponse({ ok: true });
        return;

      case 'ml-get-state':
        sendResponse({
          ok: true,
          x: Math.round(state.x),
          y: Math.round(state.y),
          options: state.options,
          viewport: { w: window.innerWidth, h: window.innerHeight },
        });
        return;

      case 'ml-move':
        moveTo(msg.x, msg.y, msg.duration != null ? msg.duration : state.options.duration)
          .then(sendResponse);
        return true;

      case 'ml-move-quick':
        moveQuick(msg.kind, msg.duration != null ? msg.duration : state.options.duration)
          .then(sendResponse);
        return true;

      case 'ml-move-selector':
        moveToSelector(msg.selector, msg.duration != null ? msg.duration : state.options.duration)
          .then(sendResponse);
        return true;

      case 'ml-click':
        createCursor();
        applyVisibility();
        simulateClick(state.x, state.y);
        sendResponse({ ok: true, x: Math.round(state.x), y: Math.round(state.y) });
        return;

      case 'ml-options':
        Object.assign(state.options, msg.options || {});
        applyVisibility();
        if (state.options.visible) createCursor();
        sendResponse({ ok: true, options: state.options });
        return;

      case 'ml-pick':
        setPickMode(!!msg.enabled);
        sendResponse({ ok: true, pickMode: state.pickMode });
        return;

      case 'ml-highlight-clear':
        clearHighlight();
        sendResponse({ ok: true });
        return;

      default:
        return;
    }
  });

  /* -------------------- 初始化 -------------------- */

  function init() {
    createCursor();
    try {
      chrome.storage.local.get('mlOptions', (res) => {
        if (res && res.mlOptions) {
          Object.assign(state.options, res.mlOptions);
          applyVisibility();
          if (state.options.visible) createCursor();
        }
      });
    } catch (e) {
      /* 忽略 */
    }
  }

  window.addEventListener('resize', () => {
    state.x = Math.min(state.x, window.innerWidth - 1);
    state.y = Math.min(state.y, window.innerHeight - 1);
    setPosition(state.x, state.y);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
