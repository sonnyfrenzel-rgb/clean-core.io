"""Prüft lokale Paketintegrität. Keine externe Signatur und kein Freigabegate."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parents[1]
manifest=root/'MANIFEST.sha256.json'
if not manifest.exists():
    print('MANIFEST.sha256.json fehlt',file=sys.stderr);sys.exit(1)
data=json.loads(manifest.read_text())
fail=[]
for e in data['files']:
    p=root/e['path']
    if not p.is_file():fail.append({'path':e['path'],'error':'missing'});continue
    if hashlib.sha256(p.read_bytes()).hexdigest()!=e['sha256']:fail.append({'path':e['path'],'error':'hash_mismatch'})
print(json.dumps({'checked':len(data['files']),'errors':fail,'passed':not fail,'signature_verified':False,'scope':'local package integrity only'},indent=2))
sys.exit(1 if fail else 0)
