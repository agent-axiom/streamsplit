"""Render an optional 20-second demo GIF from the actual short-demo evidence.

Requires Python + Pillow only for regenerating the image, not for library use.
Run `npm run build && python3 scripts/render-demo.py` from this repository.
"""
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
result = subprocess.run(['node', 'examples/demo-short.mjs', '--json'], cwd=ROOT, check=True, capture_output=True, text=True)
evidence = json.loads(result.stdout)
assert evidence['fixedReplay'] and evidence['chunkSizes'] == [13, 7]
assert evidence['baseline'] != evidence['actual']

font_dir = Path('/usr/share/fonts/truetype/dejavu')
regular = str(font_dir / 'DejaVuSansMono.ttf')
bold = str(font_dir / 'DejaVuSansMono-Bold.ttf')
font = lambda size, heavy=False: ImageFont.truetype(bold if heavy else regular, size)
background = '#0b1220'
foreground = '#e8edf4'
muted = '#8d9db1'
green = '#6be6a2'
red = '#ff8080'
blue = '#75baff'
actual = json.dumps(evidence['actual'][0]['data'], ensure_ascii=True)
scenes = [
    ('01', 'WHOLE BUFFER', 'PASS', green, [
        f"{evidence['inputBytes']} bytes in one write",
        'UTF-8: F0 9F 8C 8D',
        'One complete Unicode character: U+1F30D',
        'The happy-path test passes.',
    ]),
    ('02', 'SPLIT INSIDE UTF-8', 'FAIL', red, [
        f"Reduced chunk sizes: {evidence['chunkSizes']}",
        'Same bytes. Different emitted event.',
        actual,
        'Exact byte fixture saved in the failure.',
    ]),
    ('03', 'ONE-LINE DECODER FIX', 'FIX', blue, [
        '- decoder.decode(chunk)',
        '+ decoder.decode(chunk, { stream: true })',
        'Keep one decoder per fresh parser.',
        'Flush it at end-of-stream.',
    ]),
    ('04', 'REPLAY, THEN CHECK MORE SPLITS', 'PASS', green, [
        'Saved [13, 7] fixture: PASS',
        f"{evidence['schedulesChecked']} tested schedules: PASS",
        'Single cuts + bytewise + seeded reads',
        'Zero runtime dependencies.',
    ]),
]
frames = []
for step, title, state, accent, lines in scenes:
    image = Image.new('RGB', (1440, 810), background)
    draw = ImageDraw.Draw(image)
    draw.text((68, 48), 'StreamSplit', font=font(42, True), fill=foreground)
    draw.text((70, 111), 'One boundary. A real UTF-8 bug.', font=font(23), fill=muted)
    draw.rounded_rectangle((68, 198, 1372, 661), radius=24, fill='#121e30', outline='#253449', width=2)
    draw.text((106, 232), f'{step} / 04', font=font(19), fill=muted)
    draw.text((106, 286), title, font=font(30, True), fill=foreground)
    draw.rounded_rectangle((1201, 223, 1328, 273), radius=12, fill=accent)
    draw.text((1221, 231), state, font=font(26, True), fill=background)
    for index, line in enumerate(lines):
        draw.text((108, 370 + index * 55), line, font=font(24), fill=accent if index == 0 else foreground)
    draw.text((70, 706), '$ npm run demo:short', font=font(27), fill=green)
    draw.text((70, 754), 'Synthetic fixture | Recorded from real test output | github.com/agent-axiom/streamsplit', font=font(17), fill=muted)
    frames.append(image)
output = ROOT / 'docs' / 'assets' / 'demo.gif'
frames[0].save(output, save_all=True, append_images=frames[1:], duration=[5000] * 4, loop=0, optimize=True)
frames[0].save(ROOT / 'docs' / 'assets' / 'demo-poster.png')
print(f'{output.relative_to(ROOT)}: 4 frames, 20 seconds, {output.stat().st_size} bytes')
