import re, glob, os

TRIPLE = {
  '0,255,102': 'up', '0, 255, 102': 'up',
  '0,229,255': 'cyan', '0, 229, 255': 'cyan',
  '255,136,0': 'warn', '255, 136, 0': 'warn',
  '255,17,51': 'down', '255, 17, 51': 'down',
  '157,0,255': 'violet', '157, 0, 255': 'violet',
  '26,26,36': 'grid', '26, 26, 36': 'grid',
  '92,107,100': 'textMuted', '90,107,100': 'textMuted',
  '216,255,233': 'text', '4,4,10': 'bgDeep', '2,2,6': 'bgDeep',
  '90,255,170': 'accent',
}
FILE_TRIPLE = { 'SystemHeader.tsx': { '0,255,102': 'accent', '0, 255, 102': 'accent' } }

JS_HEX = {
  '#04040a':'bgDeep','#030308':'bgDeep','#030304':'bgDeep','#050508':'bgDeep',
  '#5c6b64':'textMuted','#3d4a42':'textFaint','#1a1a24':'grid','#0b0b12':'panel2',
  '#14141c':'inset','#00e5ff':'cyan','#8fa39a':'zinc','#ff1133':'down',
  '#b8c9c0':'textDim','#7d8f86':'zinc','#2a2a38':'border4','#2a2a34':'border4',
  '#12121a':'panel2','#0a0a12':'panel2','#0a0a10':'panel2','#06060c':'header',
  '#020202':'bg','#08080c':'panel','#00ff66':'accent','#ff8800':'warn',
  '#9d00ff':'violet','#d8ffe9':'text','#c9ffe0':'accentSoft','#ffe9c9':'warnSoft',
  '#ffd9a8':'warnSoft','#ffe1e4':'downSoft','#ffb3bd':'downSoft','#06060a':'header',
  '#05050b':'inset','#15151f':'border3','#1c1c28':'border2','#16161f':'border3',
  '#c98a3d':'warnDeep','#8ff0c8':'accentSoft','#b97a2a':'warnDeep','#22262c':'border4',
  '#4d2c08':'warnDeep','#4d0a14':'downDeep','#0f3d22':'upDeep','#07070c':'header',
  '#9aa8a0':'zinc','#9fb3a8':'zinc',
}
CLS_HEX = {
  'bg-[#04040a]':'bg-kbg-deep','bg-[#0b0b12]':'bg-kpanel2','bg-[#05050b]':'bg-kinset',
  'bg-[#08080c]':'bg-kpanel','bg-[#020202]':'bg-kbg','border-[#1a1a24]':'border-kborder',
  'bg-[#1a1a24]':'bg-kborder','border-[#15151f]':'border-kborder3',
  'bg-[#15151f]':'bg-kborder3','border-[#0d0d14]':'border-kborder',
  'border-[#00e5ff]':'border-kaccent-strong','bg-[#06060a]':'bg-kheader',
  'bg-[#2a2a38]':'bg-kborder4','border-[#14141c]':'border-kinset',
  'bg-[#030308]':'bg-kbg-deep','bg-[#050509]':'bg-kbg-deep','bg-[#14141c]':'bg-kinset',
  'bg-[#06060c]':'bg-kheader','border-[#101018]':'border-kinset','bg-[#0a0a12]':'bg-kpanel2',
  'border-[#12121a]':'border-kpanel2','bg-[#0a0a10]':'bg-kpanel2','border-[#10101a]':'border-kinset',
  'bg-[#030304]':'bg-kbg-deep','bg-[#07070c]':'bg-kheader',
}
JSX_ATTR = re.compile(r'((?:fill|stroke|stopColor|color)=(["\']))(#[0-9a-fA-F]{6})\2')

HEXA = """
/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}
"""

CRASH_GRAD = "'linear-gradient(180deg, rgba(255,17,51,0.5), rgba(255,17,51,0.22))'"
CRASH_GRAD_NEW = "`linear-gradient(180deg, ${hexA(KT('down'), 0.5)}, ${hexA(KT('down'), 0.22)})`"

files = sorted(glob.glob('src/components/london/*.tsx'))
changed = []
for f in files:
    name = os.path.basename(f)
    if name == 'shared.tsx':
        continue
    src = open(f).read(); orig = src

    for k in sorted(CLS_HEX, key=len, reverse=True):
        src = src.replace(k, CLS_HEX[k])

    trips = dict(TRIPLE); trips.update(FILE_TRIPLE.get(name, {}))
    for trip, tok in trips.items():
        src = src.replace("'rgba(" + trip + ",", "__Q__" + tok + "__")
        src = src.replace('"rgba(' + trip + ",", "__DQ__" + tok + "__")
    src = re.sub(r"__Q__(\w+)__([0-9.]+)\)'", r"hexA(KT('\1'), \2)", src)
    src = re.sub(r'__DQ__(\w+)__([0-9.]+)\)"', r"hexA(KT('\1'), \2)", src)

    for hx, tok in JS_HEX.items():
        src = src.replace("'" + hx + "'", "KT('" + tok + "')")
        src = src.replace('"' + hx + '"', 'KT("' + tok + '")')

    def attr_sub(m):
        attr = m.group(1).split('=')[0]
        hexv = m.group(3).lower()
        return attr + "={KT('" + JS_HEX.get(hexv, 'text') + "')}"
    src = JSX_ATTR.sub(attr_sub, src)

    src = src.replace(CRASH_GRAD, CRASH_GRAD_NEW)
    src = src.replace("'1px solid rgba(0,255,102,0.5)'", "`1px solid ${hexA(KT('accent'), 0.5)}`")
    src = src.replace("'1px solid rgba(0, 255, 102, 0.5)'", "`1px solid ${hexA(KT('accent'), 0.5)}`")
    src = src.replace('`rgba(255,17,51,${alpha * 1.6})`', "rgbaDyn('down', alpha * 1.6)")
    src = src.replace('`rgba(255,17,51,${alpha * 0.5})`', "rgbaDyn('down', alpha * 0.5)")
    if 'rgbaDyn(' in src and 'function rgbaDyn' not in src:
        src += "\nfunction rgbaDyn(tok: string, a: number): string {\n  const hex = KT(tok as never)\n  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)\n  return `rgba(${r},${g},${b},${a})`\n}\n"

    if src != orig:
        if "from '@/lib/theme'" not in src:
            lines = src.split('\n')
            last_import = max(i for i, l in enumerate(lines) if l.strip().startswith('import '))
            lines.insert(last_import + 1, "import { KT } from '@/lib/theme';")
            src = '\n'.join(lines)
        if 'hexA(' in src and 'function hexA' not in src:
            idx = src.find("import { KT } from '@/lib/theme';")
            end = src.find('\n', idx) + 1
            src = src[:end] + HEXA + src[end:]
        open(f, 'w').write(src); changed.append(name)
print('clean pass done:', len(changed))
print(changed)
