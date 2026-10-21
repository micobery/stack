// System Clipboard API Interface with Multimodal Screenshot & Text Support

class ClipboardManager {
  constructor() {
    this.lastInput = '';
    this.lastOutput = '';
    this.lastImageHash = '';
    this.isProcessing = false;
    this.dedupEnabled = true;
  }

  // Check if text is new and not an echo loop
  shouldProcessText(text) {
    if (!text || !text.trim()) return false;
    const clean = text.trim();

    if (!this.dedupEnabled) return true;

    // Echo protection: Don't process if the clipboard text is what we just copied as output
    if (clean === this.lastOutput.trim()) {
      return false;
    }

    // Deduplication: Don't process if it's identical to the previous input
    if (clean === this.lastInput.trim()) {
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

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        this.lastOutput = text.trim();
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
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) {
        this.lastOutput = text.trim();
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
