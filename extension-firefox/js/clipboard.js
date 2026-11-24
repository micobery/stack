// System Clipboard API Interface with Multimodal Screenshot & Text Support

export function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width non-joiners & BOM
    .trim();
}

class ClipboardManager {
  constructor() {
    this.lastInput = '';
    this.lastOutput = '';
    this.lastImageHash = '';
    this.isProcessing = false;
    this.dedupEnabled = true;
    this.lastWriteTime = 0;
    this.isCopying = false;
    this.knownOutputs = new Set();
    this.knownOutputsList = [];
  }

  // Register an answer or copied snippet so it is never re-processed as a question
  registerOutput(text) {
    if (!text || typeof text !== 'string') return;
    const clean = text.trim();
    if (!clean) return;

    this.lastOutput = clean;
    this.lastWriteTime = Date.now();

    const normalized = normalizeText(clean);
    this.knownOutputs.add(clean);
    this.knownOutputs.add(normalized);
    this.knownOutputsList.push(normalized);

    // Also extract code blocks inside markdown if present and register them
    const codeBlockRegex = /```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(clean)) !== null) {
      const codeSnippet = match[1]?.trim();
      if (codeSnippet) {
        this.knownOutputs.add(codeSnippet);
        this.knownOutputs.add(normalizeText(codeSnippet));
      }
    }

    // Keep memory bounded to last 150 items
    if (this.knownOutputsList.length > 150) {
      const removed = this.knownOutputsList.shift();
      if (!this.knownOutputsList.includes(removed)) {
        this.knownOutputs.delete(removed);
      }
    }
  }

  // Check if text is a known output or generated solution
  isKnownOutput(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();
    if (!clean) return false;

    const normalized = normalizeText(clean);

    if (this.knownOutputs.has(clean) || this.knownOutputs.has(normalized)) {
      return true;
    }

    if (this.lastOutput && (normalized === normalizeText(this.lastOutput) || clean === this.lastOutput.trim())) {
      return true;
    }

    // Substring or fuzzy check for long texts (> 25 characters)
    for (const known of this.knownOutputsList) {
      if (known === normalized) return true;
      if (normalized.length > 25 && (known.includes(normalized) || normalized.includes(known))) {
        return true;
      }
    }

    return false;
  }

  // Check if text is new and not an echo loop
  shouldProcessText(text, { isAuto = false, history = [] } = {}) {
    if (!text || !text.trim()) return false;
    const clean = text.trim();
    const normalized = normalizeText(clean);

    // 1. Time Cooldown: If the app itself wrote to clipboard within the last 3500ms, ignore auto triggers
    if (isAuto && this.lastWriteTime && (Date.now() - this.lastWriteTime < 3500)) {
      console.log('Ignored auto-sync trigger: within 3.5s self-write cooldown');
      return false;
    }

    // 2. Strict Echo Protection: NEVER process text that matches any registered output
    if (this.isKnownOutput(text)) {
      console.log('Ignored clipboard text: matches known output (echo loop prevention)');
      return false;
    }

    // 3. History check: check if this text matches any solution in app history
    if (Array.isArray(history) && history.length > 0) {
      const isHistoryMatch = history.some(item => {
        if (!item || !item.output) return false;
        const normHist = normalizeText(item.output);
        return normHist === normalized || (normalized.length > 25 && (normHist.includes(normalized) || normalized.includes(normHist)));
      });
      if (isHistoryMatch) {
        console.log('Ignored clipboard text: matches history item output');
        return false;
      }
    }

    if (!this.dedupEnabled) return true;

    // 4. Deduplication: Don't process if it's identical to the previous input
    if (this.lastInput && (normalized === normalizeText(this.lastInput) || clean === this.lastInput.trim())) {
      console.log('Ignored clipboard text: identical to previous input');
      return false;
    }

    return true;
  }

  // Check if screenshot image is new
  shouldProcessImage(imageHash) {
    if (!imageHash) return false;
    if (!this.dedupEnabled) return true;
    if (imageHash === this.lastImageHash) {
      return false;
    }
    return true;
  }

  // Read full clipboard content: checks for screenshot images first, then text
  async readClipboard() {
    // 1. Try reading rich clipboard items (images & text) via navigator.clipboard.read()
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          // Check for image types (screenshots are typically image/png or image/jpeg)
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const { base64, dataUrl } = await this.blobToBase64(blob);
            const hash = `${blob.size}_${base64.slice(0, 100)}`;
            return {
              type: 'image',
              mimeType: imageType,
              base64: base64,
              dataUrl: dataUrl,
              hash: hash,
              size: blob.size
            };
          }

          // Check for text/plain
          if (item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            const text = await blob.text();
            if (text && text.trim()) {
              return { type: 'text', text: text.trim() };
            }
          }
        }
      } catch (err) {
        // Fallback to readText if .read() permission is restricted or only text is supported
        if (navigator.clipboard.readText) {
          try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
              return { type: 'text', text: text.trim() };
            }
          } catch (textErr) {
            console.warn('readText fallback error:', textErr);
          }
        }
        console.warn('Clipboard read permission not available or denied:', err);
        return { type: 'denied', reason: 'permission_restricted', error: err.name || 'NotAllowedError' };
      }
    }

    // 2. Standard text fallback
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          return { type: 'text', text: text.trim() };
        }
      } catch (err) {
        console.warn('Clipboard readText error:', err);
        return { type: 'denied', reason: 'permission_restricted', error: err.name || 'NotAllowedError' };
      }
    }

    return { type: 'empty' };
  }

  // Convert Blob to pure Base64 and data URL
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        // Strip the "data:image/xxx;base64," prefix for API payloads
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, dataUrl });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Write text back to system clipboard safely (returns true on success, false on failure)
  async writeText(text) {
    if (!text) return false;

    // Immediately record in known outputs and set cooldown
    this.registerOutput(text);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('navigator.clipboard.writeText failed, trying fallback:', err);
      }
    }

    return this.fallbackCopy(text);
  }

  // Fallback for older browsers or restricted contexts
  fallbackCopy(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      
      this.isCopying = true;
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      setTimeout(() => { this.isCopying = false; }, 300);

      if (success) {
        this.registerOutput(text);
        return true;
      }
      console.warn('document.execCommand(copy) was unsuccessful');
      return false;
    } catch (err) {
      console.warn('Fallback clipboard copy failed:', err);
      return false;
    }
  }

  // Query browser clipboard permission state
  async checkPermission() {
    if (!navigator.permissions || !navigator.permissions.query) {
      return 'unknown';
    }
    try {
      const result = await navigator.permissions.query({ name: 'clipboard-read' });
      return result.state;
    } catch (e) {
      return 'unknown';
    }
  }
}

export const clipboard = new ClipboardManager();
if (typeof window !== 'undefined') {
  window.clipboardManager = clipboard;
}
