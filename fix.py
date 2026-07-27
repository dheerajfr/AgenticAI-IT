import os
file_path = r'c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell\plan-schedule.js'
with open(file_path, 'r', encoding='utf-8') as f:
    c = f.read()

# Fix the two string literal replacements
c = c.replace("|| '${new Date().toISOString().split('T')[0]}';", "|| new Date().toISOString().split('T')[0];")
c = c.replace("|| '${new Date().toISOString().split('T')[0]}'}", "|| new Date().toISOString().split('T')[0]}")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Fixed JS replacements in plan-schedule.js')
