#!/usr/bin/env python3
"""
Ghost Copilot - Linux Desktop Global Shortcut Solver
Takes question directly from system clipboard, solves it with DeepSeek 4.1 Flash,
replaces the clipboard with the solved answer, and sends a system desktop notification.

Usage:
  python3 ghost_copilot.py

Can be bound to ANY custom shortcut in Ubuntu (Settings -> Keyboard -> Keyboard Shortcuts -> Custom Shortcuts):
  Name: Ghost Copilot Solve
  Command: python3 /home/milad/.gemini/antigravity-ide/scratch/clipboard-ai/ghost_copilot.py
  Shortcut: Alt+C (or any key)
"""

import sys
import json
import urllib.request
import subprocess

PROVIDERS = [
    {
        "name": "GapGPT",
        "url": "https://api.gapgpt.app/v1/chat/completions",
        "key": "sk-F4T2AxOQw9HcnrUBdfsbTF7Fsu5JZelWBjBRhBkeNxpSLsNX",
        "model": "deepseek-v4.1-flash"
    },
    {
        "name": "AvalAI",
        "url": "https://api.avalai.ir/v1/chat/completions",
        "key": "aa-d7tPVrnvwXyu03TJGpXfSPMkaesXshv98TqFM3P6p6aPmWzN",
        "model": "deepseek-v4.1-flash"
    },
    {
        "name": "ArvanCloud",
        "url": "https://api.arvancloudai.ir/v1/chat/completions",
        "key": "44f82d65-9e2b-536f-a7af-c4a353735f3e",
        "model": "DeepSeek-V4.1-Flash"
    }
]

SYSTEM_PROMPT = """شما یک دانشجوی نخبه در جلسه امتحان تستی/تشریحی با محدودیت زمانی شدید هستید (فقط ۱ دقیقه زمان برای هر سوال). پاسخ‌ها باید فوق‌العاده کوتاه، فشرده، نمره‌آور و ۱۰۰٪ آماده برای کپی‌پیست سریع باشند، طوری که کاملاً طبیعی به نظر برسد دانشجو خودش در ۱ دقیقه آن را تایپ کرده است (حجم پاسخ نباید شک‌برانگیز یا غیرواقعی برای زمان ۱ دقیقه باشد).

قوانین حیاتی (Strict Ultra-Short & Realistic 1-Minute Exam):
۱. محدودیت حجم و زمان (حداکثر متناسب با تایپ در ۱ دقیقه):
- برای هر سوال تشریحی/مفهومی: فقط ۱ تا ۲ خط بسیار کوتاه و فشرده شامل کلیدواژه‌های اصلی نمره‌آور (Keywords).
- برای سوالات تستی و چندگزینه‌ای: فقط نام/شماره گزینه صحیح (مثلاً: «گزینه ۲») + حداکثر یک نیم‌جمله کوتاه دلیل (در صورت نیاز).
- برای سوالات کدنویسی: فقط بدنه اصلی و مینیمال کد Java بدون توضیحات اضافه.

۲. هیچ توضیح، تعارف یا مقدمه‌ای به کاربر نده:
مطلقا هیچ سلام، مقدمه، نتیجه‌گیری، یا جملاتی مثل «پاسخ سوالات به شرح زیر است» ننویس. فوراً و مستقیماً با «سوال ۱:» شروع کن.

۳. لحن کاملاً انسانی و غیرقابل تشخیص از AI:
از به کار بردن هرگونه کلمات کلیشه‌ای هوش مصنوعی اکیداً خودداری کن.

۴. زبان و فرمت:
پاسخ‌های متنی به فارسی روان و کدها به زبان Java باشد."""

def get_clipboard():
    for cmd in [['wl-paste'], ['xclip', '-selection', 'clipboard', '-o'], ['xsel', '--clipboard', '--output']]:
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            text = res.stdout.strip()
            if text:
                return text
        except Exception:
            continue
    return ""

def set_clipboard(text):
    for cmd in [['wl-copy'], ['xclip', '-selection', 'clipboard']]:
        try:
            p = subprocess.Popen(cmd, stdin=subprocess.PIPE, text=True)
            p.communicate(input=text)
            if p.returncode == 0:
                return True
        except Exception:
            continue
    return False

def show_bottom_right_tick():
    try:
        import gi
        gi.require_version('Gtk', '3.0')
        from gi.repository import Gtk, Gdk, GLib

        win = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
        win.set_title('tick')
        win.set_keep_above(True)
        win.set_decorated(False)
        win.set_skip_taskbar_hint(True)
        win.set_skip_pager_hint(True)
        win.set_type_hint(Gdk.WindowTypeHint.TOOLTIP)

        screen = win.get_screen()
        visual = screen.get_rgba_visual()
        if visual:
            win.set_visual(visual)

        css_data = b'''
        window { background: transparent; }
        #tick_box {
            background: #1a73e8;
            border-radius: 12px;
            min-width: 24px;
            min-height: 24px;
        }
        #tick_lbl {
            color: #ffffff;
            font-family: sans-serif;
            font-size: 14px;
            font-weight: bold;
        }
        '''
        provider = Gtk.CssProvider()
        provider.load_from_data(css_data)
        Gtk.StyleContext.add_provider_for_screen(screen, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

        box = Gtk.Box()
        box.set_name('tick_box')
        lbl = Gtk.Label(label='✓')
        lbl.set_name('tick_lbl')
        box.pack_start(lbl, True, True, 0)
        win.add(box)

        display = screen.get_display()
        monitor = display.get_primary_monitor() or display.get_monitor(0)
        geom = monitor.get_geometry()
        win.set_default_size(24, 24)
        win.move(geom.x + geom.width - 40, geom.y + geom.height - 40)
        win.show_all()

        GLib.timeout_add(500, Gtk.main_quit)
        Gtk.main()
    except Exception:
        pass

def main():
    question = get_clipboard()
    if not question:
        sys.exit(1)

    for prov in PROVIDERS:
        payload = {
            "model": prov["model"],
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": question}
            ],
            "temperature": 0.2
        }

        try:
            req = urllib.request.Request(
                prov["url"],
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {prov['key']}"
                }
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                answer = data["choices"][0]["message"]["content"].strip()

            if answer:
                set_clipboard(answer)
                show_bottom_right_tick()
                return

        except Exception as e:
            print(f"Provider {prov['name']} error: {e}", file=sys.stderr)
            continue

    sys.exit(1)

if __name__ == '__main__':
    main()
