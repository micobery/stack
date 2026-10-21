# ☁️ ClipboardAI Free Cloud Deployment Guide

ClipboardAI is designed with **zero server dependencies** and client-side direct API connections. You can host it **100% free forever** on Google Cloud or other free providers.

---

## 🌟 Option 1: Google Cloud Run (Always Free Tier)

Google Cloud Run includes a permanent **Always Free Tier**:
- **2,000,000 requests per month**
- **360,000 GB-seconds memory**
- **180,000 vCPU-seconds compute time**
- HTTPS domain automatically provided by Google!

### Prerequisites:
1. A free Google account.
2. Install the [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install) if not already installed.

### Steps to Deploy:
1. Open your terminal in this directory:
   ```bash
   cd /home/milad/.gemini/antigravity-ide/scratch/clipboard-ai
   ```

2. Log in and select or create a Google Cloud project:
   ```bash
   gcloud auth login
   gcloud projects create my-clipboard-ai --set-as-default   # Or use existing project
   ```

3. Deploy with one command (Cloud Run will build the included `Dockerfile` automatically):
   ```bash
   gcloud run deploy clipboard-ai \
     --source . \
     --region us-central1 \
     --allow-unauthenticated
   ```

4. Cloud Run will output your live URL:
   ```
   Service URL: https://clipboard-ai-xxxx-uc.a.run.app
   ```
   Open this URL in any browser, paste your API key, and you're done!

---

## ⚡ Option 2: Google Firebase Hosting (100% Free, Fastest)

Google Firebase Hosting is Google's ultra-fast global CDN:
- 10 GB storage
- 360 MB/day data transfer
- Free custom domains and SSL

### Steps to Deploy:
1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Log in to your Google Account:
   ```bash
   firebase login
   ```

3. Deploy using the included `firebase.json`:
   ```bash
   firebase deploy --only hosting
   ```

---

## 🚀 Option 3: GitHub Pages / Vercel (Free & Instant)

### GitHub Pages:
1. Create a free GitHub repository.
2. Push this project to GitHub.
3. Go to **Settings &rarr; Pages &rarr; Source &rarr; Deploy from branch (`main` / `/public`)**.
4. You get `https://<your-username>.github.io/<repo-name>/`.

### Vercel:
1. Install Vercel CLI (`npm i -g vercel`) or visit [vercel.com](https://vercel.com).
2. Run:
   ```bash
   vercel
   ```
   Select default options. Instant live URL in 10 seconds!

---

## 💻 Running Locally on Your Machine

To run on your local computer at any time:
```bash
python3 server.py
```
Open **http://localhost:8080** in your browser.
