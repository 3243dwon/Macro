"""
Compare old vs new indicators.json and report signal flips.
Outputs a Feishu card JSON to /tmp/signal_alert.json if any flips found.
Exit code 0 = flips found (file written), exit code 1 = no flips.
"""
import json
import os
import sys
from datetime import datetime, timezone

OLD_FILE = sys.argv[1] if len(sys.argv) > 1 else "data/indicators_old.json"
NEW_FILE = sys.argv[2] if len(sys.argv) > 2 else "data/indicators.json"
OUTPUT = "/tmp/signal_alert.json"


def load(path):
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


old = load(OLD_FILE)
new = load(NEW_FILE)

flips = []
for key, new_ind in new.items():
    if key.startswith("_"):
        continue
    if not isinstance(new_ind, dict):
        continue
    new_sig = new_ind.get("signal")
    old_ind = old.get(key, {})
    if not isinstance(old_ind, dict):
        continue
    old_sig = old_ind.get("signal")
    if old_sig and new_sig and old_sig != new_sig:
        label = new_ind.get("label", key)
        val = new_ind.get("value")
        val_str = new_ind.get("value_str") or (f"{val:,.2f}" if val else "N/A")
        flips.append({
            "key": key,
            "label": label,
            "old": old_sig,
            "new": new_sig,
            "value": val_str,
        })

if not flips:
    sys.exit(1)

# Build Feishu card
now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
emoji = {"BULLISH": "🟢", "BEARISH": "🔴", "NEUTRAL": "🟡"}
lines = []
for f in flips:
    e_old = emoji.get(f["old"], "⚪")
    e_new = emoji.get(f["new"], "⚪")
    lines.append(f"{e_old} → {e_new} **{f['label']}** ({f['value']})：{f['old']} → {f['new']}")

body = "\n".join(lines)

card = {
    "msg_type": "interactive",
    "card": {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": f"⚡ Macro Signal Alert — {len(flips)} flip(s)"},
            "template": "red" if any(f["new"] == "BEARISH" for f in flips) else "green"
        },
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": body}},
            {"tag": "hr"},
            {"tag": "div", "text": {"tag": "lark_md", "content": f"🕐 {now}｜[Dashboard](https://macro-indol-beta.vercel.app)"}}
        ]
    }
}

with open(OUTPUT, "w") as f:
    json.dump(card, f, ensure_ascii=False)

print(f"  ⚡ {len(flips)} signal flip(s) detected:")
for fl in flips:
    print(f"     {fl['label']}: {fl['old']} → {fl['new']}")

sys.exit(0)
