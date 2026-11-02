import re, os, sys

root = '/home/lucas-hermes/bet-with-friends'
inv = {}
for dirpath, dirs, files in os.walk(os.path.join(root, 'src')):
    for fn in sorted(files):
        if not fn.endswith('.svelte'):
            continue
        p = os.path.join(dirpath, fn)
        src = open(p).read()
        body = re.sub(r'<script[^>]*>.*?</script>', '', src, flags=re.S)
        body = re.sub(r'<style[^>]*>.*?</style>', '', body, flags=re.S)
        rel = os.path.relpath(p, root)
        out = []
        for line in body.split('\n'):
            for m in re.finditer(r'>([^<>{}]*[A-Za-z\u00c0-\u024f][^<>{}]*)<', line):
                s = m.group(1).strip()
                if s and not re.fullmatch(r'[\s\d\W]*', s):
                    out.append(('text', s))
            for m in re.finditer(
                r'(placeholder|aria-label|title|alt|label|value|headline)\s*=\s*"([^"]*[A-Za-z\u00c0-\u024f][^"]*)"', line
            ):
                if '{' not in m.group(2):
                    out.append((m.group(1), m.group(2)))
        if out:
            inv[rel] = out
for rel, items in sorted(inv.items()):
    print(f'== {rel}')
    for kind, s in items:
        print(f'   [{kind}] {s}')
print('TOTAL FILES', len(inv), 'TOTAL STRINGS', sum(len(v) for v in inv.values()))
