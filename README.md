# 📋 StackOverflow — Instant Clipboard AI Copilot

> **Copy error or code anywhere** &rarr; switch to tab &rarr; Gemini solves it &rarr; response is automatically copied back to your clipboard!

![Status: Ready](https://img.shields.io/badge/Status-Ready-brightgreen.svg)
![Models: Gemini 3.8 Flash & Pro](https://img.shields.io/badge/Models-Gemini%203.8%20Flash%20%26%20Pro-orange.svg)
![Cloud: Free](https://img.shields.io/badge/Cloud%20Hosting-Free-blueviolet.svg)

---

## ✨ Features

- ⚡ **Auto-Sync on Tab Focus**: Simply copy an error or code block, switch or click this tab, and StackOverflow Copilot reads the clipboard, solves it with Gemini, and copies the solution back.
- 🤖 **Fastest & Newest Gemini Models**:
  - **Gemini 3.8 Flash** (Default — Blazing fast, low latency, vision & coding)
  - **Gemini 2.5 Flash** (Ultra fast & rock-solid stable)
  - **Gemini 3.1 Pro Preview** (Deep code architecture & complex debugging)
  - **Gemini Pro Latest** (Multi-turn reasoning)
- 🔑 **Dual Gemini Keys (Automatic Rate Limit Failover)**:
  - Add both **Key #1 (Primary)** and **Key #2 (Backup)**.
  - If your primary account hits quota limits or HTTP 429, the app instantly and automatically fails over to Key #2 without interrupting your workflow!
- 📸 **Multimodal Screenshot Support**:
  - Automatically captures screenshots from your clipboard (PrintScreen / Win+Shift+S / Cmd+Shift+4).
  - Gemini Vision analyzes the error dialogues, terminal traces, and code in the image.
- 🔒 **Privacy-First**: API keys and history stay securely in your browser's `localStorage`.
- 🔁 **Loop Protection**: Avoids infinite loops when reading its own output.
- 🎵 **Audio Feedback**: Subtle synthesizer chime when your answer is ready.
- ☁️ **Deploy Anywhere for Free**: Google Cloud Run (Always Free Tier), Firebase Hosting, and Vercel.

---

## 🚀 Running Locally

```bash
cd /home/milad/.gemini/antigravity-ide/scratch/clipboard-ai
python3 server.py
```

Open **[http://localhost:2080](http://localhost:2080)** in your browser.
