// Multi-Provider AI Inference Engine with Multimodal Vision & Dual-Key Failover

export const PROVIDERS = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
    placeholder: 'AQ.Ab8RN...',
    models: [
      { id: 'gemini-3.8-flash', name: '⚡ Gemini 3.8 Flash (Vision & Code — Default)' },
      { id: 'gemini-2.5-flash', name: '⚡ Gemini 2.5 Flash (Ultra Fast Multimodal)' },
      { id: 'gemini-3.1-pro-preview', name: '🧠 Gemini 3.1 Pro Preview (Deep Vision & Reasoning)' },
      { id: 'gemini-pro-latest', name: '🧠 Gemini Pro Latest (Multimodal Reasoning)' }
    ],
    defaultModel: 'gemini-3.8-flash'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI ChatGPT',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-proj-...',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast Multimodal)' },
      { id: 'gpt-4o', name: 'GPT-4o (Omni Flagship Vision)' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Text Only)' }
    ],
    defaultModel: 'gpt-4o-mini',
    defaultUrl: 'https://api.openai.com/v1'
  },
  custom_openai: {
    id: 'custom_openai',
    name: '3rd Party (GapGPT / OpenAI)',
    keyHelpUrl: 'https://gapgpt.app',
    placeholder: 'sk-F4T2AxOQ...',
    defaultUrl: 'https://api.gapgpt.app/v1',
    models: [
      { id: 'gpt-5-nano', name: '⚡ GPT-5 Nano (Ultra Fast & Accurate — Default)' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Reliable)' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1 Reasoning)' },
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
      { id: 'gpt-4o', name: 'GPT-4o (Vision & Code Flagship)' },
      { id: 'custom', name: '✍️ Custom Model Name (type your own)...' }
    ],
    defaultModel: 'gpt-5-nano'
  }
};

export async function callAI({ provider, apiKey, backupApiKey = null, baseUrl = null, model, systemPrompt, text = '', image = null, onKeySwitch = null }) {
  // Key check: Allow empty key for local Ollama/LM Studio endpoints
  const isLocal = baseUrl && (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || baseUrl.includes(':11434'));
  if (!isLocal && (!apiKey || !apiKey.trim())) {
    throw new Error(`API key for ${PROVIDERS[provider]?.name || provider} is missing. Please enter and save your key.`);
  }

  const hasText = Boolean(text && text.trim());
  const hasImage = Boolean(image && image.base64);

  if (!hasText && !hasImage) {
    throw new Error('Clipboard input is empty (neither text nor screenshot found).');
  }

  const effectivePrompt = systemPrompt || `You are an experienced human senior developer answering a coding question. Respond naturally and authentically like a real human programmer — NEVER sound like an AI.
CRITICAL RULES:
1. Explanations in Persian: ALL explanations, descriptions, or notes MUST be in natural, fluent Persian (فارسی روان و تخصصی).
2. Code in Java: ALL code, solutions, and implementations MUST be written in Java.
3. Natural Human Tone: Speak directly, concisely, and practically like an experienced colleague in a chat or Stack Overflow.`;

  switch (provider) {
    case 'gemini':
      return await callGeminiWithFailover({
        primaryKey: apiKey.trim(),
        backupKey: backupApiKey ? backupApiKey.trim() : null,
        model,
        systemPrompt: effectivePrompt,
        text,
        image,
        onKeySwitch
      });
    case 'openai':
      return await callOpenAICompatible({
        baseUrl: baseUrl || 'https://api.openai.com/v1',
        apiKey: apiKey ? apiKey.trim() : '',
        model: model || 'gpt-4o-mini',
        systemPrompt: effectivePrompt,
        text,
        image
      });
    case 'custom_openai':
      return await callOpenAICompatible({
        baseUrl: baseUrl || 'https://api.gapgpt.app/v1',
        apiKey: apiKey ? apiKey.trim() : '',
        model: model || 'gpt-5-nano',
        systemPrompt: effectivePrompt,
        text,
        image
      });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Google Gemini Dual-Key Failover Wrapper
async function callGeminiWithFailover({ primaryKey, backupKey, model, systemPrompt, text, image, onKeySwitch }) {
  try {
    return await callGemini(primaryKey, model, systemPrompt, text, image);
  } catch (err) {
    const isQuotaOrLimit = err.message.includes('429') ||
                           err.message.includes('RESOURCE_EXHAUSTED') ||
                           err.message.includes('quota') ||
                           err.message.includes('limit');

    // If Key #1 hits rate limits and user provided a Backup Key #2, switch automatically!
    if (isQuotaOrLimit && backupKey) {
      console.warn('Gemini Key #1 hit quota/rate limit (429). Automatically switching to Backup Key #2...');
      if (onKeySwitch) onKeySwitch(1, 2);
      try {
        return await callGemini(backupKey, model, systemPrompt, text, image);
      } catch (backupErr) {
        throw new Error(`Both Key #1 and Backup Key #2 failed. Backup Error: ${backupErr.message}`);
      }
    }

    // If quota exceeded but no backup key was provided, give helpful guidance
    if (isQuotaOrLimit && !backupKey) {
      throw new Error(`Gemini Key #1 reached account rate limits (429). Add a Backup Gemini Key (Key #2) in the right sidebar to avoid limits!`);
    }

    throw err;
  }
}

// Google Gemini Single-Call Multimodal API Handler
async function callGemini(apiKey, model, systemPrompt, text, image) {
  const targetModel = model || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

  const parts = [];

  // 1. Add Screenshot Image if present
  if (image && image.base64) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType || 'image/png',
        data: image.base64
      }
    });
  }

  // 2. Add Prompt and Text Instruction
  let promptText = '';
  if (image && text) {
    promptText = `${systemPrompt}\n\nHere is the screenshot and additional context/question:\n${text}`;
  } else if (image) {
    promptText = `${systemPrompt}\n\nAnalyze this screenshot. If there are multiple questions or problems shown in the image, answer EACH question separately and distinctly (e.g. سوال ۱، سوال ۲ و...). Provide exact, short, and effective answers.`;
  } else {
    promptText = text;
  }

  parts.push({ text: promptText });

  const payload = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: 'user',
        parts: parts
      }
    ],
    generationConfig: {
      temperature: 0.2
    }
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    throw new Error(`Network error contacting Gemini API: ${netErr.message}`);
  }

  const data = await response.json();

  if (!response.ok) {
    // If targetModel fails with 404, fallback to gemini-2.5-flash
    if (response.status === 404 && targetModel !== 'gemini-2.5-flash') {
      console.warn(`Model ${targetModel} not found, falling back to gemini-2.5-flash`);
      return await callGemini(apiKey, 'gemini-2.5-flash', systemPrompt, text, image);
    }
    const errMessage = data?.error?.message || `Gemini API Error (${response.status}): ${response.statusText}`;
    throw new Error(errMessage);
  }

  const candidate = data.candidates?.[0];
  if (!candidate || !candidate.content?.parts?.length) {
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error('Gemini response was blocked by safety filters.');
    }
    throw new Error('Gemini returned an empty response.');
  }

  return candidate.content.parts.map(p => p.text).join('').trim();
}

// Universal OpenAI-Compatible API Handler (OpenAI, OpenRouter, DeepSeek, Groq, Ollama, LM Studio, etc.)
// Supports Multimodal Screenshot Analysis with vision-capable models
async function callOpenAICompatible({ baseUrl, apiKey, model, systemPrompt, text, image }) {
  let cleanUrl = (baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  if (!cleanUrl.endsWith('/chat/completions')) {
    cleanUrl = `${cleanUrl}/chat/completions`;
  }

  const userContent = [];
  if (text) {
    userContent.push({ type: 'text', text: text });
  } else if (image) {
    userContent.push({ type: 'text', text: 'Analyze all questions, code, or problems shown in this screenshot. If there are multiple questions, answer EACH question separately and distinctly (e.g. سوال ۱، سوال ۲ و...). Provide exact, short and effective answers.' });
  }

  if (image && image.base64) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${image.mimeType || 'image/png'};base64,${image.base64}`
      }
    });
  }

  // Format payload
  const formattedUserContent = (image && image.base64)
    ? userContent
    : (text || 'Solve the code problem.');

  const payload = {
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: formattedUserContent }
    ],
    temperature: 0.3
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  // Helpful headers for OpenRouter
  if (cleanUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = window.location.origin || 'http://localhost:2080';
    headers['X-Title'] = 'Stack Overflow Copilot';
  }

  const response = await fetch(cleanUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errMessage = data?.error?.message ||
                       data?.message ||
                       `API Error (${response.status} from ${cleanUrl}): ${response.statusText}`;
    throw new Error(errMessage);
  }

  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) {
    throw new Error(`API returned an empty response from ${cleanUrl}.`);
  }

  return answer.trim();
}

// Fetch list of available models from any OpenAI-compatible endpoint (GET /models)
export async function fetchOpenAIModels({ baseUrl, apiKey }) {
  let cleanUrl = (baseUrl || 'https://api.gapgpt.app/v1').trim().replace(/\/+$/, '');
  if (cleanUrl.endsWith('/chat/completions')) {
    cleanUrl = cleanUrl.replace(/\/chat\/completions$/, '');
  }
  if (!cleanUrl.endsWith('/models')) {
    cleanUrl = `${cleanUrl}/models`;
  }

  const headers = {};
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }
  if (cleanUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = window.location.origin || 'http://localhost:2080';
    headers['X-Title'] = 'Stack Overflow Copilot';
  }

  const response = await fetch(cleanUrl, {
    method: 'GET',
    headers: headers
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errMessage = data?.error?.message ||
                       data?.message ||
                       `Failed to fetch models (${response.status} from ${cleanUrl}): ${response.statusText}`;
    throw new Error(errMessage);
  }

  let rawList = [];
  if (Array.isArray(data)) {
    rawList = data;
  } else if (Array.isArray(data?.data)) {
    rawList = data.data;
  } else if (Array.isArray(data?.models)) {
    rawList = data.models;
  }

  if (!rawList.length) {
    throw new Error(`No models found in the API response from ${cleanUrl}.`);
  }

  // Map to clean format: { id: string, name: string }
  const models = rawList.map(item => {
    const id = typeof item === 'string' ? item : (item.id || item.name);
    const name = typeof item === 'object' && item.name && item.name !== id
      ? `${item.name} (${id})`
      : id;
    return { id, name };
  }).filter(m => Boolean(m.id));

  // Sort models alphabetically
  models.sort((a, b) => a.id.localeCompare(b.id));

  return models;
}

// Fetch list of available models from Google Gemini API (GET /v1beta/models)
export async function fetchGeminiModels({ apiKey }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Please enter and save your Gemini API key first.');
  }

  const cleanKey = apiKey.trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;

  const response = await fetch(url, {
    method: 'GET'
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errMessage = data?.error?.message ||
                       data?.message ||
                       `Failed to fetch Gemini models (${response.status}): ${response.statusText}`;
    throw new Error(errMessage);
  }

  const rawList = data?.models || [];
  if (!rawList.length) {
    throw new Error('No models found in the Gemini API response.');
  }

  // Filter for models supporting content generation
  const validModels = rawList.filter(m => {
    const methods = m.supportedGenerationMethods || [];
    return methods.includes('generateContent');
  });

  const listToUse = validModels.length ? validModels : rawList;

  // Map to clean format: { id: string, name: string }
  const models = listToUse.map(item => {
    const rawId = item.name || '';
    const cleanId = rawId.replace(/^models\//, '');
    const displayName = item.displayName || cleanId;
    const name = displayName !== cleanId ? `⚡ ${displayName} (${cleanId})` : cleanId;
    return { id: cleanId, name };
  }).filter(m => Boolean(m.id));

  // Sort: prioritize flash models, then alphabetical
  models.sort((a, b) => {
    const aIsFlash = a.id.includes('flash');
    const bIsFlash = b.id.includes('flash');
    if (aIsFlash && !bIsFlash) return -1;
    if (!aIsFlash && bIsFlash) return 1;
    return a.id.localeCompare(b.id);
  });

  return models;
}
