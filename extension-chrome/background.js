// ==========================================================================
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

// Normalize selected text while preserving Persian ZWNJ (\u200C) and rejecting invisible-only placeholders
function cleanSelectionText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw.replace(/^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$/g, '');
  const visible = cleaned.replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, '');
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
            const c = raw.replace(/^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$/g, '');
            return c.replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, '').length > 0 ? c : '';
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
              if (/(^|\.)(docs\.google\.com|figma\.com|canva\.com|miro\.com|notion\.so|notion\.site|overleaf\.com|officeapps\.live\.com|onedrive\.live\.com|sharepoint\.com|lucid\.app|coda\.io|airtable\.com|excalidraw\.com|vscode\.dev|github\.dev|colab\.research\.google\.com|codesandbox\.io|stackblitz\.com)$/.test(host)) {
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
          const c = raw.replace(/^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$/g, '');
          return c.replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, '').length > 0 ? c : '';
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
            const c = raw.replace(/^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$/g, '');
            return c.replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, '').length > 0 ? c : '';
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
