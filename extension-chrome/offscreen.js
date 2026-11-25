// ==========================================================================
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
