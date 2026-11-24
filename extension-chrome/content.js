// ==========================================================================
// Google Translate me — Content Script
// Handles Clipboard writing, Discreet Floating Badges, Hotkeys & Screen Cropping
// ==========================================================================

(() => {
if (window.__GT_COPILOT_VER__ === 3) return;
window.__GT_COPILOT_VER__ = 3;

const ext = typeof browser !== 'undefined' ? browser : chrome;
const IS_TOP_FRAME = (window === window.top);

function safeSendMessage(payload) {
  try {
    const res = ext.runtime.sendMessage(payload);
    if (res && typeof res.catch === 'function') {
      res.catch(() => {});
    }
  } catch (e) {}
}

// Read currently selected text from normal DOM or focused input/textarea
function getSelectedText() {
  try {
    const sel = window.getSelection ? window.getSelection().toString().trim() : '';
    if (sel) return sel;

    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|password|email|number)?$/i.test(active.type || 'text')))) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (typeof start === 'number' && typeof end === 'number' && end > start) {
        const val = active.value.substring(start, end).trim();
        if (val) return val;
      }
    }
  } catch (e) {}
  return '';
}

// Listen for commands from Background Script (Top Frame only to avoid duplicate overlays/ticks across iframes)
if (IS_TOP_FRAME) {
  ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'show_tick') {
      showTickBadge();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.action === 'copy_text' && msg.text) {
      copyTextToClipboard(msg.text).then(success => {
        if (msg.showTick !== false) {
          showTickBadge();
        }
        sendResponse({ ok: success });
      });
      return true;
    }

    if (msg.action === 'get_selection_only') {
      sendResponse({ text: getSelectedText() });
      return true;
    }

    if (msg.action === 'get_selection_or_clip') {
      const sel = getSelectedText();
      if (sel) {
        sendResponse({ text: sel });
      } else {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(clip => {
            sendResponse({ text: (clip || '').trim() });
          }).catch(() => {
            sendResponse({ text: '' });
          });
        } else {
          sendResponse({ text: '' });
        }
      }
      return true;
    }

    if (msg.action === 'start_crop_selection') {
      startCropSelection();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.action === 'smart_ctrl_shift_right_click') {
      const sel = getSelectedText();
      if (sel) {
        safeSendMessage({
          action: 'solve_selected_text',
          text: sel
        });
      } else {
        startCropSelection();
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg.action === 'execute_crop_canvas' && msg.fullDataUrl && msg.rect) {
      cropAndSendImage(msg.fullDataUrl, msg.rect);
      sendResponse({ ok: true });
      return true;
    }

    return true;
  });
}

// Smart Trigger (Ctrl+Shift+A / Ctrl+Shift+X / Ctrl+Shift+A+X / Ctrl+Shift+Right-Click)
// - If text is selected: immediately solves it in background, copies answer to clipboard & shows tick
// - If no text is selected: opens screen crop overlay and auto-solves cropped area
let suppressNextContextMenuUntil = 0;
let lastSmartTriggerAt = 0;

function handleSmartTrigger() {
  const now = Date.now();
  if (now - lastSmartTriggerAt < 500) return;
  lastSmartTriggerAt = now;

  if (IS_TOP_FRAME && document.getElementById('gt-crop-overlay')) return;

  const selectedText = getSelectedText();
  if (selectedText) {
    safeSendMessage({
      action: 'solve_selected_text',
      text: selectedText
    });
  } else if (IS_TOP_FRAME) {
    startCropSelection();
  } else {
    safeSendMessage({ action: 'smart_trigger_in_top_frame' });
  }
}

window.addEventListener('mousedown', (e) => {
  if (e.button === 2 && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    suppressNextContextMenuUntil = Date.now() + 1500;
    handleSmartTrigger();
  }
}, true);

window.addEventListener('contextmenu', (e) => {
  if (Date.now() < suppressNextContextMenuUntil) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    suppressNextContextMenuUntil = 0;
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    handleSmartTrigger();
  }
}, true);

window.addEventListener('auxclick', (e) => {
  if (e.button === 2 && Date.now() < suppressNextContextMenuUntil) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
}, true);

// Keyboard hotkeys on web page (layout-independent via e.code, works in both Persian & English layouts):
// - Ctrl + Shift + A / Ctrl + Shift + X (or Ctrl + Shift + A + X): Smart Solve Text / Crop Screen
// - Ctrl + Alt + Shift: Direct Screen Crop
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  const isCtrlOrMeta = e.ctrlKey || e.metaKey;
  const keyLower = (e.key || '').toLowerCase();
  const isAXKey = (
    e.code === 'KeyX' ||
    e.code === 'KeyA' ||
    keyLower === 'x' ||
    keyLower === 'a' ||
    e.key === 'ط' ||
    e.key === 'ش'
  );

  if (isCtrlOrMeta && e.shiftKey && !e.altKey && isAXKey) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    handleSmartTrigger();
    return;
  }

  if (e.ctrlKey && e.altKey && e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    if (IS_TOP_FRAME) {
      startCropSelection();
    } else {
      safeSendMessage({ action: 'request_top_frame_crop' });
    }
  }
}, true);

// Crop image on in-page canvas and send back to background & copilot
function cropAndSendImage(fullDataUrl, rect) {
  const img = new Image();
  img.onload = () => {
    try {
      const dpr = rect.dpr || window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      const targetW = Math.max(1, Math.round(rect.width * dpr));
      const targetH = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(
        img,
        Math.round(rect.x * dpr),
        Math.round(rect.y * dpr),
        targetW,
        targetH,
        0,
        0,
        targetW,
        targetH
      );

      const croppedDataUrl = canvas.toDataURL('image/png');
      const base64 = croppedDataUrl.replace(/^data:image\/png;base64,/, '');

      const screenshot = {
        mimeType: 'image/png',
        base64: base64,
        dataUrl: croppedDataUrl,
        hash: `${base64.length}_${base64.slice(0, 60)}`,
        size: Math.round(base64.length * 0.75),
        timestamp: Date.now()
      };

      safeSendMessage({
        action: 'cropped_screenshot_ready',
        screenshot: screenshot
      });

      showStatusBadge('📸 در حال حل تصویر و کپی خودکار...');
    } catch (err) {
      console.error('Canvas crop error:', err);
    }
  };
  img.src = fullDataUrl;
}

// Display interactive screen cropping overlay
function startCropSelection() {
  if (document.getElementById('gt-crop-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'gt-crop-overlay';
  overlay.style.cssText = `
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 2147483647 !important;
    cursor: crosshair !important;
    user-select: none !important;
    -webkit-user-select: none !important;
    background: rgba(15, 23, 42, 0.42) !important;
    box-sizing: border-box !important;
    margin: 0 !important;
    padding: 0 !important;
  `;

  // Instruction Pill at Top
  const hint = document.createElement('div');
  hint.id = 'gt-crop-hint';
  hint.style.cssText = `
    position: fixed !important;
    top: 22px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: rgba(15, 23, 42, 0.95) !important;
    color: #ffffff !important;
    padding: 9px 22px !important;
    border-radius: 9999px !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15) !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    direction: rtl !important;
  `;
  hint.innerHTML = `
    <span style="font-size: 16px;">📸</span>
    <span>محدوده سوال یا کد را با ماوس انتخاب کنید</span>
    <span style="opacity: 0.6; font-size: 11px; margin-right: 6px;">(Esc برای انصراف)</span>
  `;
  overlay.appendChild(hint);

  // Selection Box
  const box = document.createElement('div');
  box.id = 'gt-crop-box';
  box.style.cssText = `
    position: fixed !important;
    display: none !important;
    border: 2px solid #2563eb !important;
    box-shadow: 0 0 0 99999px rgba(15, 23, 42, 0.55), 0 0 16px rgba(37, 99, 235, 0.5) !important;
    border-radius: 3px !important;
    background: transparent !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
    box-sizing: border-box !important;
  `;

  // Size tag
  const sizeTag = document.createElement('div');
  sizeTag.id = 'gt-crop-sizetag';
  sizeTag.style.cssText = `
    position: absolute !important;
    bottom: -26px !important;
    right: 0 !important;
    background: #1e293b !important;
    color: #f8fafc !important;
    padding: 2px 7px !important;
    border-radius: 4px !important;
    font-size: 11px !important;
    font-family: monospace !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
    white-space: nowrap !important;
  `;
  box.appendChild(sizeTag);
  overlay.appendChild(box);

  let isDrawing = false;
  let startX = 0;
  let startY = 0;

  function cleanup() {
    window.removeEventListener('keydown', handleKey, true);
    overlay.remove();
  }

  function handleKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    }
  }

  overlay.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  overlay.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;

    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = '0px';
    box.style.height = '0px';
    box.style.display = 'block';
    overlay.style.background = 'transparent';
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    e.stopPropagation();

    const curX = e.clientX;
    const curY = e.clientY;

    const left = Math.min(startX, curX);
    const top = Math.min(startY, curY);
    const width = Math.abs(curX - startX);
    const height = Math.abs(curY - startY);

    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

    sizeTag.textContent = `${width} × ${height} px`;
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    isDrawing = false;

    const curX = e.clientX;
    const curY = e.clientY;

    const left = Math.min(startX, curX);
    const top = Math.min(startY, curY);
    const width = Math.abs(curX - startX);
    const height = Math.abs(curY - startY);

    cleanup();

    if (width < 20 || height < 20) {
      return;
    }

    const rect = {
      x: left,
      y: top,
      width: width,
      height: height,
      dpr: window.devicePixelRatio || 1
    };

    // Wait 2 animation frames so the dark overlay is fully repainted away before captureVisibleTab
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        safeSendMessage({
          action: 'tab_crop_requested',
          rect
        });
      });
    });
  });

  window.addEventListener('keydown', handleKey, true);
  (document.body || document.documentElement).appendChild(overlay);
}

// Small floating status badge
function showStatusBadge(text) {
  try {
    let badge = document.getElementById('gt-status-badge');
    if (badge) badge.remove();
    badge = document.createElement('div');
    badge.id = 'gt-status-badge';
    badge.style.cssText = `
      position: fixed !important;
      bottom: 20px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      background: #1e293b !important;
      color: #ffffff !important;
      padding: 10px 18px !important;
      border-radius: 8px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3) !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      direction: rtl !important;
      transition: opacity 0.2s ease !important;
    `;
    badge.textContent = text;
    (document.body || document.documentElement).appendChild(badge);
    setTimeout(() => {
      badge.style.opacity = '0';
      setTimeout(() => badge.remove(), 250);
    }, 1800);
  } catch (e) {}
}

// Display discreet floating checkmark in bottom-right corner for ~500ms
function showTickBadge() {
  try {
    let badge = document.getElementById('gt-tick-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'gt-tick-badge';
      badge.style.cssText = `
        position: fixed !important;
        bottom: 16px !important;
        right: 16px !important;
        z-index: 2147483647 !important;
        width: 26px !important;
        height: 26px !important;
        border-radius: 50% !important;
        background: #1a73e8 !important;
        color: #ffffff !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: system-ui, -apple-system, sans-serif !important;
        font-size: 15px !important;
        font-weight: bold !important;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important;
        pointer-events: none !important;
        opacity: 0 !important;
        transform: scale(0.5) !important;
        transition: opacity 0.15s ease-out, transform 0.15s ease-out !important;
      `;
      badge.textContent = '✓';
      (document.body || document.documentElement).appendChild(badge);
    }
    requestAnimationFrame(() => {
      badge.style.setProperty('opacity', '1', 'important');
      badge.style.setProperty('transform', 'scale(1)', 'important');
    });
    setTimeout(() => {
      badge.style.setProperty('opacity', '0', 'important');
      badge.style.setProperty('transform', 'scale(0.5)', 'important');
      setTimeout(() => badge.remove(), 150);
    }, 500);
  } catch (e) {}
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    (document.body || document.documentElement).appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}
})();
