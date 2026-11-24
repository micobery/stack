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
  systemPrompt: `تو یک کارشناس ارشد جاوا و معماری نرم‌افزار (سطح ۷–۸) هستی که خودت مستقیم وسط آزمون تشریحی داری پاسخ را در answers.md تایپ می‌کنی. خروجی باید ۱۰۰٪ مثل نوشته‌ی یک دولوپر ارشد واقعی باشد و به هیچ وجه بوی هوش مصنوعی ندهد. مطلقاً سلام، مقدمه، نتیجه‌گیری یا تعارف ننویس.

ساختار نمره‌کامل سطح ۷–۸ (برای هر سؤال ۱ تا ۲ پاراگراف ساده و پیوسته، حدود ۴ تا ۶ جمله‌ی دقیق / ۸ تا ۱۳ خط):
۱. ریشه و پیامد در همان سناریو: دقیقاً در همین سیستم بگو چرا این مشکل پیش می‌آید و چه ضربه‌ای به سرویس یا کسب‌وکار می‌زند.
۲. راه‌حل و مقایسه‌ی صادقانه‌ی گزینه‌ها: دست‌کم دو گزینه‌ی واقعی را با بده‌بستان وزن‌کشی کن؛ در مهاجرت گام‌های بی‌توقف و بدون از دست رفتن داده را بگو (حالت سایه، Dual-Write یا Expand-Contract، Idempotency، Drain، مسیر بازگشت)؛ در ریشه‌یابی حادثه در تولید، مراحل تشخیص کم‌سربار را به ترتیب بگو (متریک، JFR یا async-profiler/Flame Graph؛ هرگز کار مخرب مثل Heap Dump کامل وسط پیک پیشنهاد نده).
۳. حالت‌های شکست و بده‌بستان صریح: لبه‌های شکست را بگو (مثل Split Brain و Fencing Token، Hot Key، Noisy Neighbor، Race Condition، Poison Pill، Failover، High Cardinality، Time-to-Safepoint، تماس شبکه داخل @Transactional) و روشن بگو چه هزینه‌ای (تأخیر، حافظه، هزینه یا پیچیدگی) می‌پذیری.
۴. اندازه‌گیری و راستی‌آزمایی: مشخص بگو قبل و بعد تغییر چه عددی یا آزمایشی می‌گیری (P99، نسبت پیک به میانگین، Lag، Burn Rate، تست هم‌زمانی، Fault Injection یا مقایسه‌ی Canary).

قوانین حیاتی برای طبیعی و انسانی بودن (مطلقاً غیرقابل تشخیص از AI):
- هیچ **بولد**، هیچ بولت‌پوینتِ «**عنوان:** توضیح»، هیچ شماره‌گذاری کتابی، هیچ ایموجی، هیچ خط تیره‌ی بلند (— یا –) و هیچ تیتری داخل متن پاسخ نیاور؛ فقط ۱ یا ۲ پاراگراف متنی ساده و روان مثل تایپ واقعی آدم در آزمون.
- ریتم جمله‌ها طبیعی و متنوع باشد (ترکیبی از جمله‌های کوتاه و متوسط، نه جمله‌های یک‌دست و کتابی). از اول‌شخص حرفه‌ای و مستقیم استفاده کن (مثل «اول چک می‌کنم...»، «مشکل اصلی این است که...»، «به جایش...»، «هزینه‌ی این کار این است که...»).
- اکیداً از این کلیشه‌ها و ترجمه‌زدگی‌های لو‌دهنده‌ی AI پرهیز کن: «در دنیای واقعی»، «بسیار حیاتی است»، «نقش کلیدی ایفا می‌کند»، «چالش‌های متعددی»، «رویکرد جامع»، «تضمین می‌کند»، «بهینه‌سازی چشمگیر»، «از یک سو ... از سوی دیگر»، «در نتیجه می‌توان گفت»، «شایان ذکر است»، «در واقع»، «به طور کلی»، «لازم به توضیح است»، «در نهایت»، «جمع‌بندی»، «می‌باشد»، «گردید/می‌گردد»، «به منظور»، «توسط ... انجام می‌شود»، «مورد استفاده قرار می‌گیرد»، «اقدام به ... نمودن».
- اصطلاحات فنی به انگلیسی بمانند (Circuit Breaker، Outbox، Fencing Token، JFR، P99، SLO، Bulkhead، RLS) و پسوند فارسی بدون فاصله بچسبد (Threadها، APIهای، Partitionها).
- اگر چند سؤال در ورودی است، فقط با همان عنوان/شماره (مثل q1، q2 یا سوال ۱، سوال ۲) هرکدام را جدا و کامل جواب بده و هیچ سؤالی را جا نینداز.`
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

// Read selected text across all frames of a tab (works even before page reload & inside iframes)
async function getSelectionFromTab(tabId) {
  const scriptingApi = ext.scripting || (typeof chrome !== 'undefined' ? chrome.scripting : null);
  if (scriptingApi && scriptingApi.executeScript) {
    try {
      const results = await scriptingApi.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          try {
            const sel = window.getSelection ? window.getSelection().toString().trim() : '';
            if (sel) return sel;
            const active = document.activeElement;
            if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|password|email|number)?$/i.test(active.type || 'text')))) {
              const start = active.selectionStart;
              const end = active.selectionEnd;
              if (typeof start === 'number' && typeof end === 'number' && end > start) {
                return active.value.substring(start, end).trim();
              }
            }
          } catch (e) {}
          return '';
        }
      });
      if (Array.isArray(results)) {
        for (const r of results) {
          if (r?.result && String(r.result).trim()) {
            return String(r.result).trim();
          }
        }
      }
    } catch (e) {}
  }

  const res = await sendTabMessage(tabId, { action: 'get_selection_only' }, { frameId: 0 });
  return res?.text ? String(res.text).trim() : '';
}

let lastBackgroundSmartAt = 0;

// Unified Smart Trigger: selected text -> solve & copy; no selection -> open screen crop
async function handleSmartActionForTab(tab) {
  const now = Date.now();
  if (now - lastBackgroundSmartAt < 500) return;
  lastBackgroundSmartAt = now;

  const activeTab = tab?.id ? tab : await getActiveTab();
  if (!activeTab?.id) return;

  const selectedText = await getSelectionFromTab(activeTab.id);
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
  const prompt = (stored.cbai_l78_presets_v2 && stored.cbai_prompt) ? stored.cbai_prompt : DEFAULTS.systemPrompt;

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
    try {
      const menusApi = ext.contextMenus || ext.menus || (typeof chrome !== 'undefined' ? chrome.contextMenus : null);
      if (menusApi) {
        menusApi.removeAll(() => {
          menusApi.create({
            id: 'google_translate_me',
            title: 'Google Translate me',
            contexts: ['selection']
          });
          menusApi.create({
            id: 'crop_screen_copilot',
            title: '📸 Crop Screen to Copilot (Ctrl+Shift+X / A)',
            contexts: ['page', 'image', 'video']
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
          if (!stored.cbai_l78_presets_v2 || !stored.cbai_prompt) {
            updates.cbai_preset = DEFAULTS.currentPreset;
            updates.cbai_prompt = DEFAULTS.systemPrompt;
            updates.cbai_l78_presets_v2 = true;
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

    if ((info.menuItemId === 'google_translate_me' || info.menuItemId === 'solve_with_copilot') && info.selectionText) {
      const question = info.selectionText.trim();
      if (!question) return;

      try {
        let activeTab = tab;
        if (!activeTab || !activeTab.id) {
          activeTab = await getActiveTab();
        }
        setActionBadge('...', '#f59e0b');
        await solveQuestion(question, activeTab?.id);
        await showTabCheckmark(activeTab?.id);
      } catch (err) {
        console.error('Error solving via context menu:', err);
        setActionBadge('!', '#dc2626', 2500);
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
          const res = await sendTabMessage(tab.id, { action: 'get_selection_or_clip' }, { frameId: 0 });
          if (res && res.text) text = res.text.trim();
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
              text = results?.[0]?.result?.text?.trim() || '';
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
    // 0. Smart Trigger (Ctrl+Shift+A / X / Right-Click): Solve highlighted text immediately
    if (msg.action === 'solve_selected_text' && msg.text) {
      (async () => {
        try {
          const now = Date.now();
          if (now - lastBackgroundSmartAt < 500) return;
          lastBackgroundSmartAt = now;

          const question = String(msg.text).trim();
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
    } else if (msg.action === 'open_fullscreen') {
      ext.tabs.create({ url: 'fullscreen.html' });
      sendResponse({ ok: true });
    }
    return true;
  });
}
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
                "all_frames": True
            }
        ],
        "permissions": [
            "clipboardRead",
            "clipboardWrite",
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
                "all_frames": True
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
    print("🌐 Copied extension ZIPs to public/ directory for direct web download!")

    print("=" * 60)
    print("🎉 Both Chrome & Firefox Extensions built successfully!")
    print("=" * 60)

if __name__ == '__main__':
    build_all()
