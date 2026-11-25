// ============================================================================
// Windows App — Native Windows Background Tray Application (.NET 4.x)
// Zero external dependencies. Compiles to a standalone single-file .exe via csc.exe.
// Works system-wide across Chrome, Google Docs, Word, PDF viewers, IDEs, etc.
// ============================================================================

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Windows App")]
[assembly: AssemblyDescription("Windows App")]
[assembly: AssemblyProduct("Windows App")]
[assembly: AssemblyCompany("Windows App")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace WindowsApp
{
    static class NativeMethods
    {
        public const int WM_HOTKEY = 0x0312;
        public const int WM_APP_SMART_TRIGGER = 0x8001;

        public const uint MOD_ALT = 0x0001;
        public const uint MOD_CONTROL = 0x0002;
        public const uint MOD_SHIFT = 0x0004;
        public const uint MOD_NOREPEAT = 0x4000;

        public const int WH_MOUSE_LL = 14;
        public const int WM_RBUTTONDOWN = 0x0204;
        public const int WM_RBUTTONUP = 0x0205;

        public const int VK_SHIFT = 0x10;
        public const int VK_CONTROL = 0x11;
        public const int VK_MENU = 0x12;
        public const int VK_LSHIFT = 0xA0;
        public const int VK_RSHIFT = 0xA1;
        public const int VK_LCONTROL = 0xA2;
        public const int VK_RCONTROL = 0xA3;
        public const int VK_LMENU = 0xA4;
        public const int VK_RMENU = 0xA5;
        public const int VK_A = 0x41;
        public const int VK_C = 0x43;
        public const int VK_S = 0x53;
        public const int VK_X = 0x58;

        public const uint INPUT_KEYBOARD = 1;
        public const uint KEYEVENTF_KEYUP = 0x0002;

        public const int WS_EX_TRANSPARENT = 0x00000020;
        public const int WS_EX_TOOLWINDOW = 0x00000080;
        public const int WS_EX_TOPMOST = 0x00000008;
        public const int WS_EX_NOACTIVATE = 0x08000000;

        public delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        public struct INPUT
        {
            public uint type;
            public InputUnion U;
        }

        [StructLayout(LayoutKind.Explicit)]
        public struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
            [FieldOffset(0)] public HARDWAREINPUT hi;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct HARDWAREINPUT
        {
            public uint uMsg;
            public ushort wParamL;
            public ushort wParamH;
        }

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll")]
        public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        public static extern bool PostMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiFlag);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool DestroyIcon(IntPtr hIcon);

        public static void EnableDpiAwareness()
        {
            try
            {
                // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
                if (SetProcessDpiAwarenessContext(new IntPtr(-4)))
                    return;
            }
            catch { }
            try { SetProcessDPIAware(); } catch { }
        }

        public static bool IsKeyDown(int vk)
        {
            return (GetAsyncKeyState(vk) & 0x8000) != 0;
        }

        public static void ReleaseTriggerModifiers()
        {
            var inputs = new List<INPUT>();
            // Release Shift / Alt / trigger keys first so target app receives clean Ctrl+C (never Ctrl+Shift+C DevTools)
            int[] releaseVks = new int[] { VK_LSHIFT, VK_RSHIFT, VK_SHIFT, VK_LMENU, VK_RMENU, VK_MENU, VK_X, VK_A };
            foreach (int vk in releaseVks)
            {
                if (IsKeyDown(vk))
                {
                    inputs.Add(MakeKeyInput((ushort)vk, true));
                }
            }
            if (inputs.Count > 0)
            {
                SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));
            }
        }

        public static void SendCtrlC()
        {
            var inputs = new INPUT[]
            {
                MakeKeyInput((ushort)VK_LCONTROL, false),
                MakeKeyInput((ushort)VK_C, false),
                MakeKeyInput((ushort)VK_C, true),
                MakeKeyInput((ushort)VK_LCONTROL, true)
            };
            SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        private static INPUT MakeKeyInput(ushort vk, bool keyUp)
        {
            INPUT input = new INPUT();
            input.type = INPUT_KEYBOARD;
            input.U.ki = new KEYBDINPUT
            {
                wVk = vk,
                wScan = 0,
                dwFlags = keyUp ? KEYEVENTF_KEYUP : 0,
                time = 0,
                dwExtraInfo = IntPtr.Zero
            };
            return input;
        }
    }

    public class HistoryEntry
    {
        public string Time { get; set; }
        public string Provider { get; set; }
        public string Model { get; set; }
        public bool HasImage { get; set; }
        public string Input { get; set; }
        public string Output { get; set; }
        public long DurationMs { get; set; }
    }

    public class AppConfig
    {
        public string CurrentProvider { get; set; }
        public string CurrentPreset { get; set; }
        public string SystemPrompt { get; set; }
        public string VisionModelOverride { get; set; }
        public bool EnableCtrlShiftRightClick { get; set; }
        public bool EnableAutoFailover { get; set; }
        public Dictionary<string, string> ApiKeys { get; set; }
        public Dictionary<string, string> ApiUrls { get; set; }
        public Dictionary<string, string> SelectedModels { get; set; }
        public List<HistoryEntry> History { get; set; }

        public static readonly Dictionary<string, string> ProviderLabels = new Dictionary<string, string>
        {
            { "custom_openai", "GapGPT (3rd Party 1)" },
            { "avalai", "AvalAI (3rd Party 2)" },
            { "arvancloud", "ArvanCloud (3rd Party 3)" },
            { "gemini", "Google Gemini" },
            { "openai", "OpenAI ChatGPT" }
        };

        public static readonly Dictionary<string, string> PresetLabels = new Dictionary<string, string>
        {
            { "l78-descriptive", "سطح ۷–۸: تشریحی (پیش‌فرض)" },
            { "l78-coding", "سطح ۷–۸: عملی و کدی (Java 21)" },
            { "l78-design", "سطح ۷–۸: طراحی سیستم (C4 + ADR)" },
            { "custom", "پرامپت سفارشی" }
        };

        public static readonly Dictionary<string, string> Presets = new Dictionary<string, string>
        {
            {
                "l78-descriptive",
                "تو یک کارشناس ارشد جاوا (سطح ۷–۸) هستی و برای هر سؤال تشریحی فقط ۲ دقیقه وقت تایپ داری. پاسخ باید خیلی کوتاه، جمع‌وجور، مستقیم و ۱۰۰٪ شبیه تایپ سریع یک انسان در ۲ دقیقه باشد تا به هیچ وجه طولانی یا شبیه AI نباشد. مطلقاً سلام، مقدمه، توضیح اضافه یا جمع‌بندی ننویس.\n\n" +
                "قانون سخت حجم (خط قرمز ۲ دقیقه):\n" +
                "- برای هر سؤال فقط ۱ پاراگراف کوتاه با حداکثر ۳ تا ۴ جمله‌ی فشرده (حدود ۵۰ تا ۸۵ کلمه / ۳ تا ۴ خط) بنویس. هرگز بیشتر از ۴ جمله یا بیش از ۱ پاراگراف نشود و اصلاً لفتش نده.\n\n" +
                "در همین ۳ تا ۴ جمله‌ی کوتاه، این ۴ نکته را فشرده و پیوسته جا بده:\n" +
                "۱. جمله‌ی اول: ریشه‌ی مشکل یا ریسک اصلی دقیقاً در همین سناریو.\n" +
                "۲. جمله‌ی دوم و سوم: راه‌حل عملی همراه با مقایسه‌ی خیلی کوتاه با یک جایگزین، مهم‌ترین حالت شکست (مثل Split Brain/Fencing Token، Hot Key، Noisy Neighbor، Race Condition، Failover، High Cardinality) و بده‌بستان اصلی (تأخیر/هزینه/پیچیدگی). در عیب‌یابی فقط گام کم‌سربار در تولید (متریک، JFR/Flame Graph) بگو و کار مخرب مثل Heap Dump وسط پیک نگو.\n" +
                "۳. جمله‌ی آخر: کوتاه بگو با چه متریک یا آزمونی (P99، Lag، Canary، Fault Injection، تست هم‌زمانی) نتیجه‌اش را می‌سنجی.\n\n" +
                "قوانین غیرقابل‌تشخیص بودن از AI:\n" +
                "- فقط متن ساده: هیچ **بولد**، هیچ بولت‌پوینت، هیچ شماره‌گذاری، هیچ ایموجی، هیچ خط تیره‌ی بلند (— یا –) و هیچ تیتری داخل پاسخ نیاور.\n" +
                "- لحن کاملاً مستقیم، ساده و اول‌شخص دولوپری باشد («اول چک می‌کنم...»، «مشکل این است که...»، «به جایش...»، «هزینه‌اش این است که...»).\n" +
                "- اکیداً از این کلمات لو‌دهنده‌ی AI و ترجمه‌زدگی دوری کن: «در دنیای واقعی»، «بسیار حیاتی است»، «نقش کلیدی»، «رویکرد جامع»، «تضمین می‌کند»، «چالش‌های متعددی»، «از یک سو ... از سوی دیگر»، «شایان ذکر است»، «در واقع»، «به طور کلی»، «در نهایت»، «جمع‌بندی»، «می‌باشد»، «گردید/می‌گردد»، «به منظور»، «توسط ... انجام می‌شود»، «مورد استفاده قرار می‌گیرد»، «اقدام به ... نمودن».\n" +
                "- اصطلاحات فنی به انگلیسی بمانند (Circuit Breaker، Outbox، Fencing Token، JFR، P99، SLO، RLS) و پسوند فارسی بدون فاصله بچسبد (Threadها، APIهای).\n" +
                "- اگر چند سؤال در ورودی است، هرکدام را جدا با شماره‌ی خودش (مثل q1، q2 یا سوال ۱، سوال ۲) و هرکدام در همان سقف ۳ تا ۴ جمله جواب بده."
            },
            {
                "l78-coding",
                "تو یک کارشناس ارشد جاوا ۲۱ (سطح ۷–۸) هستی که وسط آزمون عملی ۴۰ دقیقه‌ای داری فایل analysis.md و کلاس‌های جاوا را اصلاح می‌کنی. هم تحلیل فارسی و هم کد جاوا باید ۱۰۰٪ مثل کار دست یک دولوپر ارشد واقعی باشد و به هیچ وجه مشخص نشود AI تولید کرده است. هیچ سلام، مقدمه یا توضیح اضافی بیرون از قالب ننویس.\n\n" +
                "ساختار خروجی (دقیقاً مطابق قالب analysis.md و روبریک ۱۰۰ امتیازی: analysis ۳۰ + redesign ۵۰ + tradeoffs ۲۰):\n\n" +
                "## نقاط ضعف\n" +
                "- ۳ تا ۴ ضعف اصلی کد را مستقیم و با نام دقیق مفاهیم همان ویژگی کیفی (Security، Continuity، Robustness، Performance & Scalability، Observability یا Consistency) توضیح بده که در تولید چه چیزی را می‌شکند؛ هرجا ربط دارد رفتار یا هدف قابل سنجش قبل و بعد بیاور.\n\n" +
                "## راه‌حل و تغییرهای کد\n" +
                "- کوتاه و سرراست توضیح بده هر تغییر چطور علت ریشه‌ای را حل می‌کند (نه دور زدن تست).\n" +
                "- سپس کد اصلاح‌شده‌ی فایل‌های تغییریافته را به Java 21 با حفظ ۱۰۰٪ Public API، Clock تزریق‌شده، Thread-Safety، Idempotency، Retry/Circuit Breaker و Bulkhead دقیق بنویس.\n\n" +
                "## بده‌بستان‌ها و ریسک‌های باقی‌مانده\n" +
                "- صادقانه محدودیت‌های باقی‌مانده در تولید را بگو.\n\n" +
                "قوانین حیاتی برای طبیعی بودن:\n" +
                "- بدون ایموجی، بدون خط تیره‌ی بلند (—)، بدون بولد کردن سر همه‌ی بندها، بدون کلیشه‌های AI و بدون کامنت‌های بدیهی در کد جاوا."
            },
            {
                "l78-design",
                "تو یک معمار و کارشناس ارشد جاوا (سطح ۷–۸) هستی که داری فایل‌های design.md، مشخصات c4.drawio و فایل‌های adr/ را می‌نویسی. نوشتار باید ۱۰۰٪ مثل طراحی واقعی یک مهندس ارشد باتجربه باشد و هیچ سلام یا مقدمه‌ای ننویس. اگر ورودی فقط C4 یا فقط ADR خواست، فقط همان بخش را بده.\n\n" +
                "بخش ۱: design.md با ۵ سرتیتر: ## فرض‌ها، ## نیازمندی‌ها و ویژگی‌های کیفی، ## برآورد ظرفیت، ## جریان‌های اصلی، ## ریسک‌ها و کارهای بعدی.\n" +
                "بخش ۲: مدل دقیق نمودارهای c4.drawio (برگه‌ی System Context و برگه‌ی Container با c4Name، c4Technology، c4Description و فلش‌های Relationship).\n" +
                "بخش ۳: ۲ تا ۳ فایل ADR کامل با قالب # ADR، وضعیت، ## زمینه، ## تصمیم، ## گزینه‌های بررسی‌شده (جدول حداقل ۳ گزینه)، ## پیامدها (خوب/بد/بعدی).\n" +
                "بدون ایموجی، بدون خط تیره‌ی بلند (—) و بدون کلیشه‌های AI."
            }
        };

        public static AppConfig CreateDefault()
        {
            return new AppConfig
            {
                CurrentProvider = "custom_openai",
                CurrentPreset = "l78-descriptive",
                SystemPrompt = Presets["l78-descriptive"],
                VisionModelOverride = "",
                EnableCtrlShiftRightClick = true,
                EnableAutoFailover = true,
                ApiKeys = new Dictionary<string, string>
                {
                    { "custom_openai", "sk-F4T2AxOQw9HcnrUBdfsbTF7Fsu5JZelWBjBRhBkeNxpSLsNX" },
                    { "avalai", "aa-d7tPVrnvwXyu03TJGpXfSPMkaesXshv98TqFM3P6p6aPmWzN" },
                    { "arvancloud", "44f82d65-9e2b-536f-a7af-c4a353735f3e" },
                    { "gemini", "AQ.Ab8RN6Jug5V9Cks3DuZ_xNKI-o-GHsdorIO5zL4Usn3fFo0Geg" },
                    { "openai", "" }
                },
                ApiUrls = new Dictionary<string, string>
                {
                    { "custom_openai", "https://api.gapgpt.app/v1" },
                    { "avalai", "https://api.avalai.ir/v1" },
                    { "arvancloud", "https://api.arvancloudai.ir/v1" },
                    { "gemini", "https://generativelanguage.googleapis.com/v1beta" },
                    { "openai", "https://api.openai.com/v1" }
                },
                SelectedModels = new Dictionary<string, string>
                {
                    { "custom_openai", "deepseek-v4.1-flash" },
                    { "avalai", "deepseek-v4.1-flash" },
                    { "arvancloud", "DeepSeek-V4.1-Flash" },
                    { "gemini", "gemini-3.8-flash" },
                    { "openai", "gpt-4o-mini" }
                },
                History = new List<HistoryEntry>()
            };
        }

        public static string ConfigPath
        {
            get
            {
                return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
            }
        }

        public static AppConfig Load()
        {
            AppConfig def = CreateDefault();
            try
            {
                if (!File.Exists(ConfigPath)) return def;
                string json = File.ReadAllText(ConfigPath, Encoding.UTF8);
                var ser = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 };
                var loaded = ser.Deserialize<AppConfig>(json);
                if (loaded == null) return def;

                if (string.IsNullOrEmpty(loaded.CurrentProvider)) loaded.CurrentProvider = def.CurrentProvider;
                if (string.IsNullOrEmpty(loaded.CurrentPreset)) loaded.CurrentPreset = def.CurrentPreset;
                if (string.IsNullOrEmpty(loaded.SystemPrompt)) loaded.SystemPrompt = def.SystemPrompt;
                if (loaded.VisionModelOverride == null) loaded.VisionModelOverride = "";

                if (loaded.ApiKeys == null) loaded.ApiKeys = def.ApiKeys;
                if (loaded.ApiUrls == null) loaded.ApiUrls = def.ApiUrls;
                if (loaded.SelectedModels == null) loaded.SelectedModels = def.SelectedModels;
                if (loaded.History == null) loaded.History = new List<HistoryEntry>();

                foreach (var kv in def.ApiKeys)
                    if (!loaded.ApiKeys.ContainsKey(kv.Key)) loaded.ApiKeys[kv.Key] = kv.Value;
                foreach (var kv in def.ApiUrls)
                    if (!loaded.ApiUrls.ContainsKey(kv.Key)) loaded.ApiUrls[kv.Key] = kv.Value;
                foreach (var kv in def.SelectedModels)
                    if (!loaded.SelectedModels.ContainsKey(kv.Key)) loaded.SelectedModels[kv.Key] = kv.Value;

                return loaded;
            }
            catch
            {
                return def;
            }
        }

        public void Save()
        {
            try
            {
                if (History != null && History.Count > 30)
                    History = History.GetRange(0, 30);
                var ser = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 };
                string json = ser.Serialize(this);
                File.WriteAllText(ConfigPath, json, new UTF8Encoding(false));
            }
            catch { }
        }
    }

    static class ApiClient
    {
        private static readonly HttpClient Http = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(45)
        };

        public static async Task<Tuple<string, string, string>> SolveWithFailoverAsync(AppConfig config, string text, string imageBase64)
        {
            var order = new List<string>();
            order.Add(config.CurrentProvider);
            if (config.EnableAutoFailover)
            {
                string[] backups = new string[] { "custom_openai", "avalai", "arvancloud", "gemini", "openai" };
                foreach (string p in backups)
                {
                    if (!order.Contains(p))
                    {
                        string key = config.ApiKeys.ContainsKey(p) ? config.ApiKeys[p] : "";
                        if (!string.IsNullOrWhiteSpace(key))
                        {
                            order.Add(p);
                        }
                    }
                }
            }

            Exception lastError = null;
            foreach (string provider in order)
            {
                string key = config.ApiKeys.ContainsKey(provider) ? (config.ApiKeys[provider] ?? "").Trim() : "";
                string url = config.ApiUrls.ContainsKey(provider) ? (config.ApiUrls[provider] ?? "").Trim() : "";
                string model = config.SelectedModels.ContainsKey(provider) ? (config.SelectedModels[provider] ?? "").Trim() : "";

                if (!string.IsNullOrEmpty(imageBase64) && !string.IsNullOrWhiteSpace(config.VisionModelOverride) && provider == config.CurrentProvider)
                {
                    model = config.VisionModelOverride.Trim();
                }

                bool isLocal = url.Contains("localhost") || url.Contains("127.0.0.1") || url.Contains(":11434");
                if (!isLocal && string.IsNullOrEmpty(key)) continue;

                try
                {
                    string answer;
                    if (provider == "gemini")
                    {
                        answer = await CallGeminiAsync(key, model, config.SystemPrompt, text, imageBase64);
                    }
                    else
                    {
                        answer = await CallOpenAICompatibleAsync(url, key, model, config.SystemPrompt, text, imageBase64);
                    }

                    if (!string.IsNullOrWhiteSpace(answer))
                    {
                        return Tuple.Create(answer.Trim(), provider, model);
                    }
                }
                catch (Exception ex)
                {
                    lastError = ex;
                }
            }

            if (lastError != null) throw lastError;
            throw new Exception("هیچ کلید API فعالی تنظیم نشده است.");
        }

        private static async Task<string> CallOpenAICompatibleAsync(string baseUrl, string apiKey, string model, string systemPrompt, string text, string imageBase64)
        {
            string cleanUrl = (string.IsNullOrWhiteSpace(baseUrl) ? "https://api.gapgpt.app/v1" : baseUrl.Trim()).TrimEnd('/');
            if (!cleanUrl.EndsWith("/chat/completions", StringComparison.OrdinalIgnoreCase))
                cleanUrl = cleanUrl + "/chat/completions";

            object userContent;
            if (!string.IsNullOrEmpty(imageBase64))
            {
                var parts = new List<object>();
                string promptText = !string.IsNullOrWhiteSpace(text)
                    ? text
                    : "سؤال، کد یا سناریوی موجود در این تصویر را دقیق تحلیل کن و کاملاً مطابق دستورالعمل سیستم پاسخ بده. اگر چند سؤال در تصویر هست، هر سؤال را به تفکیک و با شماره‌اش پاسخ بده.";
                parts.Add(new Dictionary<string, object> { { "type", "text" }, { "text", promptText } });
                parts.Add(new Dictionary<string, object>
                {
                    { "type", "image_url" },
                    { "image_url", new Dictionary<string, object> { { "url", "data:image/png;base64," + imageBase64 } } }
                });
                userContent = parts;
            }
            else
            {
                userContent = text;
            }

            var payload = new Dictionary<string, object>
            {
                { "model", string.IsNullOrWhiteSpace(model) ? "deepseek-v4.1-flash" : model },
                {
                    "messages", new object[]
                    {
                        new Dictionary<string, object> { { "role", "system" }, { "content", systemPrompt } },
                        new Dictionary<string, object> { { "role", "user" }, { "content", userContent } }
                    }
                },
                { "temperature", 0.25 }
            };

            var ser = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024 };
            string jsonBody = ser.Serialize(payload);

            using (var req = new HttpRequestMessage(HttpMethod.Post, cleanUrl))
            {
                req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
                if (!string.IsNullOrEmpty(apiKey))
                    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

                using (var resp = await Http.SendAsync(req))
                {
                    string body = await resp.Content.ReadAsStringAsync();
                    var data = ser.DeserializeObject(body) as Dictionary<string, object>;
                    if (!resp.IsSuccessStatusCode)
                    {
                        string msg = ExtractErrorMessage(data) ?? ("HTTP " + (int)resp.StatusCode + " (" + cleanUrl + ")");
                        throw new Exception(msg);
                    }

                    if (data != null && data.ContainsKey("choices"))
                    {
                        var choices = data["choices"] as object[];
                        if (choices != null && choices.Length > 0)
                        {
                            var first = choices[0] as Dictionary<string, object>;
                            if (first != null && first.ContainsKey("message"))
                            {
                                var message = first["message"] as Dictionary<string, object>;
                                if (message != null && message.ContainsKey("content") && message["content"] != null)
                                    return message["content"].ToString().Trim();
                            }
                        }
                    }
                    throw new Exception("پاسخ خالی از سرور دریافت شد.");
                }
            }
        }

        private static async Task<string> CallGeminiAsync(string apiKey, string model, string systemPrompt, string text, string imageBase64)
        {
            string targetModel = string.IsNullOrWhiteSpace(model) ? "gemini-3.8-flash" : model;
            string url = "https://generativelanguage.googleapis.com/v1beta/models/" + Uri.EscapeDataString(targetModel) + ":generateContent?key=" + Uri.EscapeDataString(apiKey);

            var parts = new List<object>();
            if (!string.IsNullOrEmpty(imageBase64))
            {
                parts.Add(new Dictionary<string, object>
                {
                    {
                        "inline_data", new Dictionary<string, object>
                        {
                            { "mime_type", "image/png" },
                            { "data", imageBase64 }
                        }
                    }
                });
            }

            string promptText;
            if (!string.IsNullOrEmpty(imageBase64) && !string.IsNullOrWhiteSpace(text))
                promptText = systemPrompt + "\n\nتصویر و متن پیوست را دقیق بررسی کن و کاملاً مطابق دستورالعمل سیستم پاسخ بده:\n" + text;
            else if (!string.IsNullOrEmpty(imageBase64))
                promptText = systemPrompt + "\n\nسؤال، کد یا سناریوی موجود در این تصویر را دقیق تحلیل کن و کاملاً مطابق دستورالعمل سیستم پاسخ بده.";
            else
                promptText = text;

            parts.Add(new Dictionary<string, object> { { "text", promptText } });

            var payload = new Dictionary<string, object>
            {
                { "system_instruction", new Dictionary<string, object> { { "parts", new object[] { new Dictionary<string, object> { { "text", systemPrompt } } } } } },
                { "contents", new object[] { new Dictionary<string, object> { { "role", "user" }, { "parts", parts } } } },
                { "generationConfig", new Dictionary<string, object> { { "temperature", 0.2 } } }
            };

            var ser = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024 };
            string jsonBody = ser.Serialize(payload);

            using (var req = new HttpRequestMessage(HttpMethod.Post, url))
            {
                req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
                using (var resp = await Http.SendAsync(req))
                {
                    string body = await resp.Content.ReadAsStringAsync();
                    var data = ser.DeserializeObject(body) as Dictionary<string, object>;
                    if (!resp.IsSuccessStatusCode)
                    {
                        if ((int)resp.StatusCode == 404 && targetModel != "gemini-2.5-flash")
                            return await CallGeminiAsync(apiKey, "gemini-2.5-flash", systemPrompt, text, imageBase64);
                        string msg = ExtractErrorMessage(data) ?? ("Gemini HTTP " + (int)resp.StatusCode);
                        throw new Exception(msg);
                    }

                    if (data != null && data.ContainsKey("candidates"))
                    {
                        var cands = data["candidates"] as object[];
                        if (cands != null && cands.Length > 0)
                        {
                            var cand = cands[0] as Dictionary<string, object>;
                            if (cand != null && cand.ContainsKey("content"))
                            {
                                var content = cand["content"] as Dictionary<string, object>;
                                if (content != null && content.ContainsKey("parts"))
                                {
                                    var outParts = content["parts"] as object[];
                                    if (outParts != null)
                                    {
                                        var sb = new StringBuilder();
                                        foreach (object op in outParts)
                                        {
                                            var d = op as Dictionary<string, object>;
                                            if (d != null && d.ContainsKey("text") && d["text"] != null)
                                                sb.Append(d["text"].ToString());
                                        }
                                        if (sb.Length > 0) return sb.ToString().Trim();
                                    }
                                }
                            }
                        }
                    }
                    throw new Exception("پاسخ خالی از Gemini دریافت شد.");
                }
            }
        }

        private static string ExtractErrorMessage(Dictionary<string, object> data)
        {
            if (data == null) return null;
            if (data.ContainsKey("error"))
            {
                var errObj = data["error"] as Dictionary<string, object>;
                if (errObj != null && errObj.ContainsKey("message") && errObj["message"] != null)
                    return errObj["message"].ToString();
                if (data["error"] != null) return data["error"].ToString();
            }
            if (data.ContainsKey("message") && data["message"] != null)
                return data["message"].ToString();
            return null;
        }
    }

    // Non-focus-stealing discreet floating status badge in bottom-right corner
    class FloatingBadgeForm : Form
    {
        private string _symbol = "✓";
        private Color _bgColor = Color.FromArgb(26, 115, 232);
        private System.Windows.Forms.Timer _hideTimer;

        public FloatingBadgeForm()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            Size = new Size(30, 30);
            BackColor = Color.Magenta;
            TransparencyKey = Color.Magenta;
            DoubleBuffered = true;

            _hideTimer = new System.Windows.Forms.Timer();
            _hideTimer.Tick += (s, e) =>
            {
                _hideTimer.Stop();
                Hide();
            };
        }

        protected override bool ShowWithoutActivation
        {
            get { return true; }
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= NativeMethods.WS_EX_NOACTIVATE
                            | NativeMethods.WS_EX_TOPMOST
                            | NativeMethods.WS_EX_TOOLWINDOW
                            | NativeMethods.WS_EX_TRANSPARENT;
                return cp;
            }
        }

        public void ShowStatus(string symbol, Color bgColor, int autoHideMs)
        {
            _hideTimer.Stop();
            _symbol = symbol;
            _bgColor = bgColor;
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            Location = new Point(wa.Right - Width - 16, wa.Bottom - Height - 16);
            Invalidate();
            if (!Visible) Show();
            if (autoHideMs > 0)
            {
                _hideTimer.Interval = autoHideMs;
                _hideTimer.Start();
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var brush = new SolidBrush(_bgColor))
            {
                e.Graphics.FillEllipse(brush, 1, 1, Width - 3, Height - 3);
            }
            using (var font = new Font("Segoe UI", _symbol.Length > 1 ? 8.5f : 11f, FontStyle.Bold))
            using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            {
                e.Graphics.DrawString(_symbol, font, Brushes.White, new RectangleF(0, 0, Width, Height), sf);
            }
        }
    }

    // Multi-monitor DPI-aware frozen-screen crop overlay
    class CropOverlayForm : Form
    {
        private readonly Bitmap _screenBitmap;
        private readonly Rectangle _virtualBounds;
        private bool _isDragging = false;
        private Point _startPoint;
        private Point _currentPoint;

        public byte[] CroppedPngBytes { get; private set; }

        public CropOverlayForm()
        {
            _virtualBounds = SystemInformation.VirtualScreen;
            _screenBitmap = new Bitmap(_virtualBounds.Width, _virtualBounds.Height, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(_screenBitmap))
            {
                g.CopyFromScreen(_virtualBounds.Left, _virtualBounds.Top, 0, 0, _virtualBounds.Size, CopyPixelOperation.SourceCopy);
            }

            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            Bounds = _virtualBounds;
            TopMost = true;
            ShowInTaskbar = false;
            DoubleBuffered = true;
            Cursor = Cursors.Cross;
            KeyPreview = true;
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Activate();
            BringToFront();
            Focus();
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape)
            {
                DialogResult = DialogResult.Cancel;
                Close();
            }
            base.OnKeyDown(e);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Right)
            {
                DialogResult = DialogResult.Cancel;
                Close();
                return;
            }
            if (e.Button == MouseButtons.Left)
            {
                _isDragging = true;
                _startPoint = e.Location;
                _currentPoint = e.Location;
                Invalidate();
            }
            base.OnMouseDown(e);
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            if (_isDragging)
            {
                _currentPoint = e.Location;
                Invalidate();
            }
            base.OnMouseMove(e);
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            if (_isDragging && e.Button == MouseButtons.Left)
            {
                _isDragging = false;
                _currentPoint = e.Location;
                Rectangle rect = GetSelectionRect();
                if (rect.Width >= 15 && rect.Height >= 15)
                {
                    rect.Intersect(new Rectangle(0, 0, _screenBitmap.Width, _screenBitmap.Height));
                    if (rect.Width >= 15 && rect.Height >= 15)
                    {
                        using (Bitmap cropped = _screenBitmap.Clone(rect, PixelFormat.Format32bppArgb))
                        using (MemoryStream ms = new MemoryStream())
                        {
                            cropped.Save(ms, ImageFormat.Png);
                            CroppedPngBytes = ms.ToArray();
                        }
                        DialogResult = DialogResult.OK;
                        Close();
                        return;
                    }
                }
                DialogResult = DialogResult.Cancel;
                Close();
            }
            base.OnMouseUp(e);
        }

        private Rectangle GetSelectionRect()
        {
            int x = Math.Min(_startPoint.X, _currentPoint.X);
            int y = Math.Min(_startPoint.Y, _currentPoint.Y);
            int w = Math.Abs(_currentPoint.X - _startPoint.X);
            int h = Math.Abs(_currentPoint.Y - _startPoint.Y);
            return new Rectangle(x, y, w, h);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.DrawImageUnscaled(_screenBitmap, 0, 0);

            using (Brush dim = new SolidBrush(Color.FromArgb(118, 15, 23, 42)))
            {
                g.FillRectangle(dim, 0, 0, Width, Height);
            }

            if (_isDragging)
            {
                Rectangle sel = GetSelectionRect();
                if (sel.Width > 1 && sel.Height > 1)
                {
                    g.DrawImage(_screenBitmap, sel, sel, GraphicsUnit.Pixel);
                    using (Pen pen = new Pen(Color.FromArgb(37, 99, 235), 2f))
                    {
                        g.DrawRectangle(pen, sel);
                    }

                    string sizeText = sel.Width + " × " + sel.Height + " px";
                    using (Font f = new Font("Consolas", 9.5f, FontStyle.Bold))
                    {
                        SizeF sz = g.MeasureString(sizeText, f);
                        float tx = Math.Min(Width - sz.Width - 10, Math.Max(4, sel.Right - sz.Width - 8));
                        float ty = sel.Bottom + 6 + sz.Height < Height ? sel.Bottom + 6 : Math.Max(4, sel.Top - sz.Height - 8);
                        using (Brush bg = new SolidBrush(Color.FromArgb(220, 30, 41, 59)))
                        {
                            g.FillRectangle(bg, tx - 5, ty - 2, sz.Width + 10, sz.Height + 4);
                        }
                        g.DrawString(sizeText, f, Brushes.White, tx, ty);
                    }
                }
            }

            // Instruction pill at top center of primary monitor
            Rectangle primary = Screen.PrimaryScreen.Bounds;
            int pillCenterX = (primary.Left - _virtualBounds.Left) + (primary.Width / 2);
            int pillTopY = (primary.Top - _virtualBounds.Top) + 22;
            string hint = "محدوده سوال یا کد را با ماوس بکشید  (Esc یا راست‌کلیک برای انصراف)";
            using (Font f = new Font("Segoe UI", 10f, FontStyle.Bold))
            {
                SizeF sz = g.MeasureString(hint, f);
                RectangleF pill = new RectangleF(pillCenterX - (sz.Width / 2f) - 18, pillTopY, sz.Width + 36, sz.Height + 14);
                using (Brush bg = new SolidBrush(Color.FromArgb(238, 15, 23, 42)))
                using (Pen border = new Pen(Color.FromArgb(70, 255, 255, 255), 1f))
                {
                    g.FillRectangle(bg, pill);
                    g.DrawRectangle(border, pill.X, pill.Y, pill.Width, pill.Height);
                }
                g.DrawString(hint, f, Brushes.White, pill.X + 18, pill.Y + 7);
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && _screenBitmap != null)
            {
                _screenBitmap.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    // Settings, Preset Switcher & Q&A History Window
    class MainPanelForm : Form
    {
        private readonly AppTrayContext _ctx;
        private ComboBox _cbProvider;
        private ComboBox _cbPreset;
        private TextBox _txtBaseUrl;
        private TextBox _txtApiKey;
        private TextBox _txtModel;
        private TextBox _txtVisionModel;
        private TextBox _txtPrompt;
        private CheckBox _chkRightClick;
        private CheckBox _chkFailover;
        private ListBox _lstHistory;
        private TextBox _txtHistoryOutput;
        private Label _lblStatus;

        public MainPanelForm(AppTrayContext ctx)
        {
            _ctx = ctx;
            Text = "Windows App";
            Size = new Size(860, 620);
            MinimumSize = new Size(740, 520);
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 9.5f);
            BackColor = Color.FromArgb(248, 250, 252);
            Icon = AppTrayContext.CreateAppIcon();

            BuildUi();
            LoadConfigIntoUi();
            RefreshHistory();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
                return;
            }
            base.OnFormClosing(e);
        }

        private void BuildUi()
        {
            var topBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 48,
                Padding = new Padding(10, 8, 10, 6),
                BackColor = Color.FromArgb(15, 23, 42)
            };

            var btnCrop = MakeTopButton("کراپ اسکرین‌شات (Ctrl+Alt+Shift+S)", Color.FromArgb(37, 99, 235));
            btnCrop.Click += (s, e) => { Hide(); _ctx.TriggerDirectCrop(); };

            var btnClip = MakeTopButton("حل کلیپ‌بورد (Alt+Shift+S)", Color.FromArgb(16, 185, 129));
            btnClip.Click += (s, e) => { _ctx.TriggerSolveClipboard(); };

            var btnSave = MakeTopButton("ذخیره تنظیمات", Color.FromArgb(245, 158, 11));
            btnSave.Click += (s, e) => { SaveUiToConfig(); };

            _lblStatus = new Label
            {
                AutoSize = true,
                ForeColor = Color.FromArgb(203, 213, 225),
                Padding = new Padding(12, 7, 0, 0),
                Text = "فعال در پس‌زمینه — آماده"
            };

            topBar.Controls.Add(btnCrop);
            topBar.Controls.Add(btnClip);
            topBar.Controls.Add(btnSave);
            topBar.Controls.Add(_lblStatus);

            var tabs = new TabControl { Dock = DockStyle.Fill };

            // Tab 1: Settings & Prompt
            var tabSettings = new TabPage("تنظیمات و پرامپت") { BackColor = Color.White, Padding = new Padding(12) };
            var grid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 9
            };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            _cbProvider = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
            foreach (var kv in AppConfig.ProviderLabels)
                _cbProvider.Items.Add(new KeyValuePair<string, string>(kv.Key, kv.Value));
            _cbProvider.DisplayMember = "Value";
            _cbProvider.ValueMember = "Key";
            _cbProvider.SelectedIndexChanged += (s, e) => OnProviderChanged();

            _txtBaseUrl = new TextBox { Dock = DockStyle.Fill };
            _txtApiKey = new TextBox { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
            _txtModel = new TextBox { Dock = DockStyle.Fill };
            _txtVisionModel = new TextBox { Dock = DockStyle.Fill };

            _cbPreset = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
            foreach (var kv in AppConfig.PresetLabels)
                _cbPreset.Items.Add(new KeyValuePair<string, string>(kv.Key, kv.Value));
            _cbPreset.DisplayMember = "Value";
            _cbPreset.ValueMember = "Key";
            _cbPreset.SelectedIndexChanged += (s, e) => OnPresetChanged();

            var optsPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            _chkRightClick = new CheckBox { Text = "فعال‌سازی Ctrl + Shift + راست‌کلیک در کل ویندوز", AutoSize = true, Margin = new Padding(0, 3, 18, 3) };
            _chkFailover = new CheckBox { Text = "Failover خودکار به سرویس‌دهنده‌ی بعدی در صورت خطا", AutoSize = true, Margin = new Padding(0, 3, 0, 3) };
            optsPanel.Controls.Add(_chkRightClick);
            optsPanel.Controls.Add(_chkFailover);

            _txtPrompt = new TextBox
            {
                Dock = DockStyle.Fill,
                Multiline = true,
                ScrollBars = ScrollBars.Vertical,
                RightToLeft = RightToLeft.Yes
            };

            AddRow(grid, 0, "سرویس‌دهنده (Provider):", _cbProvider);
            AddRow(grid, 1, "آدرس API (Base URL):", _txtBaseUrl);
            AddRow(grid, 2, "کلید API:", _txtApiKey);
            AddRow(grid, 3, "مدل پیش‌فرض:", _txtModel);
            AddRow(grid, 4, "مدل تصویر (اختیاری):", _txtVisionModel);
            AddRow(grid, 5, "قالب پرامپت (Preset):", _cbPreset);
            AddRow(grid, 6, "گزینه‌ها:", optsPanel);

            var lblPrompt = new Label { Text = "System Prompt:", AutoSize = true, Padding = new Padding(0, 6, 0, 0) };
            grid.Controls.Add(lblPrompt, 0, 7);
            grid.Controls.Add(_txtPrompt, 1, 7);
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
            grid.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));

            var shortcutsHelp = new Label
            {
                Dock = DockStyle.Fill,
                ForeColor = Color.FromArgb(71, 85, 105),
                BackColor = Color.FromArgb(241, 245, 249),
                Padding = new Padding(8, 6, 8, 6),
                Text = "میانبرهای سراسری ویندوز:  Ctrl+Shift+X یا Ctrl+Shift+A یا Ctrl+Shift+راست‌کلیک (متن انتخاب‌شده -> حل، بدون انتخاب -> کراپ)  |  Alt+Shift+S (حل کلیپ‌بورد)  |  Ctrl+Alt+Shift+S (کراپ مستقیم)  |  Alt+Shift+C (پنل)"
            };
            grid.Controls.Add(shortcutsHelp, 0, 8);
            grid.SetColumnSpan(shortcutsHelp, 2);

            tabSettings.Controls.Add(grid);

            // Tab 2: History
            var tabHistory = new TabPage("تاریخچه پاسخ‌ها") { BackColor = Color.White, Padding = new Padding(10) };
            var split = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Vertical, SplitterDistance = 270 };
            _lstHistory = new ListBox { Dock = DockStyle.Fill, IntegralHeight = false };
            _lstHistory.SelectedIndexChanged += (s, e) => OnHistorySelected();

            var rightPanel = new Panel { Dock = DockStyle.Fill };
            _txtHistoryOutput = new TextBox
            {
                Dock = DockStyle.Fill,
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                RightToLeft = RightToLeft.Yes
            };
            var btnCopyAnswer = new Button
            {
                Text = "کپی پاسخ انتخاب‌شده در کلیپ‌بورد",
                Dock = DockStyle.Bottom,
                Height = 34,
                BackColor = Color.FromArgb(26, 115, 232),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnCopyAnswer.Click += (s, e) =>
            {
                int idx = _lstHistory.SelectedIndex;
                if (idx >= 0 && idx < _ctx.Config.History.Count)
                {
                    _ctx.SetClipboardTextSafe(_ctx.Config.History[idx].Output);
                    SetStatus("پاسخ در کلیپ‌بورد کپی شد.");
                }
            };
            rightPanel.Controls.Add(_txtHistoryOutput);
            rightPanel.Controls.Add(btnCopyAnswer);

            split.Panel1.Controls.Add(_lstHistory);
            split.Panel2.Controls.Add(rightPanel);
            tabHistory.Controls.Add(split);

            tabs.TabPages.Add(tabSettings);
            tabs.TabPages.Add(tabHistory);

            Controls.Add(tabs);
            Controls.Add(topBar);
        }

        private Button MakeTopButton(string text, Color bg)
        {
            var btn = new Button
            {
                Text = text,
                AutoSize = true,
                Height = 30,
                BackColor = bg,
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Padding = new Padding(8, 0, 8, 0),
                Margin = new Padding(0, 0, 8, 0),
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderSize = 0;
            return btn;
        }

        private void AddRow(TableLayoutPanel grid, int row, string labelText, Control ctrl)
        {
            var lbl = new Label { Text = labelText, AutoSize = true, Anchor = AnchorStyles.Left };
            grid.Controls.Add(lbl, 0, row);
            grid.Controls.Add(ctrl, 1, row);
        }

        private string SelectedKey(ComboBox cb)
        {
            if (cb.SelectedItem is KeyValuePair<string, string>)
                return ((KeyValuePair<string, string>)cb.SelectedItem).Key;
            return "";
        }

        private void SelectByKey(ComboBox cb, string key)
        {
            for (int i = 0; i < cb.Items.Count; i++)
            {
                var item = (KeyValuePair<string, string>)cb.Items[i];
                if (item.Key == key)
                {
                    cb.SelectedIndex = i;
                    return;
                }
            }
            if (cb.Items.Count > 0) cb.SelectedIndex = 0;
        }

        public void LoadConfigIntoUi()
        {
            SelectByKey(_cbProvider, _ctx.Config.CurrentProvider);
            SelectByKey(_cbPreset, _ctx.Config.CurrentPreset);
            _txtVisionModel.Text = _ctx.Config.VisionModelOverride ?? "";
            _txtPrompt.Text = _ctx.Config.SystemPrompt ?? "";
            _chkRightClick.Checked = _ctx.Config.EnableCtrlShiftRightClick;
            _chkFailover.Checked = _ctx.Config.EnableAutoFailover;
            OnProviderChanged();
        }

        private void OnProviderChanged()
        {
            string p = SelectedKey(_cbProvider);
            if (string.IsNullOrEmpty(p)) return;
            _txtBaseUrl.Text = _ctx.Config.ApiUrls.ContainsKey(p) ? _ctx.Config.ApiUrls[p] : "";
            _txtApiKey.Text = _ctx.Config.ApiKeys.ContainsKey(p) ? _ctx.Config.ApiKeys[p] : "";
            _txtModel.Text = _ctx.Config.SelectedModels.ContainsKey(p) ? _ctx.Config.SelectedModels[p] : "";
        }

        private void OnPresetChanged()
        {
            string preset = SelectedKey(_cbPreset);
            if (AppConfig.Presets.ContainsKey(preset))
            {
                _txtPrompt.Text = AppConfig.Presets[preset];
            }
        }

        private void SaveUiToConfig()
        {
            string p = SelectedKey(_cbProvider);
            if (!string.IsNullOrEmpty(p))
            {
                _ctx.Config.CurrentProvider = p;
                _ctx.Config.ApiUrls[p] = _txtBaseUrl.Text.Trim();
                _ctx.Config.ApiKeys[p] = _txtApiKey.Text.Trim();
                _ctx.Config.SelectedModels[p] = _txtModel.Text.Trim();
            }
            _ctx.Config.CurrentPreset = SelectedKey(_cbPreset);
            _ctx.Config.SystemPrompt = _txtPrompt.Text;
            _ctx.Config.VisionModelOverride = _txtVisionModel.Text.Trim();
            _ctx.Config.EnableCtrlShiftRightClick = _chkRightClick.Checked;
            _ctx.Config.EnableAutoFailover = _chkFailover.Checked;
            _ctx.Config.Save();
            _ctx.SyncTrayMenuChecks();
            SetStatus("تنظیمات ذخیره شد.");
        }

        public void RefreshHistory()
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(RefreshHistory));
                return;
            }
            _lstHistory.Items.Clear();
            foreach (var h in _ctx.Config.History)
            {
                string prefix = h.HasImage ? "[تصویر] " : "";
                string preview = (h.Input ?? "").Replace("\r", " ").Replace("\n", " ");
                if (preview.Length > 42) preview = preview.Substring(0, 42) + "...";
                _lstHistory.Items.Add(h.Time + " | " + prefix + preview);
            }
            if (_lstHistory.Items.Count > 0 && _lstHistory.SelectedIndex < 0)
                _lstHistory.SelectedIndex = 0;
        }

        private void OnHistorySelected()
        {
            int idx = _lstHistory.SelectedIndex;
            if (idx >= 0 && idx < _ctx.Config.History.Count)
            {
                var h = _ctx.Config.History[idx];
                _txtHistoryOutput.Text = "سوال:\r\n" + h.Input + "\r\n\r\nپاسخ (" + h.Provider + " / " + h.Model + " - " + h.DurationMs + "ms):\r\n" + h.Output;
            }
        }

        public void SetStatus(string text)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(SetStatus), text);
                return;
            }
            _lblStatus.Text = text;
        }
    }

    // Hidden message window receiving Win32 global hotkeys and mouse-hook posts
    class HotkeyMessageWindow : NativeWindow, IDisposable
    {
        public event Action<int> HotkeyPressed;
        public event Action SmartRightClickPressed;

        public HotkeyMessageWindow()
        {
            CreateHandle(new CreateParams());
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == NativeMethods.WM_HOTKEY)
            {
                int id = m.WParam.ToInt32();
                if (HotkeyPressed != null) HotkeyPressed(id);
                return;
            }
            if (m.Msg == NativeMethods.WM_APP_SMART_TRIGGER)
            {
                if (SmartRightClickPressed != null) SmartRightClickPressed();
                return;
            }
            base.WndProc(ref m);
        }

        public void Dispose()
        {
            DestroyHandle();
        }
    }

    class AppTrayContext : ApplicationContext
    {
        private const int HK_SMART_X = 1001;
        private const int HK_SMART_A = 1002;
        private const int HK_SOLVE_CLIP = 1003;
        private const int HK_CROP_DIRECT = 1004;
        private const int HK_OPEN_PANEL = 1005;
        private const string STARTUP_REG_KEY = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
        private const string STARTUP_APP_NAME = "WindowsApp";

        public AppConfig Config { get; private set; }

        private readonly NotifyIcon _trayIcon;
        private readonly HotkeyMessageWindow _msgWindow;
        private readonly FloatingBadgeForm _badge;
        private MainPanelForm _panel;

        private IntPtr _mouseHookHandle = IntPtr.Zero;
        private NativeMethods.LowLevelMouseProc _mouseProc;
        private bool _suppressNextRightUp = false;
        private bool _isBusy = false;
        private bool _isCropping = false;
        private long _lastTriggerTicks = 0;

        private ToolStripMenuItem _miRightClick;
        private ToolStripMenuItem _miFailover;
        private ToolStripMenuItem _miStartup;
        private readonly Dictionary<string, ToolStripMenuItem> _presetMenuItems = new Dictionary<string, ToolStripMenuItem>();
        private readonly Dictionary<string, ToolStripMenuItem> _providerMenuItems = new Dictionary<string, ToolStripMenuItem>();

        public AppTrayContext()
        {
            Config = AppConfig.Load();
            _badge = new FloatingBadgeForm();
            _msgWindow = new HotkeyMessageWindow();
            _msgWindow.HotkeyPressed += OnHotkeyPressed;
            _msgWindow.SmartRightClickPressed += () => HandleSmartTriggerAsync();

            _trayIcon = new NotifyIcon
            {
                Icon = CreateAppIcon(),
                Text = "Windows App (آماده)",
                Visible = true,
                ContextMenuStrip = BuildTrayMenu()
            };
            _trayIcon.DoubleClick += (s, e) => OpenPanel();

            RegisterAllHotkeys();
            InstallMouseHook();
            SyncTrayMenuChecks();

            _trayIcon.ShowBalloonTip(
                3000,
                "Windows App فعال شد",
                "Ctrl+Shift+X / A / راست‌کلیک: پردازش متن انتخاب‌شده یا کراپ اسکرین‌شات\nAlt+Shift+S: پردازش کلیپ‌بورد | Alt+Shift+C: تنظیمات",
                ToolTipIcon.Info
            );
        }

        public static Icon CreateAppIcon()
        {
            using (Bitmap bmp = new Bitmap(32, 32, PixelFormat.Format32bppArgb))
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);
                using (Brush bg = new SolidBrush(Color.FromArgb(26, 115, 232)))
                {
                    g.FillEllipse(bg, 2, 2, 28, 28);
                }
                using (Font f = new Font("Segoe UI", 13f, FontStyle.Bold))
                using (StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                {
                    g.DrawString("W", f, Brushes.White, new RectangleF(0, 1, 32, 31), sf);
                }
                IntPtr hIcon = bmp.GetHicon();
                try
                {
                    return (Icon)Icon.FromHandle(hIcon).Clone();
                }
                finally
                {
                    NativeMethods.DestroyIcon(hIcon);
                }
            }
        }

        private ContextMenuStrip BuildTrayMenu()
        {
            var menu = new ContextMenuStrip();

            var miOpen = new ToolStripMenuItem("باز کردن پنل و تاریخچه (Alt+Shift+C)");
            miOpen.Font = new Font(miOpen.Font, FontStyle.Bold);
            miOpen.Click += (s, e) => OpenPanel();

            var miSolveClip = new ToolStripMenuItem("حل متن/تصویر کلیپ‌بورد (Alt+Shift+S)");
            miSolveClip.Click += (s, e) => TriggerSolveClipboard();

            var miCrop = new ToolStripMenuItem("کراپ اسکرین‌شات صفحه (Ctrl+Alt+Shift+S)");
            miCrop.Click += (s, e) => TriggerDirectCrop();

            var miPresets = new ToolStripMenuItem("قالب پرامپت (Preset)");
            foreach (var kv in AppConfig.PresetLabels)
            {
                if (kv.Key == "custom") continue;
                string presetId = kv.Key;
                var sub = new ToolStripMenuItem(kv.Value);
                sub.Click += (s, e) =>
                {
                    Config.CurrentPreset = presetId;
                    Config.SystemPrompt = AppConfig.Presets[presetId];
                    Config.Save();
                    SyncTrayMenuChecks();
                    if (_panel != null && !_panel.IsDisposed) _panel.LoadConfigIntoUi();
                };
                _presetMenuItems[presetId] = sub;
                miPresets.DropDownItems.Add(sub);
            }

            var miProviders = new ToolStripMenuItem("سرویس‌دهنده (Provider)");
            foreach (var kv in AppConfig.ProviderLabels)
            {
                string providerId = kv.Key;
                var sub = new ToolStripMenuItem(kv.Value);
                sub.Click += (s, e) =>
                {
                    Config.CurrentProvider = providerId;
                    Config.Save();
                    SyncTrayMenuChecks();
                    if (_panel != null && !_panel.IsDisposed) _panel.LoadConfigIntoUi();
                };
                _providerMenuItems[providerId] = sub;
                miProviders.DropDownItems.Add(sub);
            }

            _miRightClick = new ToolStripMenuItem("فعال‌سازی Ctrl+Shift+راست‌کلیک");
            _miRightClick.Click += (s, e) =>
            {
                Config.EnableCtrlShiftRightClick = !Config.EnableCtrlShiftRightClick;
                Config.Save();
                SyncTrayMenuChecks();
                if (_panel != null && !_panel.IsDisposed) _panel.LoadConfigIntoUi();
            };

            _miFailover = new ToolStripMenuItem("Failover خودکار بین سرویس‌دهنده‌ها");
            _miFailover.Click += (s, e) =>
            {
                Config.EnableAutoFailover = !Config.EnableAutoFailover;
                Config.Save();
                SyncTrayMenuChecks();
                if (_panel != null && !_panel.IsDisposed) _panel.LoadConfigIntoUi();
            };

            _miStartup = new ToolStripMenuItem("اجرای خودکار با شروع ویندوز");
            _miStartup.Click += (s, e) => ToggleStartup();

            var miExit = new ToolStripMenuItem("خروج (Exit)");
            miExit.Click += (s, e) => ExitApp();

            menu.Items.Add(miOpen);
            menu.Items.Add(miSolveClip);
            menu.Items.Add(miCrop);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(miPresets);
            menu.Items.Add(miProviders);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(_miRightClick);
            menu.Items.Add(_miFailover);
            menu.Items.Add(_miStartup);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(miExit);

            return menu;
        }

        public void SyncTrayMenuChecks()
        {
            foreach (var kv in _presetMenuItems)
                kv.Value.Checked = (kv.Key == Config.CurrentPreset);
            foreach (var kv in _providerMenuItems)
                kv.Value.Checked = (kv.Key == Config.CurrentProvider);
            if (_miRightClick != null) _miRightClick.Checked = Config.EnableCtrlShiftRightClick;
            if (_miFailover != null) _miFailover.Checked = Config.EnableAutoFailover;
            if (_miStartup != null) _miStartup.Checked = IsStartupEnabled();
        }

        private bool IsStartupEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(STARTUP_REG_KEY, false))
                {
                    if (key == null) return false;
                    object val = key.GetValue(STARTUP_APP_NAME);
                    return val != null && !string.IsNullOrEmpty(val.ToString());
                }
            }
            catch { return false; }
        }

        private void ToggleStartup()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(STARTUP_REG_KEY, true))
                {
                    if (key == null) return;
                    if (IsStartupEnabled())
                        key.DeleteValue(STARTUP_APP_NAME, false);
                    else
                        key.SetValue(STARTUP_APP_NAME, "\"" + Application.ExecutablePath + "\"");
                }
            }
            catch { }
            SyncTrayMenuChecks();
        }

        private void RegisterAllHotkeys()
        {
            IntPtr h = _msgWindow.Handle;
            NativeMethods.RegisterHotKey(h, HK_SMART_X, NativeMethods.MOD_CONTROL | NativeMethods.MOD_SHIFT | NativeMethods.MOD_NOREPEAT, NativeMethods.VK_X);
            NativeMethods.RegisterHotKey(h, HK_SMART_A, NativeMethods.MOD_CONTROL | NativeMethods.MOD_SHIFT | NativeMethods.MOD_NOREPEAT, NativeMethods.VK_A);
            NativeMethods.RegisterHotKey(h, HK_SOLVE_CLIP, NativeMethods.MOD_ALT | NativeMethods.MOD_SHIFT | NativeMethods.MOD_NOREPEAT, NativeMethods.VK_S);
            NativeMethods.RegisterHotKey(h, HK_CROP_DIRECT, NativeMethods.MOD_CONTROL | NativeMethods.MOD_ALT | NativeMethods.MOD_SHIFT | NativeMethods.MOD_NOREPEAT, NativeMethods.VK_S);
            NativeMethods.RegisterHotKey(h, HK_OPEN_PANEL, NativeMethods.MOD_ALT | NativeMethods.MOD_SHIFT | NativeMethods.MOD_NOREPEAT, NativeMethods.VK_C);
        }

        private void InstallMouseHook()
        {
            _mouseProc = MouseHookCallback;
            using (var curProc = System.Diagnostics.Process.GetCurrentProcess())
            using (var curMod = curProc.MainModule)
            {
                _mouseHookHandle = NativeMethods.SetWindowsHookEx(
                    NativeMethods.WH_MOUSE_LL,
                    _mouseProc,
                    NativeMethods.GetModuleHandle(curMod.ModuleName),
                    0
                );
            }
        }

        private IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && Config.EnableCtrlShiftRightClick && !_isCropping)
            {
                int msg = wParam.ToInt32();
                if (msg == NativeMethods.WM_RBUTTONDOWN)
                {
                    bool ctrl = NativeMethods.IsKeyDown(NativeMethods.VK_CONTROL);
                    bool shift = NativeMethods.IsKeyDown(NativeMethods.VK_SHIFT);
                    bool alt = NativeMethods.IsKeyDown(NativeMethods.VK_MENU);
                    if (ctrl && shift && !alt)
                    {
                        _suppressNextRightUp = true;
                        NativeMethods.PostMessage(_msgWindow.Handle, NativeMethods.WM_APP_SMART_TRIGGER, IntPtr.Zero, IntPtr.Zero);
                        return new IntPtr(1);
                    }
                }
                else if (msg == NativeMethods.WM_RBUTTONUP && _suppressNextRightUp)
                {
                    _suppressNextRightUp = false;
                    return new IntPtr(1);
                }
            }
            return NativeMethods.CallNextHookEx(_mouseHookHandle, nCode, wParam, lParam);
        }

        private void OnHotkeyPressed(int id)
        {
            if (id == HK_SMART_X || id == HK_SMART_A)
            {
                HandleSmartTriggerAsync();
            }
            else if (id == HK_SOLVE_CLIP)
            {
                TriggerSolveClipboard();
            }
            else if (id == HK_CROP_DIRECT)
            {
                TriggerDirectCrop();
            }
            else if (id == HK_OPEN_PANEL)
            {
                OpenPanel();
            }
        }

        private bool CheckDebounce()
        {
            long now = Environment.TickCount;
            if (Math.Abs(now - _lastTriggerTicks) < 450) return false;
            _lastTriggerTicks = now;
            return true;
        }

        public void OpenPanel()
        {
            if (_panel == null || _panel.IsDisposed)
                _panel = new MainPanelForm(this);
            _panel.LoadConfigIntoUi();
            _panel.RefreshHistory();
            _panel.Show();
            _panel.WindowState = FormWindowState.Normal;
            _panel.Activate();
        }

        // Clean selected text while preserving Persian ZWNJ (\u200C) and rejecting invisible-only strings
        private static string CleanSelectionText(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return "";
            string cleaned = Regex.Replace(raw, @"^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$", "");
            string visible = Regex.Replace(cleaned, @"[\s\u00A0\u200B\u200C\u200D\uFEFF]+", "");
            return visible.Length > 0 ? cleaned : "";
        }

        private string GetClipboardTextSafe()
        {
            for (int i = 0; i < 8; i++)
            {
                try
                {
                    if (Clipboard.ContainsText())
                        return Clipboard.GetText() ?? "";
                    return "";
                }
                catch
                {
                    Thread.Sleep(25);
                }
            }
            return "";
        }

        private Image GetClipboardImageSafe()
        {
            for (int i = 0; i < 8; i++)
            {
                try
                {
                    if (Clipboard.ContainsImage())
                        return Clipboard.GetImage();
                    return null;
                }
                catch
                {
                    Thread.Sleep(25);
                }
            }
            return null;
        }

        public bool SetClipboardTextSafe(string text)
        {
            for (int i = 0; i < 8; i++)
            {
                try
                {
                    if (string.IsNullOrEmpty(text))
                        Clipboard.Clear();
                    else
                        Clipboard.SetText(text);
                    return true;
                }
                catch
                {
                    Thread.Sleep(25);
                }
            }
            return false;
        }

        private void RestoreClipboardSafe(string prevText, Image prevImage)
        {
            for (int i = 0; i < 6; i++)
            {
                try
                {
                    if (prevImage != null)
                        Clipboard.SetImage(prevImage);
                    else if (!string.IsNullOrEmpty(prevText))
                        Clipboard.SetText(prevText);
                    else
                        Clipboard.Clear();
                    return;
                }
                catch
                {
                    Thread.Sleep(25);
                }
            }
        }

        private async Task<string> TryExtractSelectedTextViaCopyAsync()
        {
            // Wait briefly for modifier/hotkey release up to 160ms so the foreground app handles Ctrl+C cleanly
            for (int i = 0; i < 8; i++)
            {
                if (!NativeMethods.IsKeyDown(NativeMethods.VK_X) && !NativeMethods.IsKeyDown(NativeMethods.VK_A))
                    break;
                await Task.Delay(20);
            }

            string prevText = GetClipboardTextSafe();
            Image prevImage = string.IsNullOrEmpty(prevText) ? GetClipboardImageSafe() : null;

            string sentinel = "__WINAPP_PROBE_" + Guid.NewGuid().ToString("N") + "__";
            if (!SetClipboardTextSafe(sentinel))
            {
                if (prevImage != null) prevImage.Dispose();
                return "";
            }

            NativeMethods.ReleaseTriggerModifiers();
            await Task.Delay(25);
            NativeMethods.SendCtrlC();

            string captured = "";
            int[] waits = new int[] { 40, 50, 70, 90 };
            foreach (int w in waits)
            {
                await Task.Delay(w);
                string current = GetClipboardTextSafe();
                if (!string.IsNullOrEmpty(current) && current != sentinel)
                {
                    captured = CleanSelectionText(current);
                    break;
                }
            }

            if (string.IsNullOrEmpty(captured))
            {
                RestoreClipboardSafe(prevText, prevImage);
            }

            if (prevImage != null) prevImage.Dispose();
            return captured;
        }

        // Smart Trigger: Ctrl+Shift+X / Ctrl+Shift+A / Ctrl+Shift+Right-Click
        private async void HandleSmartTriggerAsync()
        {
            if (_isBusy || _isCropping || !CheckDebounce()) return;
            _isBusy = true;
            try
            {
                string selected = await TryExtractSelectedTextViaCopyAsync();
                if (!string.IsNullOrEmpty(selected))
                {
                    await SolveAndCopyAsync(selected, null);
                }
                else
                {
                    _isBusy = false;
                    TriggerDirectCrop();
                    return;
                }
            }
            catch (Exception ex)
            {
                ShowError(ex.Message);
            }
            finally
            {
                _isBusy = false;
            }
        }

        // Solve Clipboard Directly: Alt+Shift+S (supports both text and screenshot images!)
        public async void TriggerSolveClipboard()
        {
            if (_isBusy || _isCropping || !CheckDebounce()) return;
            _isBusy = true;
            try
            {
                string text = CleanSelectionText(GetClipboardTextSafe());
                string imgBase64 = null;

                if (string.IsNullOrEmpty(text))
                {
                    using (Image img = GetClipboardImageSafe())
                    {
                        if (img != null)
                        {
                            using (MemoryStream ms = new MemoryStream())
                            {
                                img.Save(ms, ImageFormat.Png);
                                imgBase64 = Convert.ToBase64String(ms.ToArray());
                            }
                        }
                    }
                }

                if (string.IsNullOrEmpty(text) && string.IsNullOrEmpty(imgBase64))
                {
                    _badge.ShowStatus("!", Color.FromArgb(220, 38, 38), 1200);
                    return;
                }

                await SolveAndCopyAsync(text, imgBase64);
            }
            catch (Exception ex)
            {
                ShowError(ex.Message);
            }
            finally
            {
                _isBusy = false;
            }
        }

        // Direct Multi-Monitor Screen Crop: Ctrl+Alt+Shift+S
        public async void TriggerDirectCrop()
        {
            if (_isCropping || _isBusy) return;
            _isCropping = true;
            byte[] pngBytes = null;
            try
            {
                using (var overlay = new CropOverlayForm())
                {
                    if (overlay.ShowDialog() == DialogResult.OK && overlay.CroppedPngBytes != null)
                    {
                        pngBytes = overlay.CroppedPngBytes;
                    }
                }
            }
            finally
            {
                _isCropping = false;
            }

            if (pngBytes != null && pngBytes.Length > 0)
            {
                _isBusy = true;
                try
                {
                    string base64 = Convert.ToBase64String(pngBytes);
                    await SolveAndCopyAsync("", base64);
                }
                catch (Exception ex)
                {
                    ShowError(ex.Message);
                }
                finally
                {
                    _isBusy = false;
                }
            }
        }

        private async Task SolveAndCopyAsync(string text, string imageBase64)
        {
            _badge.ShowStatus("...", Color.FromArgb(245, 158, 11), 0);
            _trayIcon.Text = "Windows App (در حال پردازش...)";
            if (_panel != null && !_panel.IsDisposed) _panel.SetStatus("در حال ارسال درخواست...");

            var sw = System.Diagnostics.Stopwatch.StartNew();
            var result = await ApiClient.SolveWithFailoverAsync(Config, text, imageBase64);
            sw.Stop();

            string answer = result.Item1;
            string usedProvider = result.Item2;
            string usedModel = result.Item3;

            SetClipboardTextSafe(answer);

            Config.History.Insert(0, new HistoryEntry
            {
                Time = DateTime.Now.ToString("HH:mm:ss"),
                Provider = usedProvider,
                Model = usedModel,
                HasImage = !string.IsNullOrEmpty(imageBase64),
                Input = !string.IsNullOrEmpty(text) ? text : "[Screenshot Crop]",
                Output = answer,
                DurationMs = sw.ElapsedMilliseconds
            });
            Config.Save();

            if (_panel != null && !_panel.IsDisposed)
            {
                _panel.RefreshHistory();
                _panel.SetStatus("انجام شد (" + usedProvider + " / " + usedModel + " — " + sw.ElapsedMilliseconds + "ms) و در کلیپ‌بورد کپی شد.");
            }

            _trayIcon.Text = "Windows App (آماده)";
            _badge.ShowStatus("✓", Color.FromArgb(26, 115, 232), 650);
        }

        private void ShowError(string message)
        {
            _trayIcon.Text = "Windows App (خطا)";
            _badge.ShowStatus("!", Color.FromArgb(220, 38, 38), 2200);
            if (_panel != null && !_panel.IsDisposed) _panel.SetStatus("خطا: " + message);
            _trayIcon.ShowBalloonTip(3500, "خطا در Windows App", message, ToolTipIcon.Error);
        }

        private void ExitApp()
        {
            try
            {
                IntPtr h = _msgWindow.Handle;
                NativeMethods.UnregisterHotKey(h, HK_SMART_X);
                NativeMethods.UnregisterHotKey(h, HK_SMART_A);
                NativeMethods.UnregisterHotKey(h, HK_SOLVE_CLIP);
                NativeMethods.UnregisterHotKey(h, HK_CROP_DIRECT);
                NativeMethods.UnregisterHotKey(h, HK_OPEN_PANEL);
            }
            catch { }

            if (_mouseHookHandle != IntPtr.Zero)
            {
                NativeMethods.UnhookWindowsHookEx(_mouseHookHandle);
                _mouseHookHandle = IntPtr.Zero;
            }

            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _badge.Dispose();
            if (_panel != null && !_panel.IsDisposed) _panel.Dispose();
            _msgWindow.Dispose();
            ExitThread();
        }
    }

    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            // Enable TLS 1.2 / 1.3 for modern HTTPS APIs on .NET Framework 4.x
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)12288;
            }
            catch
            {
                try { ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12; } catch { }
            }

            NativeMethods.EnableDpiAwareness();

            // Self-test flag for automated verification (does not start tray loop)
            if (args != null && args.Length > 0 && args[0] == "--self-test")
            {
                AppConfig cfg = AppConfig.CreateDefault();
                if (cfg.ApiKeys.Count < 4 || string.IsNullOrEmpty(cfg.SystemPrompt))
                    Environment.Exit(2);
                using (Icon ico = AppTrayContext.CreateAppIcon())
                {
                    if (ico == null || ico.Width <= 0) Environment.Exit(3);
                }
                Console.WriteLine("SELF_TEST_OK");
                Environment.Exit(0);
            }

            bool createdNew;
            using (var mutex = new Mutex(true, @"Local\WindowsApp_SingleInstance", out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show(
                        "برنامه Windows App هم‌اکنون در پس‌زمینه (System Tray) در حال اجراست.\nبرای باز کردن تنظیمات کلید Alt+Shift+C را بزنید.",
                        "Windows App",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new AppTrayContext());
            }
        }
    }
}
