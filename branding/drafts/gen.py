"""Brouillons d'icône (charte Paname Dev, section 3 bis). Génère les SVG + la planche de comparaison."""
SHEET = "M -74,-142.5 H 54 L 110,-86.5 V 106.5 Q 110,142.5 74,142.5 H -74 Q -110,142.5 -110,106.5 V -106.5 Q -110,-142.5 -74,-142.5 Z"
FOLD = "M 54,-142.5 L 54,-98 Q 54,-86.5 66,-86.5 L 110,-86.5 Z"

def icon(bg, ink, back, front="#fff4d6", hl="#ffe66d", fold="#ecd9a6"):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="113" fill="{bg}"/>
  <g transform="translate(256,256) scale(1.14) translate(-269,-261)">
  <g transform="translate(300,250) rotate(12)">
    <rect x="-105" y="-135" width="210" height="270" rx="38" fill="{back}"/>
  </g>
  <g transform="translate(232,272) rotate(-6)">
    <path d="{SHEET}" transform="translate(9,11)" fill="{ink}" opacity=".28"/>
    <path d="{SHEET}" fill="{front}"/>
    <path d="{FOLD}" fill="{fold}"/>
    <rect x="-90" y="-3" width="180" height="42" rx="16" fill="{hl}"/>
    <g stroke="{ink}" stroke-width="21" stroke-linecap="round" fill="none">
      <path d="M -68,-84 H 4" stroke-width="27"/>
      <path d="M -68,-30 H 68"/>
      <path d="M -68,18 H 58"/>
      <path d="M -68,66 H 68"/>
      <path d="M -68,108 H -6"/>
    </g>
  </g>
  </g>
</svg>
'''

VARIANTS = [
    ("violet", "Violet · 288°", "#7b70c5", "#574e90", "#8fd3ff"),
    ("orange", "Orange brûlé · 69°", "#ae6e05", "#7d4d00", "#a8e6a1"),
    ("cyan", "Cyan · 219°", "#0a8ca9", "#046378", "#cdbcff"),
]
for slug, _, bg, ink, back in VARIANTS:
    open(f"icone-{slug}.svg", "w").write(icon(bg, ink, back))

cols = ""
for slug, label, bg, ink, back in VARIANTS:
    imgs = lambda px: f'<img src="icone-{slug}.svg" width="{px}" height="{px}">'
    cols += f'''<section><h2>{label}</h2><p class="c">{bg} · encre {ink}</p>
      <div class="big">{imgs(220)}</div>
      <div class="row light">{imgs(96)}{imgs(48)}{imgs(32)}</div>
      <div class="row dark">{imgs(96)}{imgs(48)}{imgs(32)}</div></section>'''
open("planche.html", "w").write(f'''<!doctype html><meta charset="utf-8"><style>
body{{margin:0;padding:28px;background:#f4f5f7;font:15px system-ui,sans-serif;color:#1c1e22}}
.w{{display:flex;gap:28px}} section{{flex:1}} h2{{margin:0 0 2px;font-size:17px}} .c{{margin:0 0 12px;color:#6b7280;font-size:13px}}
.big{{background:#fff;border-radius:16px;padding:20px;display:grid;place-content:center;margin-bottom:12px}}
.row{{display:flex;align-items:flex-end;gap:18px;padding:14px 16px;border-radius:14px;margin-bottom:10px}}
.light{{background:#fff}} .dark{{background:#17181b}}
</style><h1 style="margin:0 0 18px;font-size:20px">Icône — 3 couleurs de la réserve (96 / 48 / 32 px, clair et sombre)</h1><div class="w">{cols}</div>''')
