import re,glob
for f in glob.glob('e2e/*.ts')+glob.glob('e2e-container/*.ts'):
    s=open(f).read(); lines=s.split('\n')
    # crude: for each line containing evaluate( / waitForFunction( / addInitScript( find matching paren range
    for m in re.finditer(r'(evaluate|evaluateAll|\$eval|\$\$eval|evaluateHandle|waitForFunction|addInitScript)\(',s):
        i=m.end(); depth=1
        while i<len(s) and depth:
            c=s[i]; depth+= (c=='(')-(c==')'); i+=1
        seg=s[m.end():i]
        if 'requireValue(' in seg:
            ln=s[:m.start()].count('\n')+1
            print(f,ln,[s[:m.end()].count('\n')+seg[:k.start()].count('\n')+1 for k in re.finditer('requireValue\\(',seg)])
