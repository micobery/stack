#!/usr/bin/env python3
"""
Build script to package Stack Overflow ClipboardAI Copilot as:
1. Google Chrome / Edge / Brave Extension (Manifest V3)
2. Mozilla Firefox Extension (Manifest V3 with Gecko settings & sidebar_action)
Also generates ready-to-install .zip packages for both browsers.
"""

import os
import shutil
import zipfile
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
CHROME_DIR = os.path.join(BASE_DIR, 'extension-chrome')
FIREFOX_DIR = os.path.join(BASE_DIR, 'extension-firefox')

# --------------------------------------------------------------------------
# --------------------------------------------------------------------------
# Content Script (Injected into pages for 100% reliable DOM & Clipboard access)
# --------------------------------------------------------------------------
CONTENT_JS = '''// ==========================================================================
// Google Translate me — Content Script
// Handles Clipboard writing, Discreet Floating Badges, Hotkeys & Screen Cropping
// ==========================================================================

(() => {
if (window.__GT_COPILOT_VER__ === 4) return;
try {
  if (typeof window.__GT_COPILOT_CLEANUP__ === 'function') {
    window.__GT_COPILOT_CLEANUP__();
  }
} catch (e) {}
window.__GT_COPILOT_VER__ = 4;

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

// Normalize selected text while preserving Persian ZWNJ (\u200C) and rejecting invisible-only placeholders
function cleanSelectionText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw.replace(/^[\\s\\u200B\\uFEFF]+|[\\s\\u200B\\uFEFF]+$/g, '');
  const visible = cleaned.replace(/[\\s\\u00A0\\u200B\\u200C\\u200D\\uFEFF]+/g, '');
  return visible.length > 0 ? cleaned : '';
}

function readInputSelection(el) {
  if (!el) return '';
  if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|tel|password|email|number)?$/i.test(el.type || 'text'))) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (typeof start === 'number' && typeof end === 'number' && end > start) {
      return cleanSelectionText(el.value.substring(start, end));
    }
  }
  return '';
}

function readSelectionFromDocument(doc, depth = 0) {
  if (!doc || depth > 4) return '';
  try {
    const win = doc.defaultView;
    const winSel = win && win.getSelection ? cleanSelectionText(win.getSelection().toString()) : '';
    if (winSel) return winSel;

    const docSel = doc.getSelection ? cleanSelectionText(doc.getSelection().toString()) : '';
    if (docSel) return docSel;

    // Active input / textarea + recursive open Shadow DOM traversal
    let active = doc.activeElement;
    let shadowGuard = 0;
    while (active && shadowGuard < 8) {
      shadowGuard++;
      const inputSel = readInputSelection(active);
      if (inputSel) return inputSel;

      if (active.shadowRoot) {
        try {
          if (typeof active.shadowRoot.getSelection === 'function') {
            const sSel = cleanSelectionText(active.shadowRoot.getSelection().toString());
            if (sSel) return sSel;
          }
        } catch (e) {}
        const nextActive = active.shadowRoot.activeElement;
        if (!nextActive || nextActive === active) break;
        active = nextActive;
      } else {
        break;
      }
    }

    // Prioritize Google Docs hidden event target iframe if present
    const docsIframe = doc.querySelector ? doc.querySelector('iframe.docs-texteventtarget-iframe') : null;
    if (docsIframe) {
      try {
        const docsSel = readSelectionFromDocument(docsIframe.contentDocument, depth + 1);
        if (docsSel) return docsSel;
      } catch (e) {}
    }

    // Check any other accessible same-origin iframes
    const iframes = doc.querySelectorAll ? doc.querySelectorAll('iframe') : [];
    for (let i = 0; i < iframes.length && i < 20; i++) {
      const f = iframes[i];
      if (f === docsIframe) continue;
      try {
        if (f.contentDocument) {
          const fSel = readSelectionFromDocument(f.contentDocument, depth + 1);
          if (fSel) return fSel;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return '';
}

// Read currently selected text from normal DOM, Shadow DOM, inputs, or same-origin iframes
function getSelectedText() {
  return readSelectionFromDocument(document, 0);
}

// Listen for commands from Background Script (Top Frame only to avoid duplicate overlays/ticks across iframes)
const onRuntimeMessage = (msg, sender, sendResponse) => {
  if (!IS_TOP_FRAME) return false;

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
          sendResponse({ text: cleanSelectionText(clip || '') });
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
      safeSendMessage({ action: 'smart_trigger_resolve' });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'execute_crop_canvas' && msg.fullDataUrl && msg.rect) {
    cropAndSendImage(msg.fullDataUrl, msg.rect);
    sendResponse({ ok: true });
    return true;
  }

  return false;
};

if (IS_TOP_FRAME && ext.runtime && ext.runtime.onMessage) {
  ext.runtime.onMessage.addListener(onRuntimeMessage);
}

// Smart Trigger (Ctrl+Shift+A / Ctrl+Shift+X / Ctrl+Shift+A+X / Ctrl+Shift+Right-Click)
// - If text is selected (normal DOM, iframe, Shadow DOM, or Google Docs/Canvas editor): solves in background & copies answer
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
  } else {
    // Delegate to background so it can inspect all frames + Google Docs / canvas editors before falling back to crop
    safeSendMessage({ action: 'smart_trigger_resolve' });
  }
}

const onMouseDown = (e) => {
  if (e.button === 2 && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    suppressNextContextMenuUntil = Date.now() + 1500;
    handleSmartTrigger();
  }
};

const onContextMenu = (e) => {
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
};

const onAuxClick = (e) => {
  if (e.button === 2 && Date.now() < suppressNextContextMenuUntil) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
};

// Keyboard hotkeys on web page (layout-independent via e.code, works in both Persian & English layouts):
// - Ctrl + Shift + A / Ctrl + Shift + X (or Ctrl + Shift + A + X): Smart Solve Text / Crop Screen
// - Ctrl + Alt + Shift: Direct Screen Crop
const onKeyDown = (e) => {
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
};

window.addEventListener('mousedown', onMouseDown, true);
window.addEventListener('contextmenu', onContextMenu, true);
window.addEventListener('auxclick', onAuxClick, true);
window.addEventListener('keydown', onKeyDown, true);

window.__GT_COPILOT_CLEANUP__ = () => {
  try { window.removeEventListener('mousedown', onMouseDown, true); } catch (e) {}
  try { window.removeEventListener('contextmenu', onContextMenu, true); } catch (e) {}
  try { window.removeEventListener('auxclick', onAuxClick, true); } catch (e) {}
  try { window.removeEventListener('keydown', onKeyDown, true); } catch (e) {}
  try {
    if (IS_TOP_FRAME && ext.runtime && ext.runtime.onMessage && ext.runtime.onMessage.removeListener) {
      ext.runtime.onMessage.removeListener(onRuntimeMessage);
    }
  } catch (e) {}
};

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
      const base64 = croppedDataUrl.replace(/^data:image\\/png;base64,/, '');

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
'''

# --------------------------------------------------------------------------
# Background Service Worker / Script (Modular ES Module)
# --------------------------------------------------------------------------
BACKGROUND_JS = '''// ==========================================================================
// Stack Overflow ClipboardAI Copilot — Background Script (MV3)
// Handles Context Menu Solving, Global Hotkeys, Clipboard Writing & Notifications
// Fully compatible with both Chrome (Service Worker) and Firefox (Background Script)
// ==========================================================================

import { callAI, PROVIDERS } from './js/providers.js';

const ext = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULTS = {
  currentProvider: 'custom_openai', // GapGPT
  apiKeys: {
    custom_openai: 'sk-F4T2AxOQw9HcnrUBdfsbTF7Fsu5JZelWBjBRhBkeNxpSLsNX',
    avalai: 'aa-d7tPVrnvwXyu03TJGpXfSPMkaesXshv98TqFM3P6p6aPmWzN',
    arvancloud: '44f82d65-9e2b-536f-a7af-c4a353735f3e',
    gemini: '',
    openai: ''
  },
  apiUrls: {
    custom_openai: 'https://api.gapgpt.app/v1',
    avalai: 'https://api.avalai.ir/v1',
    arvancloud: 'https://api.arvancloudai.ir/v1',
    openai: 'https://api.openai.com/v1'
  },
  selectedModels: {
    custom_openai: 'deepseek-v4.1-flash',
    avalai: 'deepseek-v4.1-flash',
    arvancloud: 'DeepSeek-V4.1-Flash',
    gemini: 'gemini-3.8-flash',
    openai: 'gpt-4o-mini'
  },
  currentPreset: 'l78-descriptive',
  systemPrompt: `تو یک کارشناس ارشد جاوا (سطح ۷–۸) هستی و برای هر سؤال تشریحی فقط ۲ دقیقه وقت تایپ داری. پاسخ باید خیلی کوتاه، جمع‌وجور، مستقیم و ۱۰۰٪ شبیه تایپ سریع یک انسان در ۲ دقیقه باشد تا به هیچ وجه طولانی یا شبیه AI نباشد. مطلقاً سلام، مقدمه، توضیح اضافه یا جمع‌بندی ننویس.

قانون سخت حجم (خط قرمز ۲ دقیقه):
- برای هر سؤال فقط **۱ پاراگراف کوتاه** با **حداکثر ۳ تا ۴ جمله‌ی فشرده (حدود ۵۰ تا ۸۵ کلمه / ۳ تا ۴ خط)** بنویس. هرگز بیشتر از ۴ جمله یا بیش از ۱ پاراگراف نشود و اصلاً لفتش نده.

در همین ۳ تا ۴ جمله‌ی کوتاه، این ۴ نکته را فشرده و پیوسته جا بده:
۱. جمله‌ی اول: ریشه‌ی مشکل یا ریسک اصلی دقیقاً در همین سناریو.
۲. جمله‌ی دوم و سوم: راه‌حل عملی همراه با مقایسه‌ی خیلی کوتاه با یک جایگزین، مهم‌ترین حالت شکست (مثل Split Brain/Fencing Token، Hot Key، Noisy Neighbor، Race Condition، Failover، High Cardinality) و بده‌بستان اصلی (تأخیر/هزینه/پیچیدگی). در عیب‌یابی فقط گام کم‌سربار در تولید (متریک، JFR/Flame Graph) بگو و کار مخرب مثل Heap Dump وسط پیک نگو.
۳. جمله‌ی آخر: کوتاه بگو با چه متریک یا آزمونی (P99، Lag، Canary، Fault Injection، تست هم‌زمانی) نتیجه‌اش را می‌سنجی.

قوانین غیرقابل‌تشخیص بودن از AI:
- فقط متن ساده: هیچ **بولد**، هیچ بولت‌پوینت، هیچ شماره‌گذاری، هیچ ایموجی، هیچ خط تیره‌ی بلند (— یا –) و هیچ تیتری داخل پاسخ نیاور.
- لحن کاملاً مستقیم، ساده و اول‌شخص دولوپری باشد («اول چک می‌کنم...»، «مشکل این است که...»، «به جایش...»، «هزینه‌اش این است که...»).
- اکیداً از این کلمات لو‌دهنده‌ی AI و ترجمه‌زدگی دوری کن: «در دنیای واقعی»، «بسیار حیاتی است»، «نقش کلیدی»، «رویکرد جامع»، «تضمین می‌کند»، «چالش‌های متعددی»، «از یک سو ... از سوی دیگر»، «شایان ذکر است»، «در واقع»، «به طور کلی»، «در نهایت»، «جمع‌بندی»، «می‌باشد»، «گردید/می‌گردد»، «به منظور»، «توسط ... انجام می‌شود»، «مورد استفاده قرار می‌گیرد»، «اقدام به ... نمودن».
- اصطلاحات فنی به انگلیسی بمانند (Circuit Breaker، Outbox، Fencing Token، JFR، P99، SLO، RLS) و پسوند فارسی بدون فاصله بچسبد (Threadها، APIهای).
- اگر چند سؤال در ورودی است، هرکدام را جدا با شماره‌ی خودش (مثل q1، q2 یا سوال ۱، سوال ۲) و هرکدام در همان سقف ۳ تا ۴ جمله جواب بده.`
};

// Cross-browser helper: Query currently active tab
async function getActiveTab() {
  const tabsApi = ext.tabs || (typeof chrome !== 'undefined' ? chrome.tabs : null);
  if (!tabsApi) return null;
  return new Promise(resolve => {
    try {
      const res = tabsApi.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0] ? tabs[0] : null);
      });
      if (res && typeof res.then === 'function') {
        res.then(tabs => resolve(tabs && tabs[0] ? tabs[0] : null)).catch(() => resolve(null));
      }
    } catch (e) {
      resolve(null);
    }
  });
}

// Show action badge icon in browser toolbar (instant feedback)
let badgeClearTimer = null;
function setActionBadge(text, color = '#1a73e8', clearAfterMs = 0) {
  try {
    const actionApi = ext.action || (typeof chrome !== 'undefined' ? chrome.action : null);
    if (!actionApi || !actionApi.setBadgeText) return;
    if (badgeClearTimer) {
      clearTimeout(badgeClearTimer);
      badgeClearTimer = null;
    }
    actionApi.setBadgeText({ text: String(text || '') });
    if (color && actionApi.setBadgeBackgroundColor) {
      actionApi.setBadgeBackgroundColor({ color });
    }
    if (clearAfterMs > 0) {
      badgeClearTimer = setTimeout(() => {
        try {
          actionApi.setBadgeText({ text: '' });
        } catch (e) {}
      }, clearAfterMs);
    }
  } catch (e) {}
}

function showActionBadge() {
  setActionBadge('✓', '#1a73e8', 700);
}

const isFirefoxBrowser = typeof browser !== 'undefined';

// Cross-browser safe tabs.sendMessage (handles Firefox Promise API & Chrome Callback API)
async function sendTabMessage(tabId, message, options = undefined) {
  try {
    if (isFirefoxBrowser && browser.tabs && browser.tabs.sendMessage) {
      return options
        ? await browser.tabs.sendMessage(tabId, message, options)
        : await browser.tabs.sendMessage(tabId, message);
    }
    return await new Promise((resolve) => {
      const cb = (res) => {
        if (chrome.runtime?.lastError) resolve(null);
        else resolve(res ?? { ok: true });
      };
      if (options) {
        chrome.tabs.sendMessage(tabId, message, options, cb);
      } else {
        chrome.tabs.sendMessage(tabId, message, cb);
      }
    });
  } catch (e) {
    return null;
  }
}

// Cross-browser safe captureVisibleTab
async function captureTabImage(windowId) {
  try {
    if (isFirefoxBrowser && browser.tabs && browser.tabs.captureVisibleTab) {
      return await browser.tabs.captureVisibleTab(windowId || null, { format: 'png' });
    }
    return await new Promise((resolve) => {
      chrome.tabs.captureVisibleTab(windowId || null, { format: 'png' }, (result) => {
        if (chrome.runtime?.lastError) resolve(null);
        else resolve(result || null);
      });
    });
  } catch (e) {
    return null;
  }
}

// Send to top-frame content script, auto-injecting content.js if tab was open before reload
async function ensureContentScriptAndSend(tabId, message) {
  let res = await sendTabMessage(tabId, message, { frameId: 0 });
  if (res) return res;

  const scriptingApi = ext.scripting || (typeof chrome !== 'undefined' ? chrome.scripting : null);
  if (scriptingApi && scriptingApi.executeScript) {
    try {
      await scriptingApi.executeScript({
        target: { tabId, allFrames: true },
        files: ['content.js']
      });
      res = await sendTabMessage(tabId, message, { frameId: 0 });
      return res;
    } catch (e) {
      console.warn('Could not auto-inject content.js:', e);
    }
  }
  return null;
}

// Normalize selected text while preserving Persian ZWNJ (\\u200C) and rejecting invisible-only placeholders
function cleanSelectionText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw.replace(/^[\\s\\u200B\\uFEFF]+|[\\s\\u200B\\uFEFF]+$/g, '');
  const visible = cleaned.replace(/[\\s\\u00A0\\u200B\\u200C\\u200D\\uFEFF]+/g, '');
  return visible.length > 0 ? cleaned : '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Extension-Origin Clipboard Helpers (NEVER steals focus from Google Docs / Canvas editors) ---
const OFFSCREEN_PATH = 'offscreen.html';

async function ensureOffscreenDocument() {
  if (isFirefoxBrowser || typeof chrome === 'undefined' || !chrome.offscreen || !chrome.offscreen.createDocument) {
    return false;
  }
  try {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });
      if (contexts && contexts.length > 0) return true;
    }
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['CLIPBOARD'],
      justification: 'Read and write clipboard without disturbing webpage focus or canvas text selection'
    });
    return true;
  } catch (e) {
    if (String(e?.message || e).includes('Only a single offscreen')) return true;
    return false;
  }
}

async function sendOffscreenMessage(payload) {
  const ready = await ensureOffscreenDocument();
  if (!ready) return null;
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 1500);
    try {
      chrome.runtime.sendMessage({ target: 'offscreen', ...payload }, (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (chrome.runtime?.lastError) resolve(null);
        else resolve(res || null);
      });
    } catch (e) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

async function readExtensionClipboard() {
  // Firefox background page has direct DOM & navigator.clipboard access
  if (typeof document !== 'undefined') {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        return { ok: true, text: String(text ?? '') };
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      (document.body || document.documentElement).appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('paste');
      const text = ta.value || '';
      ta.remove();
      return { ok: true, text };
    } catch (e) {
      return { ok: false, text: '' };
    }
  }

  // Chrome MV3 service worker uses offscreen document
  const res = await sendOffscreenMessage({ action: 'clipboard_read' });
  if (res && res.ok) {
    return { ok: true, text: String(res.text ?? '') };
  }
  return { ok: false, text: '' };
}

async function writeExtensionClipboard(text) {
  const value = String(text ?? '');
  // Firefox background page has direct DOM & navigator.clipboard access
  if (typeof document !== 'undefined') {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (e) {}
    try {
      const onCopy = (e) => {
        e.preventDefault();
        e.clipboardData.setData('text/plain', value);
      };
      document.addEventListener('copy', onCopy, true);
      const ta = document.createElement('textarea');
      ta.value = value || ' ';
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      (document.body || document.documentElement).appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.removeEventListener('copy', onCopy, true);
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  // Chrome MV3 service worker uses offscreen document
  const res = await sendOffscreenMessage({ action: 'clipboard_write', text: value });
  return Boolean(res && res.ok);
}

// Read selected text across all frames, Shadow DOM, iframes, and canvas/custom editors (Google Docs, Sheets, Slides, Figma, Notion, Monaco, etc.)
async function getSelectionFromTab(tabId, options = {}) {
  const { allowClipboardProbe = false } = options;
  const scriptingApi = ext.scripting || (typeof chrome !== 'undefined' ? chrome.scripting : null);
  let isCustomEditor = false;

  // Layer 1: Native DOM selection across all frames + Shadow DOM + inputs + accessible iframes (.docs-texteventtarget-iframe)
  if (scriptingApi && scriptingApi.executeScript) {
    try {
      const results = await scriptingApi.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          const clean = (raw) => {
            if (!raw || typeof raw !== 'string') return '';
            const c = raw.replace(/^[\\s\\u200B\\uFEFF]+|[\\s\\u200B\\uFEFF]+$/g, '');
            return c.replace(/[\\s\\u00A0\\u200B\\u200C\\u200D\\uFEFF]+/g, '').length > 0 ? c : '';
          };
          const readInput = (el) => {
            if (!el) return '';
            if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|tel|password|email|number)?$/i.test(el.type || 'text'))) {
              const s = el.selectionStart;
              const e = el.selectionEnd;
              if (typeof s === 'number' && typeof e === 'number' && e > s) {
                return clean(el.value.substring(s, e));
              }
            }
            return '';
          };
          const readDoc = (doc, depth = 0) => {
            if (!doc || depth > 4) return '';
            try {
              const win = doc.defaultView;
              const wSel = win && win.getSelection ? clean(win.getSelection().toString()) : '';
              if (wSel) return wSel;
              const dSel = doc.getSelection ? clean(doc.getSelection().toString()) : '';
              if (dSel) return dSel;

              let active = doc.activeElement;
              let guard = 0;
              while (active && guard < 8) {
                guard++;
                const iSel = readInput(active);
                if (iSel) return iSel;
                if (active.shadowRoot) {
                  try {
                    if (typeof active.shadowRoot.getSelection === 'function') {
                      const sSel = clean(active.shadowRoot.getSelection().toString());
                      if (sSel) return sSel;
                    }
                  } catch (e) {}
                  const next = active.shadowRoot.activeElement;
                  if (!next || next === active) break;
                  active = next;
                } else {
                  break;
                }
              }

              const docsIframe = doc.querySelector ? doc.querySelector('iframe.docs-texteventtarget-iframe') : null;
              if (docsIframe) {
                try {
                  const docsSel = readDoc(docsIframe.contentDocument, depth + 1);
                  if (docsSel) return docsSel;
                } catch (e) {}
              }

              const iframes = doc.querySelectorAll ? doc.querySelectorAll('iframe') : [];
              for (let i = 0; i < iframes.length && i < 20; i++) {
                const f = iframes[i];
                if (f === docsIframe) continue;
                try {
                  if (f.contentDocument) {
                    const fSel = readDoc(f.contentDocument, depth + 1);
                    if (fSel) return fSel;
                  }
                } catch (e) {}
              }
            } catch (e) {}
            return '';
          };

          const detectCustom = () => {
            try {
              const host = (location.hostname || '').toLowerCase();
              if (/(^|\\.)(docs\\.google\\.com|figma\\.com|canva\\.com|miro\\.com|notion\\.so|notion\\.site|overleaf\\.com|officeapps\\.live\\.com|onedrive\\.live\\.com|sharepoint\\.com|lucid\\.app|coda\\.io|airtable\\.com|excalidraw\\.com|vscode\\.dev|github\\.dev|colab\\.research\\.google\\.com|codesandbox\\.io|stackblitz\\.com)$/.test(host)) {
                return true;
              }
              if (document.querySelector('iframe.docs-texteventtarget-iframe, .kix-appview-editor, .kix-canvas-tile-content, .punch-viewer-content, .grid-container, .monaco-editor, .CodeMirror, .cm-editor, .ace_editor, .ProseMirror, .ql-editor, .notion-page-content, .pdfViewer, embed[type="application/pdf"]')) {
                return true;
              }
              const active = document.activeElement;
              if (active && (active.isContentEditable || active.tagName === 'IFRAME' || active.tagName === 'EMBED' || active.tagName === 'OBJECT')) {
                return true;
              }
              const canvases = document.querySelectorAll('canvas');
              for (let i = 0; i < canvases.length && i < 15; i++) {
                const rect = canvases[i].getBoundingClientRect();
                if (rect.width >= 200 && rect.height >= 150) return true;
              }
            } catch (e) {}
            return false;
          };

          return {
            text: readDoc(document, 0),
            isCustom: detectCustom()
          };
        }
      });

      if (Array.isArray(results)) {
        for (const r of results) {
          if (r?.result?.isCustom) isCustomEditor = true;
          const t = cleanSelectionText(r?.result?.text || '');
          if (t) return t;
        }
      }
    } catch (e) {}
  }

  // Fallback message to content script for Layer 1
  const res = await sendTabMessage(tabId, { action: 'get_selection_only' }, { frameId: 0 });
  const directText = cleanSelectionText(res?.text || '');
  if (directText) return directText;

  if (!scriptingApi || !scriptingApi.executeScript) return '';
  if (!allowClipboardProbe && !isCustomEditor) return '';

  // Layer 2: Non-destructive MAIN-world synthetic copy event probe (zero OS clipboard modification)
  try {
    const synthResults = await scriptingApi.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      func: () => {
        const clean = (raw) => {
          if (!raw || typeof raw !== 'string') return '';
          const c = raw.replace(/^[\\s\\u200B\\uFEFF]+|[\\s\\u200B\\uFEFF]+$/g, '');
          return c.replace(/[\\s\\u00A0\\u200B\\u200C\\u200D\\uFEFF]+/g, '').length > 0 ? c : '';
        };
        const htmlToText = (html) => {
          if (!html) return '';
          try {
            const div = document.createElement('div');
            div.innerHTML = html;
            return clean(div.innerText || div.textContent || '');
          } catch (e) {
            return '';
          }
        };

        const targets = [];
        const addTarget = (el) => {
          if (el && !targets.includes(el)) targets.push(el);
        };

        // Prioritize Google Docs text event target iframe
        const docsIframe = document.querySelector('iframe.docs-texteventtarget-iframe');
        if (docsIframe && docsIframe.contentDocument) {
          const iDoc = docsIframe.contentDocument;
          addTarget(iDoc.querySelector('[contenteditable="true"]'));
          addTarget(iDoc.activeElement);
          addTarget(iDoc.body);
        }

        // Deep active element (Shadow DOM & same-origin iframes)
        let active = document.activeElement;
        let guard = 0;
        while (active && guard < 6) {
          guard++;
          addTarget(active);
          if (active.shadowRoot && active.shadowRoot.activeElement && active.shadowRoot.activeElement !== active) {
            active = active.shadowRoot.activeElement;
          } else if (active.tagName === 'IFRAME') {
            try {
              const iDoc = active.contentDocument;
              if (iDoc) {
                addTarget(iDoc.querySelector('[contenteditable="true"]'));
                addTarget(iDoc.activeElement);
                addTarget(iDoc.body);
              }
            } catch (e) {}
            break;
          } else {
            break;
          }
        }

        const editorInputs = document.querySelectorAll('.monaco-editor textarea.inputarea, .CodeMirror textarea, .cm-content, .ace_text-input');
        for (let i = 0; i < editorInputs.length && i < 4; i++) addTarget(editorInputs[i]);
        addTarget(document.body);

        for (const target of targets) {
          try {
            if (typeof DataTransfer === 'undefined' || typeof ClipboardEvent === 'undefined') break;
            const dt = new DataTransfer();
            let capturedPlain = '';
            let capturedHtml = '';
            try {
              const origSetData = dt.setData.bind(dt);
              dt.setData = function(type, val) {
                const t = String(type || '').toLowerCase();
                if ((t === 'text/plain' || t === 'text') && val) capturedPlain = String(val);
                else if (t === 'text/html' && val) capturedHtml = String(val);
                return origSetData(type, val);
              };
            } catch (e) {}

            const beforeText = target.isContentEditable ? (target.innerText || '') : null;
            const ev = new ClipboardEvent('copy', {
              bubbles: true,
              cancelable: true,
              clipboardData: dt
            });
            target.dispatchEvent(ev);

            const plain = clean(capturedPlain || dt.getData('text/plain') || '');
            if (plain) return plain;

            const fromHtml = htmlToText(capturedHtml || dt.getData('text/html') || '');
            if (fromHtml) return fromHtml;

            const ownerDoc = target.ownerDocument || document;
            const postSel = ownerDoc.getSelection ? clean(ownerDoc.getSelection().toString()) : '';
            if (postSel) return postSel;

            if (beforeText !== null) {
              const afterText = target.innerText || '';
              if (afterText !== beforeText) {
                const diffText = clean(afterText);
                if (diffText) return diffText;
              }
            }
          } catch (e) {}
        }
        return '';
      }
    });

    if (Array.isArray(synthResults)) {
      for (const r of synthResults) {
        const t = cleanSelectionText(r?.result || '');
        if (t) return t;
      }
    }
  } catch (e) {}

  // Layer 3: Extension-origin clipboard sentinel + trusted ISOLATED-world execCommand('copy')
  // Works reliably in Google Docs / Sheets / Slides / Figma / Canva / Notion / Office Online / PDF viewers
  // without stealing focus prior to copy and without leaking stale clipboard contents.
  const prevClipState = await readExtensionClipboard();
  if (!prevClipState.ok) return '';

  const sentinel = `__GT_SEL_PROBE_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
  const sentinelWritten = await writeExtensionClipboard(sentinel);
  if (!sentinelWritten) return '';

  let extracted = '';
  try {
    let anyTriggered = false;
    try {
      const copyResults = await scriptingApi.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          const clean = (raw) => {
            if (!raw || typeof raw !== 'string') return '';
            const c = raw.replace(/^[\\s\\u200B\\uFEFF]+|[\\s\\u200B\\uFEFF]+$/g, '');
            return c.replace(/[\\s\\u00A0\\u200B\\u200C\\u200D\\uFEFF]+/g, '').length > 0 ? c : '';
          };
          try {
            // 1. Google Docs / Slides / Sheets hidden text event target iframe
            const docsIframe = document.querySelector('iframe.docs-texteventtarget-iframe');
            if (docsIframe && docsIframe.contentDocument) {
              const iDoc = docsIframe.contentDocument;
              const editable = iDoc.querySelector('[contenteditable="true"]') || iDoc.activeElement || iDoc.body;
              try { docsIframe.contentWindow?.focus(); } catch (e) {}
              try { editable?.focus?.({ preventScroll: true }); } catch (e) {}
              const ok = iDoc.execCommand('copy');
              const direct = iDoc.getSelection ? clean(iDoc.getSelection().toString()) : '';
              if (direct) return { triggered: true, directText: direct };
              if (ok) return { triggered: true, directText: '' };
              // Fallback to main document copy if iframe returned false
              const topOk = document.execCommand('copy');
              return { triggered: Boolean(topOk || true), directText: '' };
            }

            // 2. Active frame or focused same-origin iframe (Figma, Canva, Monaco, CodeMirror, Notion, Office Online, PDF.js)
            if (document.hasFocus()) {
              const active = document.activeElement;
              if (active && active.tagName === 'IFRAME') {
                try {
                  if (active.contentDocument) {
                    const ok = active.contentDocument.execCommand('copy');
                    if (ok) return { triggered: true, directText: '' };
                  }
                } catch (e) {}
              }
              const ok = document.execCommand('copy');
              return { triggered: Boolean(ok || true), directText: '' };
            }
          } catch (e) {}
          return { triggered: false, directText: '' };
        }
      });

      if (Array.isArray(copyResults)) {
        for (const r of copyResults) {
          if (r?.result?.triggered) anyTriggered = true;
          const direct = cleanSelectionText(r?.result?.directText || '');
          if (direct) {
            extracted = direct;
            break;
          }
        }
      }
    } catch (e) {}

    // If focus briefly left the tab (e.g. closing browser context menu), trigger copy on frame 0
    if (!extracted && !anyTriggered) {
      try {
        await scriptingApi.executeScript({
          target: { tabId, frameIds: [0] },
          func: () => {
            try {
              const docsIframe = document.querySelector('iframe.docs-texteventtarget-iframe');
              if (docsIframe && docsIframe.contentDocument) {
                const iDoc = docsIframe.contentDocument;
                const editable = iDoc.querySelector('[contenteditable="true"]') || iDoc.activeElement || iDoc.body;
                try { docsIframe.contentWindow?.focus(); } catch (e) {}
                try { editable?.focus?.({ preventScroll: true }); } catch (e) {}
                if (iDoc.execCommand('copy')) return true;
              }
              return document.execCommand('copy');
            } catch (e) {
              return false;
            }
          }
        });
      } catch (e) {}
    }

    // Poll briefly to support both synchronous copy handlers and async navigator.clipboard.write handlers
    if (!extracted) {
      const delays = [25, 45, 70];
      for (const waitMs of delays) {
        await sleep(waitMs);
        const afterClip = await readExtensionClipboard();
        if (afterClip.ok && afterClip.text !== sentinel) {
          extracted = cleanSelectionText(afterClip.text);
          break;
        }
      }
    }
  } finally {
    // Always restore previous clipboard if no real selection was extracted so nothing is lost or polluted
    if (!extracted) {
      await writeExtensionClipboard(prevClipState.text);
    }
  }

  return extracted;
}

let lastBackgroundSmartAt = 0;

// Unified Smart Trigger: selected text -> solve & copy; no selection -> open screen crop
async function handleSmartActionForTab(tab, options = {}) {
  const now = Date.now();
  if (!options.bypassDebounce && now - lastBackgroundSmartAt < 500) return;
  lastBackgroundSmartAt = now;

  const activeTab = tab?.id ? tab : await getActiveTab();
  if (!activeTab?.id) return;

  const selectedText = await getSelectionFromTab(activeTab.id, {
    allowClipboardProbe: Boolean(options.allowClipboardProbe)
  });
  if (selectedText) {
    try {
      setActionBadge('...', '#f59e0b');
      await solveQuestion(selectedText, activeTab.id);
      await showTabCheckmark(activeTab.id);
    } catch (err) {
      console.error('Error in smart solve:', err);
      setActionBadge('!', '#dc2626', 2500);
    }
  } else {
    await ensureContentScriptAndSend(activeTab.id, { action: 'start_crop_selection' });
  }
}

// Helper: Show discreet floating checkmark in bottom-right corner for ~500ms
async function showTabCheckmark(tabId) {
  showActionBadge();

  let targetId = tabId;
  if (!targetId) {
    const tab = await getActiveTab();
    targetId = tab?.id;
  }
  if (!targetId) return;

  // 1. Try sending message to content script first (Primary and 100% reliable in both Firefox & Chrome)
  const sent = await sendTabMessage(targetId, { action: 'show_tick' }, { frameId: 0 });
  if (sent) return;

  // 2. Fallback: inject via scripting.executeScript (browser.scripting or chrome.scripting)
  const scriptingApi = ext.scripting || (typeof chrome !== 'undefined' ? chrome.scripting : null);
  if (scriptingApi && scriptingApi.executeScript) {
    try {
      await scriptingApi.executeScript({
        target: { tabId: targetId },
        func: () => {
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
        }
      });
    } catch (e) {}
  }
}

// Helper: Safely write solution text into the user's clipboard
async function writeTextToClipboard(tabId, text) {
  // 0. Prefer extension-origin clipboard (Chrome Offscreen / Firefox Background Page)
  //    so copying never steals focus or disrupts caret/selection in Google Docs or rich editors
  if (await writeExtensionClipboard(text)) {
    return true;
  }

  let targetId = tabId;
  if (!targetId) {
    const tab = await getActiveTab();
    targetId = tab?.id;
  }
  if (!targetId) return false;

  // 1. Try sending to content script first
  const res = await sendTabMessage(targetId, { action: 'copy_text', text, showTick: false }, { frameId: 0 });
  if (res && res.ok) return true;

  // 2. Fallback: inject via scripting API
  const scriptingApi = ext.scripting || (typeof chrome !== 'undefined' ? chrome.scripting : null);
  if (scriptingApi && scriptingApi.executeScript) {
    try {
      await scriptingApi.executeScript({
        target: { tabId: targetId },
        func: async (content) => {
          const fallbackCopy = () => {
            const ta = document.createElement('textarea');
            ta.value = content;
            ta.style.position = 'fixed';
            ta.style.top = '-9999px';
            ta.style.left = '-9999px';
            ta.style.opacity = '0';
            (document.body || document.documentElement).appendChild(ta);
            ta.focus({ preventScroll: true });
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
          };
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(content);
              return true;
            }
          } catch (e) {}
          return fallbackCopy();
        },
        args: [text]
      });
      return true;
    } catch (e) {}
  }
  return false;
}

// Helper: Solve a question using active provider and settings
async function solveQuestion(question, tabId, image = null) {
  let stored = {};
  try {
    const storageApi = ext.storage?.local || (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
    if (storageApi) {
      stored = await new Promise(resolve => {
        try {
          const res = storageApi.get(null, resolve);
          if (res && typeof res.then === 'function') {
            res.then(resolve).catch(() => resolve({}));
          }
        } catch (e) {
          resolve({});
        }
      });
    }
  } catch (e) {
    stored = {};
  }

  const provider = stored.cbai_provider || DEFAULTS.currentProvider;
  const keys = stored.cbai_api_keys || DEFAULTS.apiKeys;
  const urls = stored.cbai_api_urls || DEFAULTS.apiUrls;
  const models = stored.cbai_models || DEFAULTS.selectedModels;
  const prompt = (stored.cbai_l78_presets_v3 && stored.cbai_prompt) ? stored.cbai_prompt : DEFAULTS.systemPrompt;

  let apiKey = keys[provider] || DEFAULTS.apiKeys[provider] || '';
  let baseUrl = urls[provider] || DEFAULTS.apiUrls[provider] || 'https://api.gapgpt.app/v1';

  // Ensure GapGPT is not using ArvanCloud credentials if previously cross-saved
  if (provider === 'custom_openai') {
    if (!baseUrl || baseUrl.includes('arvancloud') || baseUrl.includes('openrouter.ai')) {
      baseUrl = DEFAULTS.apiUrls.custom_openai;
    }
    if (!apiKey || apiKey.startsWith('44f82d65') || apiKey.startsWith('aa-')) {
      apiKey = DEFAULTS.apiKeys.custom_openai;
    }
  }

  let model = models[provider] || DEFAULTS.selectedModels[provider] || 'deepseek-v4.1-flash';
  if (model === 'custom') {
    const customModels = stored.cbai_custom_models || {};
    model = customModels[provider] || DEFAULTS.selectedModels[provider] || 'deepseek-v4.1-flash';
  }

  console.log(`[Google Translate me] Solving with Provider: ${provider}, Model: ${model}, Prompt length: ${prompt.length} chars, HasImage: ${Boolean(image)}`);

  const startTime = Date.now();
  const answer = await callAI({
    provider,
    apiKey,
    baseUrl,
    model,
    systemPrompt: prompt,
    text: question || '',
    image: image
  });
  const durationMs = Date.now() - startTime;

  // Write to clipboard
  await writeTextToClipboard(tabId, answer);

  // Save to history so popup/sidepanel has it immediately
  const inputLabel = question || (image ? '📸 Screenshot Analysis' : '');
  try {
    const history = stored.cbai_history || [];
    history.unshift({
      id: Date.now(),
      timestamp: Date.now(),
      time: new Date().toLocaleTimeString(),
      input: inputLabel,
      output: answer,
      question: inputLabel,
      answer,
      provider,
      model,
      durationMs,
      hasImage: Boolean(image)
    });
    const storageApi = ext.storage?.local || (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
    storageApi?.set?.({ cbai_history: history.slice(0, 30) });
  } catch (e) {}

  // Broadcast live answer to any open extension views (sidepanel / popup / tab)
  try {
    const p = ext.runtime.sendMessage({
      action: 'background_answer_ready',
      question: question || '',
      answer
    });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {}

  return answer;
}

// --- Lifecycle & Initialization ---
const runtimeApi = ext.runtime || (typeof chrome !== 'undefined' ? chrome.runtime : null);
if (runtimeApi && runtimeApi.onInstalled) {
  runtimeApi.onInstalled.addListener(async () => {
    // Create Context Menus
    // Include page/editable/frame/link on google_translate_me so Shift+Right-Click in canvas/custom-selection
    // environments (Google Docs, Sheets, Slides, Figma, Notion, etc.) shows "Google Translate me" instead of only screenshot crop.
    try {
      const menusApi = ext.contextMenus || ext.menus || (typeof chrome !== 'undefined' ? chrome.contextMenus : null);
      if (menusApi) {
        menusApi.removeAll(() => {
          menusApi.create({
            id: 'google_translate_me',
            title: 'Google Translate me',
            contexts: ['selection', 'page', 'editable', 'frame', 'link']
          });
          menusApi.create({
            id: 'crop_screen_copilot',
            title: '📸 Crop Screen to Copilot (Ctrl+Shift+X / A)',
            contexts: ['image', 'video']
          });
        });
      }
    } catch (e) {}

    // Enable Side Panel in Chrome if supported
    if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
    }

    // Auto-inject content.js into all currently open web tabs so hotkeys work immediately after reload
    try {
      const tabsApi = ext.tabs || (typeof chrome !== 'undefined' ? chrome.tabs : null);
      const scriptingApi = ext.scripting || (typeof chrome !== 'undefined' ? chrome.scripting : null);
      if (tabsApi && scriptingApi && scriptingApi.executeScript) {
        const tabs = await new Promise((resolve) => {
          try {
            const res = tabsApi.query({ url: ['http://*/*', 'https://*/*'] }, (t) => resolve(t || []));
            if (res && typeof res.then === 'function') {
              res.then((t) => resolve(t || [])).catch(() => resolve([]));
            }
          } catch (e) {
            resolve([]);
          }
        });
        for (const t of tabs) {
          if (t?.id) {
            scriptingApi.executeScript({
              target: { tabId: t.id, allFrames: true },
              files: ['content.js']
            }).catch(() => {});
          }
        }
      }
    } catch (e) {}

    // Pre-populate storage defaults if empty
    try {
      const storageApi = ext.storage?.local || (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
      if (storageApi) {
        storageApi.get(null, (stored) => {
          stored = stored || {};
          const updates = {};
          if (!stored.cbai_provider) updates.cbai_provider = DEFAULTS.currentProvider;
          if (!stored.cbai_api_keys) updates.cbai_api_keys = DEFAULTS.apiKeys;
          if (!stored.cbai_api_urls) updates.cbai_api_urls = DEFAULTS.apiUrls;
          if (!stored.cbai_models) updates.cbai_models = DEFAULTS.selectedModels;
          if (!stored.cbai_l78_presets_v3 || !stored.cbai_prompt) {
            updates.cbai_preset = DEFAULTS.currentPreset;
            updates.cbai_prompt = DEFAULTS.systemPrompt;
            updates.cbai_l78_presets_v3 = true;
          }
          if (Object.keys(updates).length > 0) {
            storageApi.set(updates);
          }
        });
      }
    } catch (e) {}
  });
}

// --- Context Menu Click Handler ---
const menusApi = ext.contextMenus || ext.menus || (typeof chrome !== 'undefined' ? chrome.contextMenus : null);
if (menusApi && menusApi.onClicked) {
  menusApi.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'crop_screen_copilot') {
      let activeTab = tab || await getActiveTab();
      if (activeTab?.id) {
        await ensureContentScriptAndSend(activeTab.id, { action: 'start_crop_selection' });
      }
      return;
    }

    if (info.menuItemId === 'google_translate_me' || info.menuItemId === 'solve_with_copilot') {
      let activeTab = tab;
      if (!activeTab || !activeTab.id) {
        activeTab = await getActiveTab();
      }

      let question = cleanSelectionText(info.selectionText || '');
      if (!question && activeTab?.id) {
        question = await getSelectionFromTab(activeTab.id, { allowClipboardProbe: true });
      }

      if (question) {
        try {
          setActionBadge('...', '#f59e0b');
          await solveQuestion(question, activeTab?.id);
          await showTabCheckmark(activeTab?.id);
        } catch (err) {
          console.error('Error solving via context menu:', err);
          setActionBadge('!', '#dc2626', 2500);
        }
      } else if (activeTab?.id) {
        await ensureContentScriptAndSend(activeTab.id, { action: 'start_crop_selection' });
      }
    }
  });
}

// --- Keyboard Command Handler (Hotkeys) ---
const commandsApi = ext.commands || (typeof chrome !== 'undefined' ? chrome.commands : null);
if (commandsApi && commandsApi.onCommand) {
  commandsApi.onCommand.addListener(async (command) => {
    if (command === 'smart_action_x' || command === 'smart_action_a') {
      await handleSmartActionForTab();
      return;
    }

    if (command === 'crop_screenshot') {
      const tab = await getActiveTab();
      if (tab?.id) {
        await ensureContentScriptAndSend(tab.id, { action: 'start_crop_selection' });
      }
      return;
    }

    if (command === 'solve_clipboard') {
      const tab = await getActiveTab();
      if (!tab || !tab.id) return;

      try {
        let text = await getSelectionFromTab(tab.id);
        if (!text) {
          const extClip = await readExtensionClipboard();
          if (extClip.ok && extClip.text) {
            text = cleanSelectionText(extClip.text);
          }
        }
        if (!text) {
          const res = await sendTabMessage(tab.id, { action: 'get_selection_or_clip' }, { frameId: 0 });
          if (res && res.text) text = cleanSelectionText(res.text);
        }

        if (!text) {
          const scripting = ext.scripting || (typeof chrome !== 'undefined' ? chrome.scripting : null);
          if (scripting && scripting.executeScript) {
            try {
              const results = await scripting.executeScript({
                target: { tabId: tab.id },
                func: async () => {
                  const sel = window.getSelection() ? window.getSelection().toString().trim() : '';
                  if (sel) return { text: sel };
                  try {
                    const clip = await navigator.clipboard.readText();
                    if (clip && clip.trim()) return { text: clip.trim() };
                  } catch (e) {}
                  return { text: '' };
                }
              });
              text = cleanSelectionText(results?.[0]?.result?.text || '');
            } catch (e) {}
          }
        }

        if (!text) return;

        setActionBadge('...', '#f59e0b');
        await solveQuestion(text, tab.id);
        await showTabCheckmark(tab.id);
      } catch (err) {
        console.error('Error on hotkey solve:', err);
        setActionBadge('!', '#dc2626', 2500);
      }
    }
  });
}

// --- Message Listener for Content Scripts, Popup & Sidepanel ---
if (runtimeApi && runtimeApi.onMessage) {
  runtimeApi.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.target === 'offscreen') return false;

    // 0. Smart Trigger (Ctrl+Shift+A / X / Right-Click): Solve highlighted text immediately
    if (msg.action === 'solve_selected_text' && msg.text) {
      (async () => {
        try {
          const now = Date.now();
          if (now - lastBackgroundSmartAt < 500) return;
          lastBackgroundSmartAt = now;

          const question = cleanSelectionText(String(msg.text));
          if (!question) return;
          const tab = sender.tab || await getActiveTab();
          setActionBadge('...', '#f59e0b');
          await solveQuestion(question, tab?.id);
          await showTabCheckmark(tab?.id);
        } catch (err) {
          console.error('Error solving via smart shortcut:', err);
          setActionBadge('!', '#dc2626', 2500);
        }
      })();
      sendResponse({ ok: true });
      return true;
    }

    // 0a. Smart Trigger fallback: inspect all frames + Google Docs / canvas editors, else open screen crop
    if (msg.action === 'smart_trigger_resolve') {
      (async () => {
        try {
          await handleSmartActionForTab(sender.tab);
        } catch (err) {
          console.error('Error in smart_trigger_resolve:', err);
        }
      })();
      sendResponse({ ok: true });
      return true;
    }

    // 0b. Subframe forwarding smart trigger to top frame
    if (msg.action === 'smart_trigger_in_top_frame') {
      (async () => {
        try {
          const tab = sender.tab || await getActiveTab();
          if (tab?.id) {
            await ensureContentScriptAndSend(tab.id, { action: 'smart_ctrl_shift_right_click' });
          }
        } catch (err) {
          console.error('Error forwarding smart trigger to top frame:', err);
        }
      })();
      sendResponse({ ok: true });
      return true;
    }

    // 0c. Subframe requesting crop overlay in top frame
    if (msg.action === 'request_top_frame_crop') {
      (async () => {
        try {
          const tab = sender.tab || await getActiveTab();
          if (tab?.id) {
            await ensureContentScriptAndSend(tab.id, { action: 'start_crop_selection' });
          }
        } catch (err) {
          console.error('Error forwarding crop to top frame:', err);
        }
      })();
      sendResponse({ ok: true });
      return true;
    }

    // 1. Interactive crop requested on webpage
    if (msg.action === 'tab_crop_requested' && msg.rect) {
      (async () => {
        try {
          const tab = sender.tab || await getActiveTab();
          if (!tab || !tab.id) return;
          const dataUrl = await captureTabImage(tab.windowId);
          if (!dataUrl) return;
          await sendTabMessage(tab.id, {
            action: 'execute_crop_canvas',
            fullDataUrl: dataUrl,
            rect: msg.rect
          }, { frameId: 0 });
        } catch (e) {
          console.error('Error in tab_crop_requested:', e);
        }
      })();
      sendResponse({ ok: true });
      return true;
    }

    // 2. Cropped screenshot canvas produced in webpage
    if (msg.action === 'cropped_screenshot_ready' && msg.screenshot) {
      (async () => {
        try {
          const screenshot = msg.screenshot;
          const tab = sender.tab || await getActiveTab();

          // Save staged screenshot into storage for UI to display
          try {
            await ext.storage.local.set({
              cbai_staged_screenshot: screenshot,
              cbai_new_crop_pending: true,
              cbai_latest_crop_time: Date.now()
            });
          } catch (e) {}

          // Broadcast to any open extension views (sidepanel, popup, tab)
          try {
            const p = ext.runtime.sendMessage({
              action: 'new_cropped_screenshot',
              screenshot: screenshot
            });
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch (e) {}

          // Open sidepanel if supported so user sees it right there
          try {
            if (ext.sidePanel && ext.sidePanel.open && tab?.windowId) {
              ext.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
            } else if (ext.sidebarAction && ext.sidebarAction.open) {
              ext.sidebarAction.open().catch(() => {});
            }
          } catch (e) {}

          // Background solve question from image & copy answer to clipboard
          try {
            setActionBadge('...', '#f59e0b');
            await solveQuestion(
              '',
              tab?.id,
              screenshot
            );
            if (tab?.id) {
              await showTabCheckmark(tab.id);
            }
          } catch (solveErr) {
            console.error('Background vision solve error:', solveErr);
            setActionBadge('!', '#dc2626', 2500);
          }
        } catch (err) {
          console.error('Error handling cropped screenshot:', err);
        }
      })();
      sendResponse({ ok: true });
      return true;
    }

    // 3. Trigger crop from extension UI button
    if (msg.action === 'trigger_crop_from_ui') {
      (async () => {
        const tab = await getActiveTab();
        if (tab?.id) {
          await ensureContentScriptAndSend(tab.id, { action: 'start_crop_selection' });
        }
      })();
      sendResponse({ ok: true });
      return true;
    }

    // 4. Panel Navigation
    if (msg.action === 'open_sidepanel') {
      if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.open) {
        chrome.windows.getCurrent().then(win => {
          chrome.sidePanel.open({ windowId: win.id }).catch(() => {});
        });
      } else {
        ext.tabs.create({ url: 'sidepanel.html' });
      }
      sendResponse({ ok: true });
      return true;
    } else if (msg.action === 'open_fullscreen') {
      ext.tabs.create({ url: 'fullscreen.html' });
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });
}
'''

# --------------------------------------------------------------------------
# Chrome MV3 Offscreen Document (Silent Clipboard Access without Stealing Tab Focus)
# --------------------------------------------------------------------------
OFFSCREEN_HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Offscreen Clipboard Helper</title>
</head>
<body>
  <textarea id="clip-ta" aria-hidden="true"></textarea>
  <script src="offscreen.js"></script>
</body>
</html>
'''

OFFSCREEN_JS = '''// ==========================================================================
// Google Translate me — Offscreen Clipboard Helper (Chrome MV3)
// Reads/writes OS clipboard in extension origin without disturbing webpage focus
// ==========================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;

  const ta = document.getElementById('clip-ta');
  if (!ta) {
    sendResponse({ ok: false, text: '' });
    return true;
  }

  if (msg.action === 'clipboard_read') {
    try {
      ta.value = '';
      ta.focus();
      ta.select();
      document.execCommand('paste');
      const text = ta.value || '';
      ta.value = '';
      sendResponse({ ok: true, text });
    } catch (e) {
      sendResponse({ ok: false, text: '' });
    }
    return true;
  }

  if (msg.action === 'clipboard_write') {
    try {
      const value = String(msg.text ?? '');
      const onCopy = (e) => {
        e.preventDefault();
        e.clipboardData.setData('text/plain', value);
      };
      document.addEventListener('copy', onCopy, true);
      ta.value = value || ' ';
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.removeEventListener('copy', onCopy, true);
      ta.value = '';
      sendResponse({ ok: Boolean(ok) });
    } catch (e) {
      sendResponse({ ok: false });
    }
    return true;
  }

  return false;
});
'''

# --------------------------------------------------------------------------
# Generate HTML templates for Popup, Sidepanel, and Fullscreen
# --------------------------------------------------------------------------
def create_extension_htmls(output_dir):
    with open(os.path.join(PUBLIC_DIR, 'index.html'), 'r', encoding='utf-8') as f:
        src_html = f.read()

    # Remove the file:// redirect script
    redirect_script = '''  <script>
    // If opened directly via file://, redirect to standalone.html where all JS/CSS is self-contained
    if (window.location.protocol === 'file:') {
      window.location.replace('standalone.html');
    }
  </script>'''
    clean_html = src_html.replace(redirect_script, '')

    # Ensure extension.css is linked
    if '<link rel="stylesheet" href="css/extension.css">' not in clean_html:
        clean_html = clean_html.replace(
            '<link rel="stylesheet" href="css/style.css">',
            '<link rel="stylesheet" href="css/style.css">\n  <link rel="stylesheet" href="css/extension.css">'
        )

    # 1. Fullscreen HTML (standard tab)
    fullscreen_html = clean_html
    with open(os.path.join(output_dir, 'fullscreen.html'), 'w', encoding='utf-8') as f:
        f.write(fullscreen_html)

    # 2. Popup HTML
    popup_topbar_btn = '''        <div class="so-ext-btn-group">
          <button id="btn-ext-sidepanel" class="so-ext-top-btn highlight" title="Open as Docked Side Panel alongside current page">
            📌 Side Panel
          </button>
          <button id="btn-ext-fullscreen" class="so-ext-top-btn" title="Open in Full Browser Tab">
            ⛶ Full Tab
          </button>
          <button id="btn-ext-settings" class="so-ext-top-btn" title="AI Config & Keys">
            ⚙️ Config
          </button>
        </div>'''
    
    popup_html = clean_html.replace('<body class="so-theme-light">', '<body class="so-theme-light is-popup">')
    popup_html = popup_html.replace(
        '<div class="so-topbar-actions">',
        '<div class="so-topbar-actions">\n' + popup_topbar_btn
    )

    with open(os.path.join(output_dir, 'popup.html'), 'w', encoding='utf-8') as f:
        f.write(popup_html)

    # 3. Sidepanel HTML
    sidepanel_topbar_btn = '''        <div class="so-ext-btn-group">
          <button id="btn-ext-fullscreen" class="so-ext-top-btn" title="Open in Full Browser Tab">
            ⛶ Full Tab
          </button>
          <button id="btn-ext-settings" class="so-ext-top-btn" title="AI Config & Keys">
            ⚙️ Config
          </button>
        </div>'''

    sidepanel_html = clean_html.replace('<body class="so-theme-light">', '<body class="so-theme-light is-sidepanel">')
    sidepanel_html = sidepanel_html.replace(
        '<div class="so-topbar-actions">',
        '<div class="so-topbar-actions">\n' + sidepanel_topbar_btn
    )

    with open(os.path.join(output_dir, 'sidepanel.html'), 'w', encoding='utf-8') as f:
        f.write(sidepanel_html)


# --------------------------------------------------------------------------
# Main Build Function
# --------------------------------------------------------------------------
def build_all():
    print("=" * 60)
    print("🚀 Building Chrome & Firefox Extensions for Google Translate me")
    print("=" * 60)

    # Clean destination folders
    for d in [CHROME_DIR, FIREFOX_DIR]:
        if os.path.exists(d):
            shutil.rmtree(d)
        os.makedirs(d, exist_ok=True)

    # Shared assets to copy
    for target_dir in [CHROME_DIR, FIREFOX_DIR]:
        # Copy CSS
        shutil.copytree(os.path.join(PUBLIC_DIR, 'css'), os.path.join(target_dir, 'css'))
        # Copy JS
        shutil.copytree(os.path.join(PUBLIC_DIR, 'js'), os.path.join(target_dir, 'js'))
        # Copy Icons
        shutil.copytree(os.path.join(PUBLIC_DIR, 'icons'), os.path.join(target_dir, 'icons'))
        # Copy favicon
        shutil.copy(os.path.join(PUBLIC_DIR, 'favicon.svg'), os.path.join(target_dir, 'favicon.svg'))

        # Write background.js
        with open(os.path.join(target_dir, 'background.js'), 'w', encoding='utf-8') as f:
            f.write(BACKGROUND_JS)

        # Write content.js
        with open(os.path.join(target_dir, 'content.js'), 'w', encoding='utf-8') as f:
            f.write(CONTENT_JS)

        # Generate popup.html, sidepanel.html, fullscreen.html
        create_extension_htmls(target_dir)

    # Write Chrome MV3 offscreen clipboard helper
    with open(os.path.join(CHROME_DIR, 'offscreen.html'), 'w', encoding='utf-8') as f:
        f.write(OFFSCREEN_HTML)
    with open(os.path.join(CHROME_DIR, 'offscreen.js'), 'w', encoding='utf-8') as f:
        f.write(OFFSCREEN_JS)

    # ----------------------------------------------------------------------
    # 1. Chrome Manifest V3
    # ----------------------------------------------------------------------
    chrome_manifest = {
        "manifest_version": 3,
        "name": "Google Translate me",
        "version": "1.0.0",
        "description": "Google Translate me — Quick text translation and tools.",
        "icons": {
            "16": "icons/icon-16.png",
            "32": "icons/icon-32.png",
            "48": "icons/icon-48.png",
            "128": "icons/icon-128.png"
        },
        "action": {
            "default_popup": "popup.html",
            "default_title": "Google Translate me",
            "default_icon": {
                "16": "icons/icon-16.png",
                "32": "icons/icon-32.png",
                "48": "icons/icon-48.png",
                "128": "icons/icon-128.png"
            }
        },
        "side_panel": {
            "default_path": "sidepanel.html"
        },
        "background": {
            "service_worker": "background.js",
            "type": "module"
        },
        "content_scripts": [
            {
                "matches": ["<all_urls>"],
                "js": ["content.js"],
                "run_at": "document_idle",
                "all_frames": True,
                "match_about_blank": True
            }
        ],
        "permissions": [
            "clipboardRead",
            "clipboardWrite",
            "offscreen",
            "storage",
            "contextMenus",
            "notifications",
            "sidePanel",
            "activeTab",
            "scripting"
        ],
        "host_permissions": [
            "https://api.gapgpt.app/*",
            "https://api.avalai.ir/*",
            "https://api.arvancloudai.ir/*",
            "https://generativelanguage.googleapis.com/*",
            "https://api.openai.com/*",
            "http://localhost/*",
            "http://127.0.0.1/*",
            "<all_urls>"
        ],
        "commands": {
            "_execute_action": {
                "suggested_key": {
                    "default": "Alt+Shift+C",
                    "mac": "Alt+Shift+C"
                },
                "description": "Open Google Translate me"
            },
            "smart_action_x": {
                "suggested_key": {
                    "default": "Ctrl+Shift+X",
                    "mac": "Command+Shift+X"
                },
                "description": "Smart Solve Text or Crop Screen (Ctrl+Shift+X)"
            },
            "smart_action_a": {
                "suggested_key": {
                    "default": "Ctrl+Shift+A",
                    "mac": "Command+Shift+A"
                },
                "description": "Smart Solve Text or Crop Screen (Ctrl+Shift+A)"
            },
            "solve_clipboard": {
                "suggested_key": {
                    "default": "Alt+Shift+S",
                    "mac": "Alt+Shift+S"
                },
                "description": "Google Translate me — Quick Solve & Copy",
                "global": True
            },
            "crop_screenshot": {
                "description": "Crop Screen Selection to Copilot"
            }
        }
    }

    with open(os.path.join(CHROME_DIR, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(chrome_manifest, f, indent=2, ensure_ascii=False)
    print("✅ Created Chrome Manifest V3 (extension-chrome/manifest.json)")

    # ----------------------------------------------------------------------
    # 2. Firefox Manifest V3 (with Gecko ID & sidebar_action)
    # ----------------------------------------------------------------------
    firefox_manifest = {
        "manifest_version": 3,
        "name": "Google Translate me",
        "version": "1.0.0",
        "description": "Google Translate me — Quick text translation and tools.",
        "icons": {
            "16": "icons/icon-16.png",
            "32": "icons/icon-32.png",
            "48": "icons/icon-48.png",
            "128": "icons/icon-128.png"
        },
        "action": {
            "default_popup": "popup.html",
            "default_title": "Google Translate me",
            "default_icon": {
                "16": "icons/icon-16.png",
                "32": "icons/icon-32.png",
                "48": "icons/icon-48.png",
                "128": "icons/icon-128.png"
            }
        },
        "sidebar_action": {
            "default_panel": "sidepanel.html",
            "default_title": "Google Translate me",
            "default_icon": "icons/icon-48.png"
        },
        "background": {
            "scripts": ["background.js"],
            "type": "module"
        },
        "content_scripts": [
            {
                "matches": ["<all_urls>"],
                "js": ["content.js"],
                "run_at": "document_idle",
                "all_frames": True,
                "match_about_blank": True
            }
        ],
        "browser_specific_settings": {
            "gecko": {
                "id": "translate-me@google-tools.local",
                "strict_min_version": "112.0"
            }
        },
        "permissions": [
            "clipboardRead",
            "clipboardWrite",
            "storage",
            "contextMenus",
            "notifications",
            "activeTab",
            "scripting"
        ],
        "host_permissions": [
            "https://api.gapgpt.app/*",
            "https://api.avalai.ir/*",
            "https://api.arvancloudai.ir/*",
            "https://generativelanguage.googleapis.com/*",
            "https://api.openai.com/*",
            "http://localhost/*",
            "http://127.0.0.1/*",
            "<all_urls>"
        ],
        "commands": {
            "_execute_action": {
                "suggested_key": {
                    "default": "Alt+Shift+C",
                    "mac": "Alt+Shift+C"
                },
                "description": "Open Google Translate me"
            },
            "smart_action_x": {
                "suggested_key": {
                    "default": "Ctrl+Shift+X",
                    "mac": "Command+Shift+X"
                },
                "description": "Smart Solve Text or Crop Screen (Ctrl+Shift+X)"
            },
            "smart_action_a": {
                "suggested_key": {
                    "default": "Ctrl+Shift+A",
                    "mac": "Command+Shift+A"
                },
                "description": "Smart Solve Text or Crop Screen (Ctrl+Shift+A)"
            },
            "solve_clipboard": {
                "suggested_key": {
                    "default": "Alt+Shift+S",
                    "mac": "Alt+Shift+S"
                },
                "description": "Google Translate me — Quick Solve & Copy"
            },
            "crop_screenshot": {
                "description": "Crop Screen Selection to Copilot"
            }
        }
    }

    with open(os.path.join(FIREFOX_DIR, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(firefox_manifest, f, indent=2, ensure_ascii=False)
    print("✅ Created Firefox Manifest V3 (extension-firefox/manifest.json)")

    # ----------------------------------------------------------------------
    # 3. Create ZIP Packages for Easy Drag & Drop Installation
    # ----------------------------------------------------------------------
    chrome_zip = os.path.join(BASE_DIR, 'clipboard-copilot-chrome.zip')
    firefox_zip = os.path.join(BASE_DIR, 'clipboard-copilot-firefox.zip')

    for zip_path, src_dir in [(chrome_zip, CHROME_DIR), (firefox_zip, FIREFOX_DIR)]:
        if os.path.exists(zip_path):
            os.remove(zip_path)
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(src_dir):
                for file in files:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, src_dir)
                    zf.write(full_path, rel_path)
        print(f"📦 Packaged {os.path.basename(zip_path)} ({os.path.getsize(zip_path):,} bytes)")

    # Also copy to PUBLIC_DIR so website visitors can download with 1 click
    shutil.copy(chrome_zip, os.path.join(PUBLIC_DIR, 'clipboard-copilot-chrome.zip'))
    shutil.copy(firefox_zip, os.path.join(PUBLIC_DIR, 'clipboard-copilot-firefox.zip'))

    # Package & copy standalone Windows desktop app (if built in windows-app/)
    win_dir = os.path.join(BASE_DIR, 'windows-app')
    win_exe = os.path.join(win_dir, 'WindowsApp.exe')
    if os.path.exists(win_exe):
        win_zip = os.path.join(BASE_DIR, 'windows-app.zip')
        if os.path.exists(win_zip):
            os.remove(win_zip)
        with zipfile.ZipFile(win_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.write(win_exe, 'WindowsApp.exe')
            win_readme = os.path.join(win_dir, 'README_WINDOWS.md')
            if os.path.exists(win_readme):
                zf.write(win_readme, 'README_WINDOWS.md')
        shutil.copy(win_zip, os.path.join(PUBLIC_DIR, 'windows-app.zip'))
        shutil.copy(win_exe, os.path.join(PUBLIC_DIR, 'WindowsApp.exe'))
        shutil.copy(win_exe, os.path.join(BASE_DIR, 'WindowsApp.exe'))
        print(f"🪟 Packaged {os.path.basename(win_zip)} ({os.path.getsize(win_zip):,} bytes) & copied Windows downloads to public/ and root!")

    print("🌐 Copied extension ZIPs & Windows app to public/ directory for direct web download!")

    print("=" * 60)
    print("🎉 Both Chrome & Firefox Extensions built successfully!")
    print("=" * 60)

if __name__ == '__main__':
    build_all()
