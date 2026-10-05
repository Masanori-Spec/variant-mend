#!/usr/bin/env python3
"""Freeze only the reviewed source allowlist, never broad workspace content."""
from pathlib import Path
import hashlib,json,shutil,sys,zipfile
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT.parent/'variant-mend-output'
FILES=[
 '.github/workflows/verify.yml','.gitignore','README.md','package.json','package-lock.json','index.html',
 'src/core.mjs','src/app.mjs','src/style.css','src/sample.mjs',
 'scripts/build.mjs','scripts/cli.mjs','scripts/freeze.py','scripts/test.mjs',
 'fixtures/product.usda','tests/core.test.mjs','tests/cli.test.mjs','tests/runner.test.mjs','tests/oracle.py','tests/native_verify.py','tests/browser.mjs',
 'docs/RESEARCH.md','docs/VERIFICATION.md','docs/DISTRIBUTION.md',
 'dist/variant-mend.html','artifacts/repaired.usda','artifacts/rename-receipt.json',
 'artifacts/oracle-report.json','artifacts/native-report.json','artifacts/unit-test.log',
]
assert len(FILES)==len(set(FILES))
OUT.mkdir(parents=True,exist_ok=True)
entries=[]
for name in sorted(FILES):
 p=ROOT/name
 assert not p.is_symlink() and p.is_file(),name
 assert p.resolve().is_relative_to(ROOT),name
 data=p.read_bytes()
 entries.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
manifest={'schema':'variant-mend-source-manifest/1','files':entries,'fileCount':len(entries),'scope':'Original runtime, synthetic fixtures, tests and selected generated text evidence only','browserVerification':'Hosted gate authored; status is in docs/VERIFICATION.md'}
manifest_bytes=(json.dumps(manifest,indent=2)+'\n').encode()
(OUT/'source-manifest.json').write_bytes(manifest_bytes)
def add(z,name,data):
 info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,data)
with zipfile.ZipFile(OUT/'variant-mend-source.zip','w') as z:
 for item in entries:add(z,'variant-mend/'+item['path'],(ROOT/item['path']).read_bytes())
 add(z,'variant-mend/source-manifest.json',manifest_bytes)
shutil.copyfile(ROOT/'dist/variant-mend.html',OUT/'variant-mend.html')
with zipfile.ZipFile(OUT/'variant-mend-example.zip','w') as z:
 for name in ['fixtures/product.usda','artifacts/repaired.usda','artifacts/rename-receipt.json']:
  add(z,Path(name).name,(ROOT/name).read_bytes())
summary={'files':[{ 'name':n,'bytes':(OUT/n).stat().st_size,'sha256':hashlib.sha256((OUT/n).read_bytes()).hexdigest()} for n in ['variant-mend-source.zip','variant-mend.html','variant-mend-example.zip','source-manifest.json']]}
(OUT/'freeze-report.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
