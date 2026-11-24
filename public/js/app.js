// Main Application Controller & Orchestration Engine for Stack Overflow Copilot
// Supports Multimodal Screenshot Analysis, Dual Gemini Keys (Rate Limit Failover), and Clipboard Sync

import { sound } from './sound.js';
import { clipboard, normalizeText } from './clipboard.js';
import { PROVIDERS, callAI, fetchOpenAIModels, fetchGeminiModels } from './providers.js';
import { UIController } from './ui.js';

// Default Gemini API key provided by user
const DEFAULT_GEMINI_KEY = 'AQ.Ab8RN6Jug5V9Cks3DuZ_xNKI-o-GHsdorIO5zL4Usn3fFo0Geg';

// Default 3rd Party (GapGPT) API URL & Key provided by user
const DEFAULT_GAPGPT_URL = 'https://api.gapgpt.app/v1';
const DEFAULT_GAPGPT_KEY = 'sk-F4T2AxOQw9HcnrUBdfsbTF7Fsu5JZelWBjBRhBkeNxpSLsNX';

// Default 3rd Party #2 (AvalAI) API URL & Key provided by user
const DEFAULT_AVALAI_URL = 'https://api.avalai.ir/v1';
const DEFAULT_AVALAI_KEY = 'aa-d7tPVrnvwXyu03TJGpXfSPMkaesXshv98TqFM3P6p6aPmWzN';

// Default 3rd Party #3 (ArvanCloud AI) API URL & Key provided by user
const DEFAULT_ARVANCLOUD_URL = 'https://api.arvancloudai.ir/v1';
const DEFAULT_ARVANCLOUD_KEY = '44f82d65-9e2b-536f-a7af-c4a353735f3e';

// Prompt Presets tailored specifically for Java Level 7-8 (کارشناس ارشد) Exam
// Aligned with javatin-develop rubrics (Descriptive, Practical Coding Java 21, System Design C4 + ADR)
const DEFAULT_PRESET_ID = 'l78-descriptive';

const PRESET_LABELS = {
  'l78-descriptive': '📝 سطح ۷–۸: تشریحی',
  'l78-coding': '💻 سطح ۷–۸: عملی و کدی (Java 21)',
  'l78-design': '🏗️ سطح ۷–۸: طراحی سیستم (C4 + ADR)'
};

const PRESETS = {
  'l78-descriptive': `تو یک کارشناس ارشد جاوا (سطح ۷–۸) هستی و برای هر سؤال تشریحی فقط ۲ دقیقه وقت تایپ داری. پاسخ باید خیلی کوتاه، جمع‌وجور، مستقیم و ۱۰۰٪ شبیه تایپ سریع یک انسان در ۲ دقیقه باشد تا به هیچ وجه طولانی یا شبیه AI نباشد. مطلقاً سلام، مقدمه، توضیح اضافه یا جمع‌بندی ننویس.

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
- اگر چند سؤال در ورودی است، هرکدام را جدا با شماره‌ی خودش (مثل q1، q2 یا سوال ۱، سوال ۲) و هرکدام در همان سقف ۳ تا ۴ جمله جواب بده.`,

  'l78-coding': `تو یک کارشناس ارشد جاوا ۲۱ (سطح ۷–۸) هستی که وسط آزمون عملی ۴۰ دقیقه‌ای داری فایل analysis.md و کلاس‌های جاوا را اصلاح می‌کنی. هم تحلیل فارسی و هم کد جاوا باید ۱۰۰٪ مثل کار دست یک دولوپر ارشد واقعی باشد و به هیچ وجه مشخص نشود AI تولید کرده است. هیچ سلام، مقدمه یا توضیح اضافی بیرون از قالب ننویس.

ساختار خروجی (دقیقاً مطابق قالب analysis.md و روبریک ۱۰۰ امتیازی: analysis ۳۰ + redesign ۵۰ + tradeoffs ۲۰):

## نقاط ضعف
- ۳ تا ۴ ضعف اصلی کد را مستقیم و با نام دقیق مفاهیم همان ویژگی کیفی (Security، Continuity، Robustness، Performance & Scalability، Observability یا Consistency) توضیح بده که در تولید چه چیزی را می‌شکند؛ هرجا ربط دارد رفتار یا هدف قابل سنجش قبل و بعد بیاور (مثلاً RPO/RTO یا رفتار هنگام کندی/قطعی وابستگی).

## راه‌حل و تغییرهای کد
- کوتاه و سرراست توضیح بده هر تغییر چطور علت ریشه‌ای را حل می‌کند (نه دور زدن تست).
- سپس کد اصلاح‌شده‌ی فایل‌های تغییریافته را به **Java 21** با رعایت دقیق این اصول بنویس:
  ۱. **حفظ ۱۰۰٪ Public API:** نام کلاس‌ها، پکیج، سازنده‌ها، امضای متدهای عمومی و نوع خروجی‌ها را هرگز عوض نکن.
  ۲. **Deterministic و Portable:** به‌جای System.currentTimeMillis() یا Instant.now() فقط از Clock تزریق‌شده، و به‌جای Thread.sleep() مستقیم فقط از pauseHandler/مکانیزم تزریق‌شده استفاده کن. از StandardCharsets.UTF_8، Locale.ROOT و Path.of استفاده کن.
  ۳. **Thread-Safe و بی‌باگ:** Race Condition در Mapها و تغییر وضعیت‌ها نداشته باش، Semaphore/Lock را حتماً در finally آزاد کن و صف بی‌کران نساز.
  ۴. **جلوگیری از تله‌های رایج:** در Idempotency کلید قطعی از requestId بساز، درخواست هم‌زمان با همان requestId را یکتاسازی کن و در شکست پاکش کن تا قفل دائمی نشود؛ در Retry و Circuit Breaker خطای کسب‌وکاری/دائمی (مثل PaymentDeclinedException) را Retry نکن و خرابی مدار نشمار و فقط خطای گذرا را با Backoff فزاینده تکرار کن؛ در Bulkhead و Graceful Degradation خطای سرویس فرعی نباید جریان اصلی را بشکند.

## بده‌بستان‌ها و ریسک‌های باقی‌مانده
- صادقانه محدودیت‌های باقی‌مانده در تولید را بگو: تک‌نودی و حافظه‌ای بودن جدول Idempotency (نیاز به DB/Redis مشترک با TTL/Eviction)، ریسک خرابی نیمه‌تمام پس از یک اثر جانبی (نیاز به Outbox/Saga یا جبران)، بده‌بستان تنظیم آستانه‌های Circuit Breaker/Bulkhead و نبود Jitter در Backoff، نبود Timeout واقعی شبکه، پایش متریک‌ها و گزینه‌های جایگزین.

قوانین حیاتی برای غیرقابل‌تشخیص بودن از AI (هم در متن و هم در کد):
- **در متن analysis.md:** بدون ایموجی، بدون خط تیره‌ی بلند (—)، بدون ساختار تکراری «- **عنوان:** توضیح» (جمله‌های ساده و مستقیم دولوپری بنویس، بدون بولد کردن سر همه‌ی بندها) و بدون کلیشه‌ها و ترجمه‌زدگی‌های AI («می‌باشد»، «گردید»، «به منظور»، «توسط ... انجام می‌شود»، «شایان ذکر است»، «به طور کلی»، «رویکرد جامع»، «تضمین می‌کند»، «بسیار حیاتی است»).
- **در کد جاوا:** هیچ Javadoc اضافه، هیچ کامنت بدیهی و توضیح‌واضحات (مثل // check if open یا // release lock in finally)، هیچ کلاس/اینترفیس اضافی و Over-engineering که لازم نیست ننویس؛ تغییرها مینیمال، تمیز و دقیقاً در حد کار یک دولوپر ارشد در وقت ۴۰ دقیقه‌ای باشد و نام متغیرها کوتاه و طبیعی باشند (مثل failureCount، openUntil، inFlight).`,

  'l78-design': `تو یک معمار و کارشناس ارشد جاوا (سطح ۷–۸) هستی که وسط آزمون طراحی سیستم (۱۸۰ دقیقه یا تمرین ۶۰ دقیقه‌ای C4 / ADR) داری فایل‌های design.md، مشخصات c4.drawio و فایل‌های adr/ را می‌نویسی. نوشتار باید ۱۰۰٪ مثل طراحی واقعی یک مهندس ارشد باتجربه باشد (عمل‌گرا، مستدل، صادق درباره محدودیت‌ها) و اصلاً بوی متن آماده و کتابی هوش مصنوعی ندهد. هیچ سلام یا مقدمه‌ای ننویس. اگر ورودی فقط C4 یا فقط ADR خواست، فقط همان بخش را بده.

### بخش ۱: متن آماده برای design.md (دقیقاً با همین ۵ سرتیتر)
## فرض‌ها
- فرض‌های عددی رند، معقول و عمل‌گرا (مثلاً تعداد کلینیک/کاربر، تراکنش روزانه، پیک ۵ تا ۱۰ برابری، نسبت خواندن به نوشتن، حجم ذخیره و نگهداری) که در ادامه‌ی طراحی واقعاً به کار بروند (نه عددهای عجیب و ساختگی مثل ۴۷٬۳۸۲٫۵).

## نیازمندی‌ها و ویژگی‌های کیفی
- محدوده‌ی کارکردی، نقش‌ها و سیستم‌های بیرونی را سرراست مشخص کن.
- ویژگی‌های کیفی سناریو را با دلیل و هدف قابل سنجش (SLO، P99، RPO/RTO) اولویت‌بندی کن و برای تک‌تک آن‌ها راهکار ملموس طراحی را بیاور: سازگاری و جلوگیری از Double-Booking (قید یکتایی، رزرو موقت با TTL، Idempotency)، تاب‌آوری و نبود تک‌نقطه‌ی شکست در DB و Broker، امنیت (TLS، رمزنگاری در سکون، RBAC و جداسازی مستأجران مثل tenant_id + RLS، Audit Log و نبود PII در لاگ)، مقیاس‌پذیری (Stateless، کش با استراتژی ابطال و Rate Limiting)، استقرار بی‌توقف (Rolling/Canary و Expand-Contract) و دیده‌پذیری (متریک SLO، Tracing با Correlation ID و هشدار روی نشانه‌ها).

## برآورد ظرفیت
- محاسبه‌ی ساده، سرانگشتی و شفاف QPS عادی و پیک، پهنای باند، حجم ذخیره و حافظه‌ی Cache بر پایه‌ی فرض‌های بالا.

## جریان‌های اصلی
- توضیح قدم‌به‌قدم و روان جریان‌های کلیدی (مسیر هم‌زمان، مسیر ناهم‌زمان با Outbox/Broker و رفتار هنگام کندی/قطعی وابستگی بیرونی).

## ریسک‌ها و کارهای بعدی
- ریسک‌های واقعی باقی‌مانده، راهکار مهار هر ریسک و تست‌های لازم (آزمون بار، Failover و Chaos).

### بخش ۲: مدل دقیق نمودارهای c4.drawio (برای کتابخانه‌ی C4 در draw.io)
برای هر دو برگه، عناصر را با c4Name، c4Technology و c4Description و فلش‌های Relationship (مبدأ -> مقصد: هدف [پروتکل]) بنویس:
- **برگه‌ی System Context:** سامانه فقط به شکل یک Software System واحد (بدون DB یا سرویس داخلی) + همه‌ی Personها و Software Systemهای external + ارتباط‌های جهت‌دار با هدف و پروتکل.
- **برگه‌ی Container:** فقط واحدهای قابل استقرار واقعی درون System scope boundary (هرگز کلاس، Controller، Service یا Repository نیاور) با c4Technology مشخص (مثل Java 21, Spring Boot / PostgreSQL / Redis / Kafka) + مدل کردن صریح Data Container (DB و Cache) و Message Bus Container (Queue/Broker) و سازگاری کامل با برگه‌ی Context.

### بخش ۳: فایل‌های ADR آماده (۲ تا ۳ تصمیم کلیدی برای adr/0001.md و adr/0002.md)
فقط پرپیامدترین تصمیم‌های معماری را انتخاب کن (نه موضوعات فرعی مثل فریم‌ورک فرانت‌اند). هر ADR دقیقاً با همین قالب باشد:
- \`# ADR: عنوان کوتاه تصمیم\` و \`- وضعیت: پیشنهادی\`
- \`## زمینه\` (محرک‌های سناریو و فرض‌های عددی مرتبط)
- \`## تصمیم\` (تصمیم روشن و عمل‌گرا + دقیقاً چه چیزی را قربانی کرده‌ایم)
- \`## گزینه‌های بررسی‌شده\` (جدول \`| گزینه | مزیت | عیب |\` با حداقل ۳ گزینه‌ی واقعی و بدون گزینه‌ی پوشالی)
- \`## پیامدها\` با سه بند \`- خوب:\`، \`- بد:\` (ریسک + راهکار کاهش ریسک) و \`- بعدی:\` (کارهای بعدی + روش سنجش و شرط بازنگری تصمیم).

قوانین حیاتی برای طبیعی و انسانی بودن (غیرقابل تشخیص از AI):
- مطلقاً هیچ ایموجی (✅ ❌ ⚡ 📌)، هیچ خط تیره‌ی بلند (—)، و هیچ الگوی تکراری «- **عنوان:** توضیح» به کار نبر؛ ساده، صریح و مثل مستند فنی یک معمار واقعی بنویس.
- به‌جای شعارهای کتابی و buzzwordبازی (مثل «با میکروسرویس و کوبرنتیز مقیاس‌پذیری تضمین می‌شود»)، تصمیم‌های عمل‌گرا و متناسب با اندازه‌ی واقعی سیستم بگیر (مثلاً شروع با Modular Monolith + Worker جدا اگر توجیه دارد، و بیان دقیق شرط شکستن در آینده).
- اکیداً از عبارت‌های لو‌دهنده‌ی AI و ترجمه‌زدگی دوری کن: «در دنیای واقعی»، «بسیار حیاتی است»، «نقش کلیدی»، «رویکرد جامع»، «تضمین می‌کند»، «چالش‌های متعددی»، «شایان ذکر است»، «در واقع می‌توان گفت»، «به طور کلی»، «می‌باشد»، «گردید/می‌گردد»، «به منظور»، «توسط ... انجام می‌شود»، «مورد استفاده قرار می‌گیرد»، «اقدام به ... نمودن».
- فارسی روان با فعل معلوم؛ نام فناوری‌ها و اصطلاحات فنی به انگلیسی و پسوند فارسی بدون فاصله (Serviceها، APIهای).`
};

class App {
  constructor() {
    this.ui = new UIController();

    // App State
    this.currentProvider = 'custom_openai';
    this.apiKeys = {
      gemini: DEFAULT_GEMINI_KEY,
      geminiBackup: '',
      openai: '',
      custom_openai: DEFAULT_GAPGPT_KEY,
      avalai: DEFAULT_AVALAI_KEY,
      arvancloud: DEFAULT_ARVANCLOUD_KEY
    };
    this.apiUrls = {
      openai: 'https://api.openai.com/v1',
      custom_openai: DEFAULT_GAPGPT_URL,
      avalai: DEFAULT_AVALAI_URL,
      arvancloud: DEFAULT_ARVANCLOUD_URL
    };
    this.selectedModels = {
      gemini: PROVIDERS.gemini.defaultModel,
      openai: PROVIDERS.openai.defaultModel,
      custom_openai: 'deepseek-v4.1-flash',
      avalai: 'deepseek-v4.1-flash',
      arvancloud: 'DeepSeek-V4.1-Flash'
    };
    this.customModels = {
      custom_openai: 'deepseek-v4.1-flash',
      avalai: 'deepseek-v4.1-flash',
      arvancloud: 'DeepSeek-V4.1-Flash'
    };
    this.fetchedModels = {};
    this.autoSync = false; // Default: Inactive (do not auto-read clipboard)
    this.soundEnabled = true;
    this.notificationEnabled = false;
    this.dedupEnabled = true;
    this.currentPreset = DEFAULT_PRESET_ID;
    this.systemPrompt = PRESETS[DEFAULT_PRESET_ID];
    this.history = [];
    this.stagedScreenshot = null; // { mimeType, base64, dataUrl, hash, size }

    this.init();
  }

  init() {
    this.loadStateFromStorage();
    this.setupUI();
    this.setupEventListeners();
    this.checkInitialPermissions();
    this.updateProviderView();
    this.ui.renderHistory(this.history, (text) => this.copyTextDirect(text));
    this.ui.setReady(this.hasActiveKey(), this.autoSync);
    this.loadFromExtensionStorageAsync();
    this.initMessageListeners();
  }

  // Load persistence
  loadStateFromStorage() {
    try {
      const storedKeys = localStorage.getItem('cbai_api_keys');
      if (storedKeys) {
        this.apiKeys = { ...this.apiKeys, ...JSON.parse(storedKeys) };
      }

      // Always guarantee default Gemini key if none is present
      if (!this.apiKeys.gemini || !this.apiKeys.gemini.trim()) {
        this.apiKeys.gemini = DEFAULT_GEMINI_KEY;
      }

      // Strictly restore GapGPT 3rd-party key if missing or overwritten
      if (!this.apiKeys.custom_openai || !this.apiKeys.custom_openai.trim() || this.apiKeys.custom_openai.startsWith('44f82d65') || this.apiKeys.custom_openai.startsWith('aa-')) {
        this.apiKeys.custom_openai = DEFAULT_GAPGPT_KEY;
      }

      // Preload AvalAI 3rd-party key if none is present or corrupted
      if (!this.apiKeys.avalai || !this.apiKeys.avalai.trim() || this.apiKeys.avalai.startsWith('sk-') || this.apiKeys.avalai.startsWith('44f82d65')) {
        this.apiKeys.avalai = DEFAULT_AVALAI_KEY;
      }

      // Preload ArvanCloud 3rd-party key if none is present or corrupted
      if (!this.apiKeys.arvancloud || !this.apiKeys.arvancloud.trim() || this.apiKeys.arvancloud.startsWith('sk-') || this.apiKeys.arvancloud.startsWith('aa-')) {
        this.apiKeys.arvancloud = DEFAULT_ARVANCLOUD_KEY;
      }

      const storedProvider = localStorage.getItem('cbai_provider');
      if (storedProvider && PROVIDERS[storedProvider]) {
        this.currentProvider = storedProvider;
      } else {
        this.currentProvider = 'custom_openai';
      }

      const storedUrls = localStorage.getItem('cbai_api_urls');
      if (storedUrls) {
        this.apiUrls = { ...this.apiUrls, ...JSON.parse(storedUrls) };
      }

      // Strictly restore GapGPT URL (never let it point to ArvanCloud or OpenRouter)
      if (!this.apiUrls.custom_openai || this.apiUrls.custom_openai.includes('arvancloud') || this.apiUrls.custom_openai.includes('openrouter.ai')) {
        this.apiUrls.custom_openai = DEFAULT_GAPGPT_URL;
      }

      // Strictly enforce AvalAI URL
      if (!this.apiUrls.avalai || !this.apiUrls.avalai.includes('avalai')) {
        this.apiUrls.avalai = DEFAULT_AVALAI_URL;
      }

      // Strictly enforce ArvanCloud URL
      if (!this.apiUrls.arvancloud || !this.apiUrls.arvancloud.includes('arvancloud')) {
        this.apiUrls.arvancloud = DEFAULT_ARVANCLOUD_URL;
      }

      this.saveKeys();

      const storedCustomModels = localStorage.getItem('cbai_custom_models');
      if (storedCustomModels) {
        this.customModels = { ...this.customModels, ...JSON.parse(storedCustomModels) };
      }

      const storedModels = localStorage.getItem('cbai_models');
      if (storedModels) this.selectedModels = { ...this.selectedModels, ...JSON.parse(storedModels) };

      // Set default model for both 3rd-party providers (GapGPT and AvalAI) to deepseek-v4.1-flash
      const deepseekMigrated = localStorage.getItem('cbai_deepseek_flash_v5');
      if (!deepseekMigrated) {
        this.selectedModels.custom_openai = 'deepseek-v4.1-flash';
        this.selectedModels.avalai = 'deepseek-v4.1-flash';
        this.customModels.custom_openai = 'deepseek-v4.1-flash';
        this.customModels.avalai = 'deepseek-v4.1-flash';
        this.apiKeys.avalai = DEFAULT_AVALAI_KEY;
        this.apiUrls.avalai = DEFAULT_AVALAI_URL;
        try {
          localStorage.setItem('cbai_models', JSON.stringify(this.selectedModels));
          localStorage.setItem('cbai_custom_models', JSON.stringify(this.customModels));
          localStorage.setItem('cbai_api_keys', JSON.stringify(this.apiKeys));
          localStorage.setItem('cbai_api_urls', JSON.stringify(this.apiUrls));
          localStorage.setItem('cbai_deepseek_flash_v5', 'true');
        } catch (e) {}
      }

      const storedFetchedModels = localStorage.getItem('cbai_fetched_models');
      if (storedFetchedModels) {
        try {
          this.fetchedModels = JSON.parse(storedFetchedModels);
        } catch (e) {
          console.warn('Could not parse cached models:', e);
        }
      }

      // Auto-sync on tab switch is permanently disabled to prevent intrusive clipboard reading
      this.autoSync = false;
      localStorage.setItem('cbai_autosync_v2', 'false');

      const storedSound = localStorage.getItem('cbai_sound');
      if (storedSound !== null) this.soundEnabled = storedSound === 'true';

      const storedDedup = localStorage.getItem('cbai_dedup');
      if (storedDedup !== null) this.dedupEnabled = storedDedup === 'true';

      const l78Migrated = localStorage.getItem('cbai_l78_presets_v3');
      const storedPreset = localStorage.getItem('cbai_preset');
      const storedPrompt = localStorage.getItem('cbai_prompt');

      if (!l78Migrated || !storedPreset || !PRESETS[storedPreset]) {
        this.currentPreset = DEFAULT_PRESET_ID;
        this.systemPrompt = PRESETS[DEFAULT_PRESET_ID];
        try {
          localStorage.setItem('cbai_preset', this.currentPreset);
          localStorage.setItem('cbai_prompt', this.systemPrompt);
          localStorage.setItem('cbai_l78_presets_v3', 'true');
        } catch (e) {}
      } else {
        this.currentPreset = storedPreset;
        this.systemPrompt = (storedPrompt && storedPrompt.trim()) ? storedPrompt : PRESETS[this.currentPreset];
      }

      const storedHistory = localStorage.getItem('cbai_history');
      if (storedHistory) {
        this.history = JSON.parse(storedHistory);
        if (Array.isArray(this.history)) {
          this.history.forEach(item => {
            if (item && item.output) clipboard.registerOutput(item.output);
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load local storage state:', e);
    }

    sound.enabled = this.soundEnabled;
    clipboard.dedupEnabled = this.dedupEnabled;
  }

  saveKeys() {
    try {
      localStorage.setItem('cbai_api_keys', JSON.stringify(this.apiKeys));
      localStorage.setItem('cbai_api_urls', JSON.stringify(this.apiUrls));
      localStorage.setItem('cbai_custom_models', JSON.stringify(this.customModels));
    } catch (e) {
      console.warn('Could not persist keys to localStorage (e.g. file:// security restriction):', e);
    }
    this.syncToExtensionStorage();
    this.updateKeyBadge();
  }

  syncToExtensionStorage() {
    const ext = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
    if (!ext || !ext.storage || !ext.storage.local) return;

    const data = {
      cbai_provider: this.currentProvider,
      cbai_api_keys: this.apiKeys,
      cbai_api_urls: this.apiUrls,
      cbai_models: this.selectedModels,
      cbai_custom_models: this.customModels,
      cbai_prompt: this.systemPrompt,
      cbai_preset: this.currentPreset,
      cbai_l78_presets_v3: true,
      cbai_history: this.history.slice(0, 30)
    };

    try {
      if (typeof ext.storage.local.set === 'function') {
        const res = ext.storage.local.set(data, () => {
          if (ext.runtime?.lastError) {
            console.warn('Storage sync error:', ext.runtime.lastError);
          }
        });
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Could not sync to extension storage:', e);
    }
  }

  loadFromExtensionStorageAsync() {
    const ext = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
    if (!ext || !ext.storage || !ext.storage.local) return;

    try {
      ext.storage.local.get(null, (stored) => {
        if (!stored) return;
        let changed = false;

        if (stored.cbai_provider && PROVIDERS[stored.cbai_provider]) {
          this.currentProvider = stored.cbai_provider;
          changed = true;
        }
        if (stored.cbai_api_keys) {
          this.apiKeys = { ...this.apiKeys, ...stored.cbai_api_keys };
          if (!this.apiKeys.custom_openai || this.apiKeys.custom_openai.startsWith('44f82d65') || this.apiKeys.custom_openai.startsWith('aa-')) {
            this.apiKeys.custom_openai = DEFAULT_GAPGPT_KEY;
          }
          if (!this.apiKeys.arvancloud || this.apiKeys.arvancloud.startsWith('sk-')) {
            this.apiKeys.arvancloud = DEFAULT_ARVANCLOUD_KEY;
          }
          if (!this.apiKeys.avalai || this.apiKeys.avalai.startsWith('sk-')) {
            this.apiKeys.avalai = DEFAULT_AVALAI_KEY;
          }
          changed = true;
        }
        if (stored.cbai_api_urls) {
          this.apiUrls = { ...this.apiUrls, ...stored.cbai_api_urls };
          if (!this.apiUrls.custom_openai || this.apiUrls.custom_openai.includes('arvancloud') || this.apiUrls.custom_openai.includes('openrouter.ai')) {
            this.apiUrls.custom_openai = DEFAULT_GAPGPT_URL;
          }
          if (!this.apiUrls.arvancloud || !this.apiUrls.arvancloud.includes('arvancloud')) {
            this.apiUrls.arvancloud = DEFAULT_ARVANCLOUD_URL;
          }
          if (!this.apiUrls.avalai || !this.apiUrls.avalai.includes('avalai')) {
            this.apiUrls.avalai = DEFAULT_AVALAI_URL;
          }
          changed = true;
        }
        if (stored.cbai_models) {
          this.selectedModels = { ...this.selectedModels, ...stored.cbai_models };
          changed = true;
        }
        if (stored.cbai_custom_models) {
          this.customModels = { ...this.customModels, ...stored.cbai_custom_models };
          changed = true;
        }
        if (stored.cbai_l78_presets_v3 && stored.cbai_preset && PRESETS[stored.cbai_preset]) {
          this.currentPreset = stored.cbai_preset;
          this.systemPrompt = (stored.cbai_prompt && stored.cbai_prompt.trim())
            ? stored.cbai_prompt
            : PRESETS[this.currentPreset];
          this.updatePresetUI();
          changed = true;
        } else {
          // Overwrite stale legacy presets in extension storage with Level 7-8 default
          this.currentPreset = DEFAULT_PRESET_ID;
          this.systemPrompt = PRESETS[DEFAULT_PRESET_ID];
          this.updatePresetUI();
          this.syncToExtensionStorage();
        }

        // Check for newly cropped screenshot from extension overlay (Ctrl+Alt+Shift)
        if (stored.cbai_staged_screenshot && stored.cbai_new_crop_pending) {
          this.applyCroppedScreenshot(stored.cbai_staged_screenshot);
          try {
            ext.storage.local.set({ cbai_new_crop_pending: false });
          } catch (e) {}
        }

        if (changed) {
          this.updateProviderView();
          this.ui.setReady(this.hasActiveKey(), this.autoSync);
        }
      });
    } catch (e) {}
  }

  initMessageListeners() {
    const ext = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
    if (ext && ext.runtime?.onMessage) {
      ext.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'new_cropped_screenshot' && msg.screenshot) {
          this.applyCroppedScreenshot(msg.screenshot);
        }
        if (msg.action === 'background_answer_ready' && msg.answer) {
          clipboard.registerOutput(msg.answer);
          if (msg.question) {
            this.ui.setInputText(msg.question);
          }
          this.ui.setOutputText(msg.answer, { isMobileScreenshot: false });
          this.ui.setSuccess('Solution copied to clipboard! Press Ctrl+V to paste.', { isMobileScreenshot: false });
        }
      });
    }
  }

  applyCroppedScreenshot(screenshot) {
    if (!screenshot || !screenshot.dataUrl) return;
    this.stagedScreenshot = screenshot;
    this.ui.setScreenshotPreview(this.stagedScreenshot);
    const provName = PROVIDERS[this.currentProvider]?.name || 'AI';
    this.ui.showToast(`📸 اسکرین‌شات کراپ شده با موفقیت وارد شد! آماده حل با ${provName}.`, 'success');
  }

  saveHistory() {
    try {
      localStorage.setItem('cbai_history', JSON.stringify(this.history.slice(0, 30)));
    } catch (e) {
      console.warn('Could not persist history to localStorage:', e);
    }
    this.ui.renderHistory(this.history, (text) => this.copyTextDirect(text));
  }

  hasActiveKey() {
    if (this.currentProvider === 'custom_openai' || this.currentProvider === 'avalai' || this.currentProvider === 'arvancloud') {
      const url = this.apiUrls[this.currentProvider] || '';
      // For local Ollama or local LM Studio endpoints, API key is optional
      if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes(':11434')) {
        return true;
      }
    }
    return Boolean(this.apiKeys[this.currentProvider]?.trim());
  }

  setupUI() {
    // Toggles
    const toggleAutoSync = document.getElementById('toggle-autosync');
    if (toggleAutoSync) toggleAutoSync.checked = this.autoSync;
    this.updateAutoSyncStatusLabel();

    const toggleSound = document.getElementById('toggle-sound');
    if (toggleSound) toggleSound.checked = this.soundEnabled;

    const toggleDedup = document.getElementById('toggle-dedup');
    if (toggleDedup) toggleDedup.checked = this.dedupEnabled;

    // Presets
    this.updatePresetUI();
  }

  updatePresetUI() {
    const presetSelect = document.getElementById('preset-select');
    if (presetSelect && PRESETS[this.currentPreset]) {
      presetSelect.value = this.currentPreset;
    }

    const promptTextarea = document.getElementById('system-prompt');
    if (promptTextarea) promptTextarea.value = this.systemPrompt;

    document.querySelectorAll('.so-preset-pill').forEach(btn => {
      const id = btn.getAttribute('data-preset-id');
      btn.classList.toggle('active', id === this.currentPreset);
    });
  }

  selectPreset(presetId, { notify = true } = {}) {
    if (!presetId || !PRESETS[presetId]) return;
    this.currentPreset = presetId;
    this.systemPrompt = PRESETS[presetId];
    try {
      localStorage.setItem('cbai_preset', this.currentPreset);
      localStorage.setItem('cbai_prompt', this.systemPrompt);
      localStorage.setItem('cbai_l78_presets_v3', 'true');
    } catch (e) {}
    this.updatePresetUI();
    this.syncToExtensionStorage();
    if (notify) {
      this.ui.showToast(`پرامپت فعال شد: ${PRESET_LABELS[presetId] || presetId}`, 'info');
    }
  }

  updateAutoSyncStatusLabel() {
    const lbl = document.getElementById('autosync-status-label');
    if (lbl) {
      lbl.textContent = 'Disabled (Manual)';
      lbl.style.color = 'var(--so-text-muted)';
    }
    const metaMode = document.getElementById('meta-sync-mode');
    if (metaMode) {
      metaMode.textContent = 'Manual Mode (Click / Space / Paste to Solve)';
      metaMode.className = 'so-highlight';
    }
  }

  setupEventListeners() {
    // Note: Automatic reading on window focus/tab switch is intentionally disabled
    // to prevent unwanted clipboard reading every time the user enters the tab.
    // Users can solve on demand via: Space key, Ctrl+Enter, "Process Clipboard" button, or Ctrl+V paste.

    // --- Global Paste Listener (Captures pasted screenshots anywhere on the page) ---
    window.addEventListener('paste', async (e) => {
      if (!e.clipboardData || !e.clipboardData.items) return;

      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const { base64, dataUrl } = await clipboard.blobToBase64(file);
            this.stagedScreenshot = {
              mimeType: file.type || 'image/png',
              base64: base64,
              dataUrl: dataUrl,
              hash: `${file.size}_${base64.slice(0, 100)}`,
              size: file.size
            };
            this.ui.setScreenshotPreview(this.stagedScreenshot);
            const provName = PROVIDERS[this.currentProvider]?.name || 'AI';
            this.ui.showToast(`تصویر پیست شد! در حال شروع حل با ${provName}...`, 'info');
            this.runPipeline({ isAuto: false, forcedImage: this.stagedScreenshot });
            return;
          }
        }
      }
    });

    // --- Drag & Drop Screenshot Images into the Browser ---
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
          const { base64, dataUrl } = await clipboard.blobToBase64(file);
          this.stagedScreenshot = {
            mimeType: file.type || 'image/png',
            base64: base64,
            dataUrl: dataUrl,
            hash: `${file.size}_${base64.slice(0, 100)}`,
            size: file.size
          };
          this.ui.setScreenshotPreview(this.stagedScreenshot);
          const provName = PROVIDERS[this.currentProvider]?.name || 'AI';
          this.ui.showToast(`تصویر دریافت شد! در حال تحلیل با ${provName}...`, 'info');
          this.runPipeline({ isAuto: false, forcedImage: this.stagedScreenshot });
        }
      }
    });

    // --- File Upload Input for Screenshots / Images ---
    const filePicker = document.getElementById('file-image-picker');
    document.getElementById('btn-upload-file')?.addEventListener('click', () => {
      filePicker?.click();
    });
    filePicker?.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const { base64, dataUrl } = await clipboard.blobToBase64(file);
        this.stagedScreenshot = {
          mimeType: file.type || 'image/png',
          base64: base64,
          dataUrl: dataUrl,
          hash: `${file.size}_${base64.slice(0, 100)}`,
          size: file.size
        };
        this.ui.setScreenshotPreview(this.stagedScreenshot);
        const provName = PROVIDERS[this.currentProvider]?.name || 'AI';
        this.ui.showToast(`تصویر بارگذاری شد! در حال تحلیل با ${provName}...`, 'info');
        this.runPipeline({ isAuto: false, forcedImage: this.stagedScreenshot });
        e.target.value = '';
      }
    });

    // --- Screen Cropping Button (Ctrl+Alt+Shift) ---
    document.getElementById('btn-crop-screen')?.addEventListener('click', async () => {
      const ext = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
      if (ext && ext.tabs) {
        try {
          const tabs = await new Promise(res => {
            ext.tabs.query({ active: true, currentWindow: true }, (t) => res(t || []));
          });
          if (tabs && tabs[0]?.id) {
            ext.tabs.sendMessage(tabs[0].id, { action: 'start_crop_selection' });
            if (window.location.pathname.includes('popup.html')) {
              window.close();
            }
          }
        } catch (e) {
          console.warn('Could not trigger crop:', e);
        }
      } else {
        this.ui.showToast('در اکستنشن با Ctrl+Shift+X یا Ctrl+Shift+A (بدون انتخاب متن) صفحه را کراپ کنید.', 'info');
      }
    });

    // Remove screenshot button
    document.getElementById('btn-remove-screenshot')?.addEventListener('click', () => {
      this.stagedScreenshot = null;
      this.ui.clearScreenshotPreview();
      this.ui.showToast('Screenshot removed', 'info');
    });

    // --- Mobile Camera Capture Integration ---
    const cameraInput = document.getElementById('camera-input');
    const triggerCamera = () => {
      cameraInput?.click();
    };

    document.getElementById('btn-camera')?.addEventListener('click', triggerCamera);
    document.getElementById('btn-camera-inline')?.addEventListener('click', triggerCamera);
    document.getElementById('btn-mobile-camera-bar')?.addEventListener('click', triggerCamera);

    cameraInput?.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
          try {
            const { base64, dataUrl } = await clipboard.blobToBase64(file);
            this.stagedScreenshot = {
              mimeType: file.type || 'image/jpeg',
              base64: base64,
              dataUrl: dataUrl,
              hash: `${file.size}_${base64.slice(0, 100)}`,
              size: file.size
            };
            this.ui.setScreenshotPreview(this.stagedScreenshot);
            this.ui.showToast('Photo captured! Solving with Gemini...', 'info');
            this.runPipeline({ isAuto: false, forcedImage: this.stagedScreenshot });
          } catch (err) {
            this.ui.showToast('Failed to process photo: ' + err.message, 'error');
          } finally {
            e.target.value = '';
          }
        }
      }
    });

    // --- Mobile Sticky Bottom Bar Actions ---
    document.getElementById('btn-mobile-process-bar')?.addEventListener('click', () => {
      this.runPipeline({ isAuto: false });
    });

    document.getElementById('btn-mobile-copy-bar')?.addEventListener('click', async () => {
      const outText = document.getElementById('text-output')?.value;
      if (outText && outText.trim()) {
        await this.copyTextDirect(outText);
        this.ui.showToast('Copied answer to clipboard!', 'success');
      } else {
        this.ui.showToast('No solution to copy yet', 'info');
      }
    });

    // --- Mobile Sidebar Drawer Toggle ---
    const toggleMobileSidebar = (open) => {
      const sidebar = document.querySelector('.so-right-sidebar');
      const backdrop = document.getElementById('mobile-sidebar-backdrop');
      if (!sidebar) return;
      const isOpen = open !== undefined ? open : !sidebar.classList.contains('mobile-open');
      sidebar.classList.toggle('mobile-open', isOpen);
      backdrop?.classList.toggle('active', isOpen);
    };

    document.getElementById('btn-mobile-settings')?.addEventListener('click', () => toggleMobileSidebar(true));
    document.getElementById('btn-mobile-settings-bar')?.addEventListener('click', () => toggleMobileSidebar(true));
    document.getElementById('btn-close-sidebar')?.addEventListener('click', () => toggleMobileSidebar(false));
    document.getElementById('btn-done-sidebar')?.addEventListener('click', () => toggleMobileSidebar(false));
    document.getElementById('mobile-sidebar-backdrop')?.addEventListener('click', () => toggleMobileSidebar(false));

    // Extension Action Buttons
    document.getElementById('btn-ext-sidepanel')?.addEventListener('click', async () => {
      if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.open) {
        try {
          const win = await chrome.windows.getCurrent();
          await chrome.sidePanel.open({ windowId: win.id });
          window.close();
        } catch (e) {
          chrome.tabs.create({ url: 'sidepanel.html' });
        }
      } else if (typeof browser !== 'undefined' && browser.sidebarAction && browser.sidebarAction.open) {
        try {
          browser.sidebarAction.open();
          window.close();
        } catch(e) {
          browser.tabs.create({ url: 'sidepanel.html' });
        }
      } else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: 'sidepanel.html' });
      }
    });

    document.getElementById('btn-ext-fullscreen')?.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: 'fullscreen.html' });
      } else if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.create) {
        browser.tabs.create({ url: 'fullscreen.html' });
      } else {
        window.open('index.html', '_blank');
      }
    });

    document.getElementById('btn-ext-settings')?.addEventListener('click', () => {
      toggleMobileSidebar(true);
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInput = activeTag === 'input' || activeTag === 'textarea';

      // Space trigger if not typing in input
      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        this.runPipeline({ isAuto: false });
      }

      // Ctrl+Enter or Cmd+Enter anytime
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.runPipeline({ isAuto: false });
      }

      // Escape closes modals
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    // Manual Action Button
    document.getElementById('btn-manual-process')?.addEventListener('click', () => {
      this.runPipeline({ isAuto: false });
    });

    // Auto-sync toggle
    document.getElementById('toggle-autosync')?.addEventListener('change', (e) => {
      this.autoSync = false;
      e.target.checked = false;
      localStorage.setItem('cbai_autosync_v2', 'false');
      this.updateAutoSyncStatusLabel();
      this.ui.showToast('برای جلوگیری از خواندن ناخواسته در هر تعویض تب، پردازش فقط با دکمه Solve یا کلید Space یا Ctrl+V انجام می‌شود.', 'info');
      this.ui.setReady(this.hasActiveKey(), false);
    });

    // Sound toggle
    document.getElementById('toggle-sound')?.addEventListener('change', (e) => {
      this.soundEnabled = e.target.checked;
      sound.enabled = this.soundEnabled;
      localStorage.setItem('cbai_sound', String(this.soundEnabled));
      if (this.soundEnabled) sound.playSuccess();
    });

    // Dedup toggle
    document.getElementById('toggle-dedup')?.addEventListener('change', (e) => {
      this.dedupEnabled = e.target.checked;
      clipboard.dedupEnabled = this.dedupEnabled;
      localStorage.setItem('cbai_dedup', String(this.dedupEnabled));
    });

    // Notification toggle
    document.getElementById('toggle-notification')?.addEventListener('change', async (e) => {
      if (e.target.checked) {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            this.notificationEnabled = true;
            this.ui.showToast('Desktop alerts enabled', 'success');
          } else {
            e.target.checked = false;
            this.notificationEnabled = false;
            this.ui.showToast('Desktop alert permission denied', 'error');
          }
        }
      } else {
        this.notificationEnabled = false;
      }
    });

    // Provider Tabs
    document.querySelectorAll('.so-tab-btn, .provider-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const provider = tab.getAttribute('data-provider');
        if (provider && PROVIDERS[provider]) {
          this.currentProvider = provider;
          localStorage.setItem('cbai_provider', provider);
          this.updateProviderView();
          this.syncToExtensionStorage();
        }
      });
    });

    // Primary API Key input & buttons
    const keyInput = document.getElementById('api-key-input');
    const btnToggleKey = document.getElementById('btn-toggle-key');
    const btnSaveKey = document.getElementById('btn-save-key');

    btnToggleKey?.addEventListener('click', () => {
      if (keyInput) {
        keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
        btnToggleKey.textContent = keyInput.type === 'password' ? '👁️' : '🙈';
      }
    });

    btnSaveKey?.addEventListener('click', () => {
      if (keyInput) {
        const val = keyInput.value.trim();
        this.apiKeys[this.currentProvider] = val;
        this.saveKeys();
        this.ui.showToast(`${PROVIDERS[this.currentProvider].name} Key #1 saved locally!`, 'success');
        this.ui.setReady(this.hasActiveKey(), this.autoSync);
      }
    });

    keyInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        btnSaveKey?.click();
      }
    });

    // Backup API Key (Key 2) input & buttons for Gemini Failover
    const backupKeyInput = document.getElementById('api-key-backup-input');
    const btnToggleBackupKey = document.getElementById('btn-toggle-backup-key');
    const btnSaveBackupKey = document.getElementById('btn-save-backup-key');

    btnToggleBackupKey?.addEventListener('click', () => {
      if (backupKeyInput) {
        backupKeyInput.type = backupKeyInput.type === 'password' ? 'text' : 'password';
        btnToggleBackupKey.textContent = backupKeyInput.type === 'password' ? '👁️' : '🙈';
      }
    });

    btnSaveBackupKey?.addEventListener('click', () => {
      if (backupKeyInput) {
        const val = backupKeyInput.value.trim();
        this.apiKeys.geminiBackup = val;
        this.saveKeys();
        this.ui.showToast('Gemini Backup Key #2 saved! Auto-failover ready.', 'success');
        this.updateKeyBadge();
      }
    });

    backupKeyInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        btnSaveBackupKey?.click();
      }
    });

    // 3rd Party API Base URL input & save
    const urlInput = document.getElementById('api-url-input');
    const btnSaveUrl = document.getElementById('btn-save-url');

    btnSaveUrl?.addEventListener('click', () => {
      if (urlInput) {
        const val = urlInput.value.trim();
        if (val) {
          this.apiUrls[this.currentProvider] = val;
          this.saveKeys();
          this.ui.showToast('API Base URL saved!', 'success');
          this.ui.setReady(this.hasActiveKey(), this.autoSync);
        }
      }
    });

    urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        btnSaveUrl?.click();
      }
    });

    // Quick preset buttons for 3rd party providers
    document.querySelectorAll('.so-chip-btn').forEach(chip => {
      chip.addEventListener('click', () => {
        const chipText = chip.textContent.trim();
        const presetUrl = chip.getAttribute('data-preset-url');
        const presetModel = chip.getAttribute('data-preset-model');
        const presetProvider = chip.getAttribute('data-preset-provider') || 
          (chipText === 'GapGPT' ? 'custom_openai' : (chipText === 'AvalAI' ? 'avalai' : (chipText === 'ArvanCloud' ? 'arvancloud' : null)));

        // If clicking a main provider chip, switch to that provider tab cleanly
        if (presetProvider && PROVIDERS[presetProvider]) {
          this.currentProvider = presetProvider;
          localStorage.setItem('cbai_provider', presetProvider);

          if (presetProvider === 'custom_openai') {
            this.apiUrls.custom_openai = DEFAULT_GAPGPT_URL;
            this.apiKeys.custom_openai = DEFAULT_GAPGPT_KEY;
            this.selectedModels.custom_openai = presetModel || 'deepseek-v4.1-flash';
          } else if (presetProvider === 'avalai') {
            this.apiUrls.avalai = DEFAULT_AVALAI_URL;
            this.apiKeys.avalai = DEFAULT_AVALAI_KEY;
            this.selectedModels.avalai = presetModel || 'deepseek-v4.1-flash';
          } else if (presetProvider === 'arvancloud') {
            this.apiUrls.arvancloud = DEFAULT_ARVANCLOUD_URL;
            this.apiKeys.arvancloud = DEFAULT_ARVANCLOUD_KEY;
            this.selectedModels.arvancloud = presetModel || 'DeepSeek-V4.1-Flash';
          }

          this.saveKeys();
          this.updateProviderView();
          this.syncToExtensionStorage();
          this.ui.showToast(`Switched to ${PROVIDERS[presetProvider].name}!`, 'success');
          return;
        }

        if (urlInput && presetUrl) {
          urlInput.value = presetUrl;
          this.apiUrls[this.currentProvider] = presetUrl;

          if (presetModel) {
            this.selectedModels[this.currentProvider] = presetModel;
            const modelSelect = document.getElementById('model-select');
            if (modelSelect) {
              let opt = Array.from(modelSelect.options).find(o => o.value === presetModel);
              if (!opt) {
                opt = document.createElement('option');
                opt.value = presetModel;
                opt.textContent = presetModel;
                modelSelect.insertBefore(opt, modelSelect.firstChild);
              }
              modelSelect.value = presetModel;
            }
          }

          this.saveKeys();
          this.ui.showToast(`Loaded ${chipText} preset!`, 'info');
          this.ui.setReady(this.hasActiveKey(), this.autoSync);
        }
      });
    });

    // Model selection
    document.getElementById('model-select')?.addEventListener('change', (e) => {
      this.selectedModels[this.currentProvider] = e.target.value;
      const customModelGroup = document.getElementById('custom-model-group');
      if (customModelGroup) {
        customModelGroup.style.display = e.target.value === 'custom' ? 'flex' : 'none';
      }
      localStorage.setItem('cbai_models', JSON.stringify(this.selectedModels));
      this.syncToExtensionStorage();
      this.ui.showToast(`مدل فعال: ${e.target.value}`, 'info');
    });

    // Fetch models directly from API endpoint (GET /models)
    document.getElementById('btn-fetch-models')?.addEventListener('click', () => {
      this.loadModelsFromAPI();
    });

    document.getElementById('btn-fetch-models-quick')?.addEventListener('click', () => {
      this.loadModelsFromAPI();
    });

    // Custom model input & save
    const customModelInput = document.getElementById('custom-model-input');
    const btnSaveCustomModel = document.getElementById('btn-save-custom-model');

    btnSaveCustomModel?.addEventListener('click', () => {
      if (customModelInput) {
        const val = customModelInput.value.trim();
        if (val) {
          this.customModels[this.currentProvider] = val;
          this.selectedModels[this.currentProvider] = val;
          this.saveKeys();
          this.syncToExtensionStorage();
          this.populateModelDropdown();
          this.ui.showToast(`Custom model saved & activated: ${val}`, 'success');
        }
      }
    });

    customModelInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        btnSaveCustomModel?.click();
      }
    });

    // Preset selection (Dropdown & Quick Switcher Pills)
    document.getElementById('preset-select')?.addEventListener('change', (e) => {
      this.selectPreset(e.target.value, { notify: true });
    });

    document.querySelectorAll('.so-preset-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-preset-id');
        if (id) this.selectPreset(id, { notify: true });
      });
    });

    // Custom system prompt textarea
    document.getElementById('system-prompt')?.addEventListener('input', (e) => {
      this.systemPrompt = e.target.value;
      localStorage.setItem('cbai_prompt', this.systemPrompt);
      localStorage.setItem('cbai_l78_presets_v3', 'true');
      this.syncToExtensionStorage();
    });

    document.getElementById('btn-reset-prompt')?.addEventListener('click', () => {
      this.selectPreset(DEFAULT_PRESET_ID, { notify: false });
      this.ui.showToast('پرامپت به حالت پیش‌فرض (سطح ۷–۸ تشریحی) بازنشانی شد', 'info');
    });

    // Manual Paste button
    document.getElementById('btn-paste-manual')?.addEventListener('click', async () => {
      try {
        const content = await clipboard.readClipboard();
        if (content.type === 'image') {
          this.stagedScreenshot = content;
          this.ui.setScreenshotPreview(content);
          const provName = PROVIDERS[this.currentProvider]?.name || 'AI';
          this.ui.showToast(`تصویر دریافت شد! در حال شروع حل با ${provName}...`, 'success');
          this.runPipeline({ isAuto: false, forcedImage: content });
        } else if (content.type === 'text') {
          this.ui.setInputText(content.text);
          this.ui.showToast('متن از کلیپ‌بورد درج شد', 'info');
        } else if (content.type === 'denied') {
          const textInput = document.getElementById('text-input');
          if (textInput) textInput.focus();
          this.ui.showToast('دسترسی مستقیم کلیپ‌بورد در این مرورگر مسدود است. لطفاً با کلیدهای Ctrl+V تصویر را مستقیماً پیست کنید.', 'info');
        } else {
          const manualText = document.getElementById('text-input')?.value?.trim();
          if (manualText || this.stagedScreenshot) {
            this.runPipeline({ isAuto: false });
          } else {
            this.ui.showToast('کلیپ‌بورد خالی است. تصویر را با Ctrl+V پیست کنید یا فایل آن را انتخاب نمایید.', 'info');
          }
        }
      } catch (err) {
        console.warn('Manual paste click error:', err);
        this.ui.showToast('لطفاً تصویر یا متن را مستقیماً با Ctrl+V پیست کنید.', 'info');
      }
    });

    // Clear input
    document.getElementById('btn-clear-input')?.addEventListener('click', () => {
      this.ui.setInputText('');
      this.stagedScreenshot = null;
      this.ui.clearScreenshotPreview();
    });

    // Copy Output button
    document.getElementById('btn-copy-output')?.addEventListener('click', async () => {
      const outText = document.getElementById('text-output')?.value;
      if (outText) {
        await this.copyTextDirect(outText);
        this.ui.showToast('Copied answer to clipboard!', 'success');
      }
    });

    // Clear History
    document.getElementById('btn-clear-history')?.addEventListener('click', () => {
      this.history = [];
      this.saveHistory();
      this.ui.showToast('History cleared', 'info');
    });

    // Guide & Deploy & Extension Modals
    document.getElementById('btn-guide')?.addEventListener('click', () => {
      this.openModal('modal-guide');
    });

    document.getElementById('btn-deploy-info')?.addEventListener('click', () => {
      this.openModal('modal-deploy');
    });

    document.getElementById('btn-ext-install')?.addEventListener('click', () => {
      this.setupBookmarklet();
      this.openModal('modal-ext-install');
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        this.closeModal(modalId);
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
        }
      });
    });
  }

  // Setup Drag-and-Drop Bookmarklet with stealth Google Translate prompt & 500ms checkmark
  setupBookmarklet() {
    const bmBtn = document.getElementById('bm-drag-btn');
    const copyBtn = document.getElementById('btn-copy-bookmarklet');
    if (!bmBtn) return;

    const bmCode = "javascript:(function(){function tick(){var b=document.getElementById('gt-tick-badge');if(!b){b=document.createElement('div');b.id='gt-tick-badge';b.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483647;width:26px;height:26px;border-radius:50%;background:#1a73e8;color:#fff;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:15px;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,0.25);pointer-events:none;opacity:0;transform:scale(0.5);transition:opacity 0.15s ease-out,transform 0.15s ease-out;';b.textContent='✓';document.body.appendChild(b);}requestAnimationFrame(function(){b.style.opacity='1';b.style.transform='scale(1)';});setTimeout(function(){b.style.opacity='0';b.style.transform='scale(0.5)';setTimeout(function(){b.remove();},150);},500);}function copy(t){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(tick).catch(function(){fallback(t);});}else{fallback(t);}}function fallback(t){var a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a);tick();}function run(q){if(!q||!q.trim())return;fetch('https://api.avalai.ir/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer aa-d7tPVrnvwXyu03TJGpXfSPMkaesXshv98TqFM3P6p6aPmWzN'},body:JSON.stringify({model:'deepseek-v4.1-flash',messages:[{role:'system',content:'شما یک دانشجوی نخبه در جلسه امتحان با محدودیت زمانی شدید ۱ دقیقه هستید. پاسخ‌ها باید فوق‌العاده کوتاه، فشرده، نمره‌آور و ۱۰۰٪ آماده برای کپی‌پیست سریع باشند (تشریحی: ۱-۲ خط فقط کلیدواژه‌های نمره‌آور، تستی: فقط نام گزینه، کد: فقط بدنه اصلی جاوا بدون سلام یا مقدمه).'},{role:'user',content:q.trim()}],temperature:0.2})}).then(function(r){return r.json();}).then(function(d){var ans=d.choices[0].message.content.trim();copy(ans);}).catch(function(e){alert('خطا در اتصال اینترنتی بوکمارک: سایت فعلی به دلایل امنیتی (CSP) ارتباط بوکمارک را مسدود کرده است. لطفا از افزونه کروم استفاده کنید.');});}var s=window.getSelection?window.getSelection().toString().trim():'';if(s){run(s);}else if(navigator.clipboard&&navigator.clipboard.readText){navigator.clipboard.readText().then(function(c){if(c&&c.trim()){run(c.trim());}else{var p=prompt('متن سوال را وارد یا پیست کنید (Ctrl+V):');if(p)run(p);}}).catch(function(){var p=prompt('متن سوال را وارد یا پیست کنید (Ctrl+V):');if(p)run(p);});}else{var p=prompt('متن سوال را وارد یا پیست کنید (Ctrl+V):');if(p)run(p);}})();";

    bmBtn.href = bmCode;

    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = 'true';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(bmCode).then(() => {
          this.ui.showToast('✅ کد بوکمارک کپی شد! می‌توانید در بخش Bookmarks مرورگر پیست کنید.', 'success');
        });
      });
    }
  }

  // Update UI for active provider
  updateProviderView() {
    const prov = PROVIDERS[this.currentProvider];
    if (!prov) return;

    // Tabs
    document.querySelectorAll('.so-tab-btn, .provider-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-provider') === this.currentProvider);
    });

    // Label & Help link
    const label = document.getElementById('active-provider-label');
    if (label) label.textContent = prov.name;

    const link = document.getElementById('get-key-link');
    if (link) {
      link.href = prov.keyHelpUrl;
      if (this.currentProvider === 'gemini') {
        link.textContent = 'Get Key (AI Studio) →';
      } else if (this.currentProvider === 'custom_openai') {
        link.textContent = 'Get Key (GapGPT) →';
      } else if (this.currentProvider === 'avalai') {
        link.textContent = 'Get Key (AvalAI) →';
      } else if (this.currentProvider === 'arvancloud') {
        link.textContent = 'Get Key (ArvanCloud) →';
      } else {
        link.textContent = 'Get Key →';
      }
    }

    // 3rd Party API Base URL group toggle visibility
    const urlGroup = document.getElementById('api-url-group');
    const urlInput = document.getElementById('api-url-input');
    if (urlGroup) {
      if (this.currentProvider === 'custom_openai' || this.currentProvider === 'avalai' || this.currentProvider === 'arvancloud') {
        urlGroup.style.display = 'flex';
        if (urlInput) urlInput.value = this.apiUrls[this.currentProvider] || prov.defaultUrl || '';
      } else {
        urlGroup.style.display = 'none';
      }
    }

    // Key #1 Input value
    const keyInput = document.getElementById('api-key-input');
    if (keyInput) {
      keyInput.value = this.apiKeys[this.currentProvider] || '';
      keyInput.placeholder = `Paste ${prov.name} API key (${prov.placeholder})...`;
    }

    // Key Hint
    const keyHint = document.getElementById('key-hint');
    if (keyHint) {
      if (this.currentProvider === 'gemini') {
        keyHint.textContent = 'Default Gemini API key preloaded.';
      } else if (this.currentProvider === 'custom_openai') {
        keyHint.textContent = 'GapGPT API preloaded. Default model: deepseek-v4.1-flash.';
      } else if (this.currentProvider === 'avalai') {
        keyHint.textContent = 'AvalAI API preloaded. Default model: deepseek-v4.1-flash.';
      } else if (this.currentProvider === 'arvancloud') {
        keyHint.textContent = 'ArvanCloud AI preloaded. Default model: DeepSeek-V4.1-Flash.';
      } else {
        keyHint.textContent = 'Saved securely in your browser localStorage.';
      }
    }

    // Key #2 (Backup Gemini Key) toggle visibility
    const backupKeyGroup = document.getElementById('backup-key-group');
    const backupKeyInput = document.getElementById('api-key-backup-input');
    if (backupKeyGroup) {
      if (this.currentProvider === 'gemini') {
        backupKeyGroup.style.display = 'flex';
        if (backupKeyInput) backupKeyInput.value = this.apiKeys.geminiBackup || '';
      } else {
        backupKeyGroup.style.display = 'none';
      }
    }

    // Show Load Models from API button for all providers
    const btnFetchModels = document.getElementById('btn-fetch-models');
    if (btnFetchModels) {
      btnFetchModels.style.display = 'flex';
    }

    // Populate Models dropdown
    this.populateModelDropdown();

    this.updateKeyBadge();
  }

  // Populate model dropdown options (from cached API fetch or static provider defaults)
  populateModelDropdown() {
    const prov = PROVIDERS[this.currentProvider];
    if (!prov) return;

    const modelSelect = document.getElementById('model-select');
    if (!modelSelect) return;

    modelSelect.innerHTML = '';

    const currentSelected = this.selectedModels[this.currentProvider];
    const fetchedList = this.fetchedModels[this.currentProvider] || [];

    // Update count badge if present
    const countBadge = document.getElementById('model-count-badge');
    if (countBadge) {
      if (fetchedList.length > 0) {
        countBadge.style.display = 'inline-block';
        countBadge.textContent = `${fetchedList.length} مدل فعال`;
      } else {
        countBadge.style.display = 'none';
      }
    }

    // If we have models fetched directly from the API, display them
    if (fetchedList.length > 0) {
      const groupFetched = document.createElement('optgroup');
      groupFetched.label = `API Models (${fetchedList.length} loaded from endpoint)`;
      fetchedList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name || m.id;
        if (m.id === currentSelected) {
          opt.selected = true;
        }
        groupFetched.appendChild(opt);
      });
      modelSelect.appendChild(groupFetched);

      // Also add provider defaults as quick presets group
      if (prov.models && prov.models.length > 0) {
        const groupDefaults = document.createElement('optgroup');
        groupDefaults.label = 'Default Presets';
        prov.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name;
          if (m.id === currentSelected && !modelSelect.value) {
            opt.selected = true;
          }
          groupDefaults.appendChild(opt);
        });
        modelSelect.appendChild(groupDefaults);
      }
    } else {
      // Standard static models
      (prov.models || []).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        if (m.id === currentSelected) {
          opt.selected = true;
        }
        modelSelect.appendChild(opt);
      });
    }

    // Always ensure "custom" option is present for 3rd party providers
    if (this.currentProvider === 'custom_openai' || this.currentProvider === 'avalai' || this.currentProvider === 'arvancloud') {
      const hasCustom = Array.from(modelSelect.options).some(o => o.value === 'custom');
      if (!hasCustom) {
        const customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.textContent = '✍️ Custom Model Name (type your own)...';
        if (currentSelected === 'custom') {
          customOpt.selected = true;
        }
        modelSelect.appendChild(customOpt);
      }
    }

    // If currently selected model is not in the dropdown list (e.g. from preset chips or saved custom string)
    const hasMatch = Array.from(modelSelect.options).some(o => o.value === currentSelected);
    if (!hasMatch && currentSelected && currentSelected !== 'custom') {
      const dynamicOpt = document.createElement('option');
      dynamicOpt.value = currentSelected;
      dynamicOpt.textContent = `⚡ ${currentSelected}`;
      dynamicOpt.selected = true;
      modelSelect.insertBefore(dynamicOpt, modelSelect.firstChild);
    } else if (hasMatch) {
      modelSelect.value = currentSelected;
    }

    // Toggle custom model input group
    const customModelGroup = document.getElementById('custom-model-group');
    const customModelInput = document.getElementById('custom-model-input');
    if (customModelGroup) {
      const isCustomSelected = modelSelect.value === 'custom';
      customModelGroup.style.display = isCustomSelected ? 'flex' : 'none';
      if (customModelInput) {
        customModelInput.value = this.customModels[this.currentProvider] || '';
      }
    }
  }

  // Fetch list of models from API and update dropdown (Supports Gemini, GapGPT, OpenAI)
  async loadModelsFromAPI() {
    const provider = this.currentProvider;
    const apiKey = this.apiKeys[provider] || '';

    const isLocal = provider === 'custom_openai' && 
      (this.apiUrls.custom_openai?.includes('localhost') || 
       this.apiUrls.custom_openai?.includes('127.0.0.1') || 
       this.apiUrls.custom_openai?.includes(':11434'));

    if (!isLocal && (!apiKey || !apiKey.trim())) {
      this.ui.showToast(`Please enter and save your ${PROVIDERS[provider]?.name || provider} API Key first.`, 'warning');
      return;
    }

    const btnFetch = document.getElementById('btn-fetch-models');
    const btnQuick = document.getElementById('btn-fetch-models-quick');

    if (btnFetch) {
      btnFetch.disabled = true;
      btnFetch.innerHTML = '<span class="btn-icon">⏳</span> <span class="btn-text">در حال بارگذاری مدل‌ها...</span>';
    }
    if (btnQuick) {
      btnQuick.disabled = true;
      btnQuick.textContent = '⏳ Loading...';
    }

    try {
      let models = [];
      if (provider === 'gemini') {
        this.ui.showToast('Connecting to Google Gemini API (AI Studio)...', 'info');
        models = await fetchGeminiModels({ apiKey });
      } else {
        const baseUrl = (provider === 'custom_openai' || provider === 'avalai' || provider === 'arvancloud')
          ? (this.apiUrls[provider] || PROVIDERS[provider]?.defaultUrl || DEFAULT_GAPGPT_URL) 
          : (this.apiUrls.openai || 'https://api.openai.com/v1');
        this.ui.showToast(`Connecting to ${baseUrl}/models ...`, 'info');
        models = await fetchOpenAIModels({ baseUrl, apiKey });
      }

      this.fetchedModels[provider] = models;
      localStorage.setItem('cbai_fetched_models', JSON.stringify(this.fetchedModels));

      // Auto-select first fetched model if none selected or set to 'custom' without value
      if (!this.selectedModels[provider] || this.selectedModels[provider] === 'custom') {
        if (models[0]?.id) {
          this.selectedModels[provider] = models[0].id;
          localStorage.setItem('cbai_models', JSON.stringify(this.selectedModels));
        }
      }

      this.populateModelDropdown();
      sound.playSuccess();
      const providerName = PROVIDERS[provider]?.name || provider;
      this.ui.showToast(`🎉 Loaded ${models.length} models for ${providerName}!`, 'success');

      if (btnFetch) {
        btnFetch.innerHTML = `<span class="btn-icon">✅</span> <span class="btn-text">${models.length} مدل لود شد (به‌روزرسانی مجدد)</span>`;
      }
    } catch (err) {
      console.error('Failed to load models:', err);
      sound.playError();
      this.ui.showToast(`Failed to load models: ${err.message}`, 'error');
    } finally {
      if (btnFetch) {
        btnFetch.disabled = false;
        if (!btnFetch.innerHTML.includes('✅')) {
          btnFetch.innerHTML = '<span class="btn-icon">🔄</span> <span class="btn-text">بارگذاری مدل‌ها از API (Load Models)</span>';
        }
      }
      if (btnQuick) {
        btnQuick.disabled = false;
        btnQuick.textContent = '⚡ Load API Models';
      }
    }
  }

  updateKeyBadge() {
    const badge = document.getElementById('key-status-badge');
    if (!badge) return;

    if (this.currentProvider === 'gemini') {
      const hasKey1 = Boolean(this.apiKeys.gemini?.trim());
      const hasKey2 = Boolean(this.apiKeys.geminiBackup?.trim());

      if (hasKey1 && hasKey2) {
        badge.className = 'so-status-badge success';
        badge.textContent = '2 Keys Ready (Auto-Failover ON)';
      } else if (hasKey1) {
        badge.className = 'so-status-badge info';
        badge.textContent = 'Key 1 Ready (No Backup)';
      } else {
        badge.className = 'so-status-badge warning';
        badge.textContent = 'Key Required';
      }
    } else {
      const isLocal = this.currentProvider === 'custom_openai' &&
                      (this.apiUrls.custom_openai?.includes('localhost') || 
                       this.apiUrls.custom_openai?.includes('127.0.0.1') || 
                       this.apiUrls.custom_openai?.includes(':11434'));

      const hasKey = this.hasActiveKey();
      if (hasKey) {
        badge.className = 'so-status-badge success';
        badge.textContent = isLocal ? 'Local Endpoint Ready' : 'Key Active & Ready';
      } else {
        badge.className = 'so-status-badge warning';
        badge.textContent = 'Key Required';
      }
    }
  }

  async checkInitialPermissions() {
    try {
      const perm = await clipboard.checkPermission();
      if (perm === 'denied') {
        console.log('Clipboard permission is restricted. Manual paste (Ctrl+V) and file upload are enabled.');
      }
    } catch (e) {
      console.warn('Permission query not supported:', e);
    }
  }

  // Core Pipeline Execution (Supports Text, Screenshot Images, and Dual Gemini Keys)
  async runPipeline({ isAuto = false, forcedImage = null } = {}) {
    if (clipboard.isProcessing) return;

    // Verify API Key
    const apiKey = this.apiKeys[this.currentProvider];
    const isLocal = this.currentProvider === 'custom_openai' && 
                    (this.apiUrls.custom_openai?.includes('localhost') || 
                     this.apiUrls.custom_openai?.includes('127.0.0.1') || 
                     this.apiUrls.custom_openai?.includes(':11434'));

    if (!isLocal && (!apiKey || !apiKey.trim())) {
      if (!isAuto) {
        this.ui.setError(`Please enter your ${PROVIDERS[this.currentProvider].name} API key first.`);
        this.ui.showToast(`Enter your ${PROVIDERS[this.currentProvider].name} API key in the settings.`, 'error');
      }
      return;
    }

    let textToProcess = '';
    let imageToProcess = forcedImage || this.stagedScreenshot;

    try {
      if (!imageToProcess) {
        // Step 1: Read Clipboard Content safely without halting if restricted
        try {
          const clipContent = await clipboard.readClipboard();

          if (clipContent && clipContent.type === 'image') {
            // Screenshot captured!
            if (isAuto && !clipboard.shouldProcessImage(clipContent.hash)) {
              return; // Already processed this screenshot
            }
            imageToProcess = clipContent;
            this.stagedScreenshot = clipContent;
            this.ui.setScreenshotPreview(clipContent);
          } else if (clipContent && clipContent.type === 'text') {
            // Text captured!
            if (isAuto && !clipboard.shouldProcessText(clipContent.text, { isAuto: true, history: this.history })) {
              return; // Already processed this text or echo of our own answer
            }
            if (clipboard.isKnownOutput(clipContent.text) || this.isHistoryOutput(clipContent.text)) {
              if (!isAuto) {
                this.ui.showToast('متن کلیپ‌بورد پاسخی است که قبلاً کپی شده بود. لطفاً سوال جدید را کپی کنید.', 'info');
              }
              return;
            }
            textToProcess = clipContent.text;
          }
        } catch (clipErr) {
          console.warn('Silent clipboard read skipped:', clipErr);
        }
      }

      // Check manual text if not set — ONLY FOR MANUAL RUNS, NEVER FOR AUTO-SYNC!
      if (!textToProcess && !isAuto) {
        const manualText = document.getElementById('text-input')?.value?.trim();
        if (manualText) {
          textToProcess = manualText;
        }
      }

      // Check staged screenshot if not yet assigned
      if (!imageToProcess && this.stagedScreenshot) {
        imageToProcess = this.stagedScreenshot;
      }

      // If auto-sync and no fresh clipboard content was acquired, exit cleanly
      if (isAuto && !textToProcess && !imageToProcess) {
        return;
      }

      const hasText = Boolean(textToProcess && textToProcess.trim());
      const hasImage = Boolean(imageToProcess && imageToProcess.base64);

      if (!hasText && !hasImage) {
        if (!isAuto) {
          this.ui.showToast('متن یا تصویری پیدا نشد. تصویر را با کلیدهای Ctrl+V پیست کنید یا فایل آن را آپلود نمایید.', 'info');
        }
        return;
      }

      // Guard: Never process an answer text as a new question!
      if (hasText && (clipboard.isKnownOutput(textToProcess) || this.isHistoryOutput(textToProcess))) {
        console.warn('Pipeline blocked: textToProcess is a known answer');
        if (!isAuto) {
          this.ui.showToast('این متن یک پاسخ قبلی است، نه سوال جدید!', 'warning');
        }
        return;
      }

      clipboard.isProcessing = true;
      const startTime = performance.now();

      // UI Stage 1: Reading
      const modeLabel = hasImage ? 'Analyzing captured photo / screenshot...' : 'Reading clipboard input...';
      this.ui.setProcessing(modeLabel);
      this.ui.setActiveStep(1);
      if (hasText) this.ui.setInputText(textToProcess);
      sound.playStart();

      // UI Stage 2: AI Inference
      let effectiveModel = this.selectedModels[this.currentProvider] || PROVIDERS[this.currentProvider].defaultModel;
      if (effectiveModel === 'custom' && this.customModels[this.currentProvider]) {
        effectiveModel = this.customModels[this.currentProvider];
      }

      this.ui.setActiveStep(2);
      this.ui.setProcessing(`Querying ${PROVIDERS[this.currentProvider].name} (${effectiveModel})...`);

      let usedKeyIndex = 1;
      const backupKey = this.currentProvider === 'gemini' ? this.apiKeys.geminiBackup : null;
      const baseUrl = this.apiUrls[this.currentProvider] || null;

      const output = await callAI({
        provider: this.currentProvider,
        apiKey: apiKey,
        backupApiKey: backupKey,
        baseUrl: baseUrl,
        model: effectiveModel,
        systemPrompt: this.systemPrompt,
        text: textToProcess,
        image: imageToProcess,
        onKeySwitch: (fromKey, toKey) => {
          usedKeyIndex = toKey;
          this.ui.showToast(`⚠️ Gemini Key #${fromKey} reached quota limit! Auto-switched to Backup Key #${toKey}.`, 'warning');
        }
      });

      const durationMs = Math.round(performance.now() - startTime);

      // Pre-register output and input into echo prevention registry before writing to clipboard
      if (hasText) clipboard.lastInput = textToProcess;
      if (hasImage) clipboard.lastImageHash = imageToProcess.hash;
      clipboard.registerOutput(output);

      // Check if mobile device taking screenshot/photo
      const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const isMobileScreenshot = isMobile && Boolean(hasImage);

      // UI Stage 3: Display or Copy Solution
      this.ui.setActiveStep(3);

      if (isMobileScreenshot) {
        // ON MOBILE SCREENSHOT/PHOTO: Do NOT auto-copy to clipboard. Show answer directly in the box!
        this.ui.setProcessing('Displaying solution in answer box...');
        this.ui.setOutputText(output, { isMobileScreenshot: true });
        sound.playSuccess();

        const successMsg = usedKeyIndex === 2
          ? 'Solution ready in the box below! (Used Backup Key #2). Tap Copy anytime.'
          : 'Solution ready! Displayed in the answer box below. (Not copied to clipboard on mobile)';
        this.ui.setSuccess(successMsg, { isMobileScreenshot: true });
        this.ui.showToast('Answer displayed in the box below!', 'success');
      } else {
        // ON DESKTOP (or non-screenshot):
        // 1. ALWAYS display output in answer box FIRST so it is never lost!
        this.ui.setOutputText(output, { isMobileScreenshot: false });

        // 2. Safely attempt to write solution back to System Clipboard
        this.ui.setProcessing('Writing solution back to system clipboard...');
        let copied = false;
        try {
          copied = await clipboard.writeText(output);
        } catch (copyErr) {
          console.warn('Auto clipboard write failed:', copyErr);
          copied = false;
        }

        sound.playSuccess();

        if (copied) {
          const successMsg = usedKeyIndex === 2
            ? 'Solution ready! (Used Backup Key #2). Copied to clipboard!'
            : 'Solution copied to clipboard! Switch back to your IDE & paste (Ctrl+V).';
          this.ui.setSuccess(successMsg, { isMobileScreenshot: false });
          this.ui.showToast('پاسخ در کلیپ‌بورد کپی شد!', 'success');
        } else {
          // If browser restricts background/insecure clipboard write, do NOT fail the app
          const fallbackMsg = usedKeyIndex === 2
            ? 'Solution ready in the answer box below! (Used Backup Key #2). Click Copy button to copy.'
            : 'Solution ready in the answer box below! (Auto-copy restricted by browser; click Copy button to copy).';
          this.ui.setSuccess(fallbackMsg, { isMobileScreenshot: false });
          this.ui.showToast('پاسخ در کادر پاسخ قرار گرفت! (دکمه Copy را بزنید)', 'info');
        }
      }

      // Desktop notification
      if (this.notificationEnabled && document.hidden) {
        new Notification('Stack Overflow Copilot Solution Ready!', {
          body: output.slice(0, 120),
          icon: 'favicon.svg'
        });
      }

      // Record in history
      const historyInputDesc = hasImage 
        ? (hasText ? `[Photo/Image + Text] ${textToProcess.slice(0, 60)}` : `[Photo/Image] ${imageToProcess.mimeType} (${Math.round(imageToProcess.size/1024)} KB)`)
        : textToProcess;

      const keyTag = this.currentProvider === 'gemini' ? ` (Key ${usedKeyIndex})` : '';

      this.history.unshift({
        id: Date.now(),
        timestamp: Date.now(),
        provider: `${PROVIDERS[this.currentProvider].name}${keyTag}`,
        model: effectiveModel,
        input: historyInputDesc,
        output: output,
        durationMs: durationMs
      });
      this.saveHistory();

    } catch (err) {
      console.error('Pipeline error:', err);
      sound.playError();
      this.ui.setError(err.message || 'Failed to process clipboard');
    } finally {
      clipboard.isProcessing = false;
    }
  }

  isHistoryOutput(text) {
    if (!text || !this.history || this.history.length === 0) return false;
    const clean = text.trim();
    const cleanNorm = normalizeText(clean);
    if (!cleanNorm) return false;
    return this.history.some(item => {
      if (!item || !item.output) return false;
      const hNorm = normalizeText(item.output);
      return hNorm === cleanNorm || (cleanNorm.length > 25 && (hNorm.includes(cleanNorm) || cleanNorm.includes(hNorm)));
    });
  }

  async copyTextDirect(text) {
    try {
      clipboard.registerOutput(text);
      const ok = await clipboard.writeText(text);
      if (ok) {
        sound.playSuccess();
        this.ui.showToast('Copied to clipboard!', 'success');
      } else {
        this.ui.showToast('Unable to auto-copy. Please select and copy manually (Ctrl+C).', 'warning');
      }
    } catch (e) {
      this.ui.showToast('Please copy manually (Ctrl+C).', 'warning');
    }
  }

  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
  }

  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
  }

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
    document.querySelector('.so-right-sidebar')?.classList.remove('mobile-open');
    document.getElementById('mobile-sidebar-backdrop')?.classList.remove('active');
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
