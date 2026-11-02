import re, os

root = '/home/lucas-hermes/bet-with-friends'
UI_WORDS = re.compile(
    r"\b(le|la|les|des|une|un|vous|votre|vos|nous|notre|est|sont|avec|pour|dans|pour|pas|plus|"
    r"the|and|for|you|your|with|this|that|are|is|not|no|yes|save|cancel|delete|error|"
    r"mot|passe|groupe|pari|jury|créer|modifier|supprimer|sauvegarder|confirmer|annuler|"
    r"erreur|succès|chargement|invitation|membre|classement|ardoise|gage|verdict)\b",
    re.I,
)
STR = re.compile(r"""(?<![\w-])'([^'\n]{2,80})'|"([^"\n]{2,80})"|`([^`\n]{2,120})`""")

for dirpath, dirs, files in os.walk(os.path.join(root, 'src')):
    for fn in sorted(files):
        if not (fn.endswith('.svelte') or fn.endswith('.ts')):
            continue
        p = os.path.join(dirpath, fn)
        rel = os.path.relpath(p, root)
        if 'i18n' in rel or 'landing/content' in rel or 'database.types' in rel:
            continue
        src = open(p).read()
        if fn.endswith('.svelte'):
            m = re.search(r'<script[^>]*>(.*?)</script>', src, flags=re.S)
            src = m.group(1) if m else ''
        out = []
        for line in src.split('\n'):
            st = line.strip()
            if st.startswith(('import ', 'export ', 'from ', '*', '//')):
                continue
            if 'class' in line and ('"' in line or "'" in line):
                pass
            for sm in STR.finditer(line):
                s = next(g for g in sm.groups() if g is not None)
                if UI_WORDS.search(s) or re.search(r'[àâçéèêëîïôûùüÿœ]', s):
                    if re.match(r'^[\w./$-]+$', s):  # identifiers/paths
                        continue
                    out.append(s)
        if out:
            print(f'== {rel}')
            for s in out:
                print('   ', s.replace('\n', ' '))
