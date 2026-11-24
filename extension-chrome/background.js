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
