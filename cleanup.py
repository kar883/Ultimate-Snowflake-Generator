from pathlib import Path

files = [
    'src/App.tsx',
    'src/components/ControlPanel.tsx',
    'src/components/Snowflake3D.tsx',
    'src/components/SnowflakePreview.tsx',
]
for fp in files:
    p = Path(fp)
    if not p.exists():
        continue
    lines = p.read_text(encoding='utf-8').splitlines()
    new = []
    for l in lines:
        if ('SLOT-DISABLED' in l or 'DISABLED:' in l or 'DISABLED -' in l or 'DISABLED' in l) and '//' in l:
            continue
        new.append(l)
    p.write_text('\n'.join(new) + '\n', encoding='utf-8')
print('cleaned files')
