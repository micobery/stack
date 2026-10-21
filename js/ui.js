// User Interface Controller & Visual Feedback Engine for Stack Overflow Copilot

export class UIController {
  constructor() {
    // Elements
    this.statusPill = document.getElementById('status-pill');
    this.statusPillText = document.getElementById('status-pill-text');
    this.radarCore = document.getElementById('radar-core');
    this.radarIcon = document.getElementById('radar-icon');
    this.noticeBanner = document.querySelector('.so-notice-banner');
    this.liveTitle = document.getElementById('live-state-title');
    this.liveSubtitle = document.getElementById('live-state-subtitle');
    this.liveDesc = document.getElementById('live-state-desc');

    this.stepRead = document.getElementById('step-read');
    this.stepAi = document.getElementById('step-ai');
    this.stepWrite = document.getElementById('step-write');

    this.textInput = document.getElementById('text-input');
    this.textOutput = document.getElementById('text-output');
    this.solutionRenderBox = document.getElementById('solution-render-box');
    this.solutionRenderContent = document.getElementById('solution-render-content');
    this.acceptedCheckText = document.getElementById('accepted-check-text');
    this.acceptedLabel = document.getElementById('accepted-label');
    this.btnToggleRaw = document.getElementById('btn-toggle-raw');
    this.acceptedAnswerBox = document.getElementById('accepted-answer-box');
    this.inputStats = document.getElementById('input-stats');
    this.outputStats = document.getElementById('output-stats');

    this.toastContainer = document.getElementById('toast-container');
    this.historyList = document.getElementById('history-list');
    this.emptyHistory = document.getElementById('empty-history-placeholder');

    this.initViewToggles();
  }

  initViewToggles() {
    if (this.btnToggleRaw) {
      this.btnToggleRaw.addEventListener('click', () => {
        const isRawVisible = this.textOutput && this.textOutput.style.display !== 'none';
        if (isRawVisible) {
          if (this.textOutput) this.textOutput.style.display = 'none';
          if (this.solutionRenderBox) this.solutionRenderBox.style.display = 'block';
          this.btnToggleRaw.textContent = 'Raw Code';
        } else {
          if (this.textOutput) this.textOutput.style.display = 'block';
          if (this.solutionRenderBox) this.solutionRenderBox.style.display = 'none';
          this.btnToggleRaw.textContent = 'Formatted';
        }
      });
    }
  }

  // Set Visual State to Ready / Listening
  setReady(hasKey = true, autoSync = false) {
    this.resetSteps();
    if (this.statusPill) {
      if (!hasKey) {
        this.statusPill.className = 'status-pill status-warn';
        this.statusPillText.textContent = 'API Key Required';
      } else if (autoSync) {
        this.statusPill.className = 'status-pill status-ready';
        this.statusPillText.textContent = 'Auto-Sync Active';
      } else {
        this.statusPill.className = 'status-pill status-ready';
        this.statusPillText.textContent = 'Manual Mode';
      }
    }
    if (this.radarIcon) this.radarIcon.textContent = autoSync ? '📋' : '⚡';
    if (this.liveSubtitle) {
      if (!hasKey) {
        this.liveSubtitle.textContent = 'API Key Setup Needed';
      } else if (autoSync) {
        this.liveSubtitle.textContent = 'Clipboard Monitoring Active';
      } else {
        this.liveSubtitle.textContent = 'Manual Mode Ready';
      }
    }
    if (this.liveDesc) {
      if (!hasKey) {
        this.liveDesc.textContent = 'Please enter and save your API key in the settings.';
      } else if (autoSync) {
        this.liveDesc.textContent = 'Copy any code or error in your IDE/terminal, then switch to this tab. Stack Overflow Copilot automatically solves it and copies the answer back!';
      } else {
        this.liveDesc.textContent = 'Auto-read clipboard is disabled. Paste your question/screenshot (Ctrl+V) or click "Process Clipboard" to solve!';
      }
    }
  }

  // Set Visual State to Processing
  setProcessing(stepName = 'Reading clipboard...') {
    if (this.statusPill) {
      this.statusPill.className = 'status-pill status-busy';
      this.statusPillText.textContent = 'Processing...';
    }
    if (this.radarIcon) this.radarIcon.textContent = '⚡';
    if (this.liveSubtitle) this.liveSubtitle.textContent = 'Analyzing Code & Generating Solution...';
    if (this.liveDesc) this.liveDesc.textContent = stepName;
  }

  // Set Pipeline Step (1, 2, or 3)
  setActiveStep(stepIndex) {
    this.resetSteps();
    if (stepIndex >= 1 && this.stepRead) this.stepRead.classList.add('step-active');
    if (stepIndex >= 2 && this.stepAi) {
      this.stepRead?.classList.remove('step-active');
      this.stepRead?.classList.add('step-done');
      this.stepAi.classList.add('step-active');
    }
    if (stepIndex >= 3 && this.stepWrite) {
      this.stepAi?.classList.remove('step-active');
      this.stepAi?.classList.add('step-done');
      this.stepWrite.classList.add('step-active');
    }
  }

  // Set Visual State to Success
  setSuccess(message = 'Copied back to clipboard!', { isMobileScreenshot = false } = {}) {
    if (this.statusPill) {
      this.statusPill.className = 'status-pill status-ready';
      this.statusPillText.textContent = isMobileScreenshot ? 'Answer Ready (In Box)' : 'Copied to Clipboard!';
    }
    if (this.stepWrite) {
      this.stepWrite.classList.remove('step-active');
      this.stepWrite.classList.add('step-done');
    }
    if (this.radarIcon) this.radarIcon.textContent = '✨';
    if (this.liveSubtitle) {
      this.liveSubtitle.textContent = isMobileScreenshot
        ? 'Solution Displayed in Box Below'
        : 'Solution Accepted & Copied to Clipboard!';
    }
    if (this.liveDesc) this.liveDesc.textContent = message;

    // Reset back to ready after 5 seconds
    setTimeout(() => {
      this.setReady(true);
    }, 5000);
  }

  // Set Visual State to Error
  setError(errMessage) {
    this.resetSteps();
    if (this.statusPill) {
      this.statusPill.className = 'status-pill status-warn';
      this.statusPillText.textContent = 'Error Occurred';
    }
    if (this.radarIcon) this.radarIcon.textContent = '⚠️';
    if (this.liveSubtitle) this.liveSubtitle.textContent = 'Failed to Process Clipboard';
    if (this.liveDesc) this.liveDesc.textContent = errMessage;
    this.showToast(errMessage, 'error');

    setTimeout(() => {
      this.setReady(true);
    }, 5000);
  }

  resetSteps() {
    [this.stepRead, this.stepAi, this.stepWrite].forEach(step => {
      if (step) {
        step.classList.remove('step-active', 'step-done');
      }
    });
  }

  // Screenshot Preview Controls
  setScreenshotPreview({ dataUrl, mimeType, size }) {
    const container = document.getElementById('screenshot-preview-container');
    const img = document.getElementById('screenshot-preview-img');
    const info = document.getElementById('screenshot-info');

    if (container && img) {
      img.src = dataUrl;
      const sizeKb = Math.round(size / 1024);
      if (info) info.textContent = `${mimeType || 'image/jpeg'} \u2022 ${sizeKb} KB`;
      container.style.display = 'flex';
      if (this.inputStats) this.inputStats.textContent = `Photo / Screenshot (${sizeKb} KB)`;
    }
  }

  clearScreenshotPreview() {
    const container = document.getElementById('screenshot-preview-container');
    const img = document.getElementById('screenshot-preview-img');
    if (container) container.style.display = 'none';
    if (img) img.src = '';
  }

  // Update Input & Output Text boxes
  setInputText(text) {
    if (this.textInput) {
      this.textInput.value = text;
      if (this.inputStats && text) this.inputStats.textContent = `${text.length} chars`;
    }
  }

  setOutputText(text, { isMobileScreenshot = false } = {}) {
    if (this.textOutput) {
      this.textOutput.value = text;
      if (this.outputStats && text) this.outputStats.textContent = `${text.length} chars`;
    }

    if (this.solutionRenderContent) {
      this.solutionRenderContent.innerHTML = this.renderSolutionHTML(text);

      // Attach copy listeners to individual code snippets inside the formatted card
      this.solutionRenderContent.querySelectorAll('.so-code-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const code = btn.getAttribute('data-code');
          if (code) {
            try {
              await navigator.clipboard.writeText(code);
              btn.textContent = '✓ Copied';
              this.showToast('Copied Java code snippet to clipboard!', 'success');
              setTimeout(() => { btn.textContent = '📋 Copy Code'; }, 1800);
            } catch (err) {
              this.showToast('Failed to copy code: ' + err.message, 'error');
            }
          }
        });
      });
    }

    if (isMobileScreenshot) {
      if (this.acceptedCheckText) this.acceptedCheckText.textContent = 'SOLVED';
      if (this.acceptedLabel) this.acceptedLabel.textContent = 'ACCEPTED ANSWER • SHOWN IN BOX';

      // Auto-scroll down smoothly to the answer box on mobile so user sees the solution immediately
      if (this.acceptedAnswerBox) {
        this.acceptedAnswerBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        this.acceptedAnswerBox.classList.add('highlight-pulse');
        setTimeout(() => this.acceptedAnswerBox?.classList.remove('highlight-pulse'), 2500);
      }
    } else {
      if (this.acceptedCheckText) this.acceptedCheckText.textContent = 'COPIED';
      if (this.acceptedLabel) this.acceptedLabel.textContent = 'ACCEPTED ANSWER • IN YOUR CLIPBOARD';
    }
  }

  // Show Toast Notification
  showToast(message, type = 'info') {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // History Management
  renderHistory(items, onCopyItem) {
    if (!this.historyList) return;
    this.historyList.innerHTML = '';

    if (!items || items.length === 0) {
      if (this.emptyHistory) {
        this.historyList.appendChild(this.emptyHistory);
      }
      return;
    }

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'so-history-item';
      
      const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const durationStr = item.durationMs ? `${(item.durationMs / 1000).toFixed(1)}s` : '';

      el.innerHTML = `
        <div class="so-history-item-left">
          <div class="so-history-meta">
            <span class="so-tag sm">${item.model || 'Gemini'}</span>
            <span>&bull;</span>
            <span class="so-highlight">${timeStr}</span>
            ${durationStr ? `<span>&bull; ${durationStr}</span>` : ''}
          </div>
          <div class="so-history-snippet" title="${this.escapeHtml(item.input)}">
            Q: ${this.escapeHtml(item.input.slice(0, 80))}${item.input.length > 80 ? '...' : ''}
          </div>
        </div>
        <div class="so-history-item-actions">
          <button class="so-btn-green sm btn-history-copy" title="Copy answer to clipboard">
            Copy
          </button>
        </div>
      `;

      const btnCopy = el.querySelector('.btn-history-copy');
      btnCopy.addEventListener('click', () => {
        onCopyItem(item.output);
        btnCopy.textContent = 'Copied!';
        setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
      });

      this.historyList.appendChild(el);
    });
  }

  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  renderSolutionHTML(rawText) {
    if (!rawText || !rawText.trim()) {
      return '<p class="so-placeholder-text">Stack Overflow Copilot will display the solved Java code and Persian explanation in this box...</p>';
    }

    const codeRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    let html = '';

    while ((match = codeRegex.exec(rawText)) !== null) {
      const textBefore = rawText.slice(lastIndex, match.index).trim();
      if (textBefore) {
        html += this.formatTextSection(textBefore);
      }

      const lang = (match[1] || 'java').toLowerCase();
      const code = match[2].trim();
      const escapedCode = this.escapeHtml(code);
      const escapedCodeAttr = this.escapeHtml(code).replace(/'/g, '&#39;');

      html += `
        <div class="so-code-block-card">
          <div class="so-code-block-header">
            <span class="so-code-lang-tag">${this.escapeHtml(lang.toUpperCase())}</span>
            <button class="so-code-copy-btn" data-code="${escapedCodeAttr}" title="Copy code snippet">
              📋 Copy Code
            </button>
          </div>
          <pre><code class="language-${this.escapeHtml(lang)}">${escapedCode}</code></pre>
        </div>
      `;

      lastIndex = match.index + match[0].length;
    }

    const remainingText = rawText.slice(lastIndex).trim();
    if (remainingText) {
      html += this.formatTextSection(remainingText);
    }

    return html;
  }

  formatTextSection(text) {
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    let html = '';
    for (const p of paragraphs) {
      const isPersian = /[\u0600-\u06FF]/.test(p);
      const dir = isPersian ? 'rtl' : 'ltr';
      const alignClass = isPersian ? 'so-persian-text' : 'so-latin-text';

      let formatted = this.escapeHtml(p)
        .replace(/`([^`]+)`/g, '<code class="so-inline-code">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

      html += `<div class="so-paragraph ${alignClass}" dir="${dir}">${formatted}</div>`;
    }
    return html;
  }
}
