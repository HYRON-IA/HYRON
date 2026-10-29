"""Gera manifest.json para o checkpoint informado sem carregar/executar o modelo."""
from pathlib import Path
import hashlib
import json
import sys

EXPECTED_HASH = 'bbd2d5cac17d769ee9e5513178b49b704145f2fef05c77a739bfefef3b27eef1'

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for part in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(part)
    return digest.hexdigest()

if len(sys.argv) != 2:
    raise SystemExit('Uso: py -3 tools/criar_manifest_alastor.py "C:\\...\\Alastor-rvc2"')
folder = Path(sys.argv[1]).expanduser().resolve()
model = folder / 'alastorpilot.pth'
if not model.is_file():
    raise SystemExit(f'Modelo nao encontrado: {model}')
actual = sha256(model)
if actual != EXPECTED_HASH:
    raise SystemExit(f'SHA-256 inesperado: {actual}; esperado: {EXPECTED_HASH}')
manifest = {
    'schemaVersion': 1,
    'name': 'Alastor Pilot',
    'description': 'Modelo RVC v2 40k com F0; uso sujeito a autorizacao do titular/licenca.',
    'language': 'en-US',
    'engineType': 'rvc',
    'architecture': 'RVC-v2-40k',
    'sampleRate': 40000,
    'compatibility': ['windows'],
    'model': {'file': model.name, 'sha256': actual},
}
target = folder / 'manifest.json'
if target.exists():
    raise SystemExit(f'O manifesto ja existe e nao sera sobrescrito: {target}')
target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Manifesto gerado: {target}')
print('Nenhum checkpoint foi carregado; nenhum upload foi executado.')
