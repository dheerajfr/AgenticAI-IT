with open('apps/shell/dependencies.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(500, 830):
    line = lines[i]
    if '${' in line:
        print(f'{i+1}: {line.strip()}')
