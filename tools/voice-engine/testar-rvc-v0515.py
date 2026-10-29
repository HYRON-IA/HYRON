"""HYRON v0.5.15 / fase 1: primeiro teste REAL Piper -> RVC no Windows.

Sem servidor web, sem treinamento e sem carregar checkpoints no processo orquestrador.
O carregamento ocorre apenas no CLI RVC isolado, com hardening obrigatório.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime

DEFAULT_TEXT = "Olá, eu sou o HYRON. Ideias, código e boas conversas."


def read_env(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    variables = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        variables[key.strip()] = value.strip().strip('"').strip("'")
    return variables


def local_path(value: str, base: Path) -> Path:
    path = Path(value)
    return (path if path.is_absolute() else base / path).resolve()


def run(args: list[str], *, cwd: Path, timeout: int, stdin: bytes | None = None, env: dict[str, str] | None = None) -> None:
    try:
        result = subprocess.run(args, input=stdin, cwd=str(cwd), env=env, timeout=timeout,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Processo excedeu {timeout} segundos") from exc
    if result.returncode != 0:
        # Não despejar logs inteiros contendo caminhos privados ou detalhes do modelo.
        message = result.stderr.decode("utf-8", errors="replace")[-1800:]
        raise RuntimeError(f"Processo falhou (exit={result.returncode}). Detalhes: {message}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Teste local e explícito Piper -> RVC (v0.5.15).")
    parser.add_argument("--model-pth", type=Path, required=True)
    parser.add_argument("--model-source", required=True, help="Origem verificável do checkpoint")
    parser.add_argument("--model-license", required=True, help="Termos de uso verificados")
    parser.add_argument("--authorization-evidence", required=True, help="Descrição da autorização aplicável")
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--input-wav", type=Path, help="Opcional: WAV Piper já gerado para evitar nova síntese")
    parser.add_argument("--piper-executable", type=Path)
    parser.add_argument("--piper-model", type=Path)
    parser.add_argument("--speaker-id", type=int, default=0)
    parser.add_argument("--pitch", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=240)
    args = parser.parse_args(argv)
    project = Path(__file__).resolve().parents[2]
    tools = project / "tools"
    voice_engine = tools / "voice-engine"
    rvc = tools / "rvc-runtime"
    python = rvc / ".venv" / "Scripts" / "python.exe"
    upstream = rvc / "upstream"
    conversion = rvc / "run_conversion.py"
    checkpoint = args.model_pth.resolve(strict=True)
    if checkpoint.suffix.lower() != ".pth" or not checkpoint.is_file():
        raise ValueError("Modelo deve ser um arquivo .pth local")
    for label, value in (("Origem", args.model_source), ("Licença", args.model_license), ("Autorização", args.authorization_evidence)):
        if not value.strip() or value.strip().lower() in {"desconhecido", "unknown", "none", "n/a"}:
            raise ValueError(f"{label}: informe documentação real antes de converter")
    if not python.is_file() or not conversion.is_file() or not upstream.is_dir():
        raise FileNotFoundError("Runtime RVC isolado indisponível. Execute a preparação original da v0.5.10.")
    if not (upstream / "assets" / "hubert_base" / "config.json").is_file():
        raise FileNotFoundError("Assets HuBERT locais não encontrados no runtime RVC")
    if not (upstream / "assets" / "rmvpe" / "rmvpe.pt").is_file():
        raise FileNotFoundError("Asset RMVPE local não encontrado")
    if args.timeout < 30 or args.timeout > 1200:
        raise ValueError("Timeout permitido: de 30 a 1200 segundos")
    if not args.text.strip() or len(args.text) > 500:
        raise ValueError("Texto deve conter de 1 a 500 caracteres")

    output_dir = rvc / "output" / ("hyron-v0515-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
    output_dir.mkdir(parents=True, exist_ok=False)
    source_wav = output_dir / "piper-original.wav"
    converted_wav = output_dir / "hyron-rvc.wav"
    report = output_dir / "conversion-report.json"
    env = os.environ.copy()
    env.update({"TORCH_FORCE_WEIGHTS_ONLY_LOAD": "1", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"})

    if args.input_wav:
        source_wav = args.input_wav.resolve(strict=True)
        if source_wav.suffix.lower() != ".wav":
            raise ValueError("Entrada precisa ser .wav PCM")
        print("Usando WAV previamente gerado (não sintetizando texto nesta execução).")
    else:
        settings = read_env(voice_engine / ".env")
        piper_exe_raw = str(args.piper_executable or settings.get("PIPER_EXECUTABLE", ""))
        piper_model_raw = str(args.piper_model or settings.get("PIPER_MODEL_PATH", ""))
        if not piper_exe_raw or not piper_model_raw:
            raise ValueError("Defina PIPER_EXECUTABLE e PIPER_MODEL_PATH em tools/voice-engine/.env ou passe --piper-executable e --piper-model")
        executable = local_path(piper_exe_raw, voice_engine)
        model = local_path(piper_model_raw, voice_engine)
        if not executable.is_file() or not model.is_file() or not Path(str(model) + ".json").is_file():
            raise FileNotFoundError("Piper executable, ONNX ou ONNX.json não encontrado")
        print("[1/2] Piper: gerando WAV de teste...")
        run([str(executable), "--model", str(model), "--output_file", str(source_wav)],
            stdin=(args.text.strip() + "\n").encode("utf-8"), cwd=voice_engine, timeout=90, env=env)
        if not source_wav.is_file() or source_wav.stat().st_size <= 44:
            raise RuntimeError("Piper não produziu WAV válido")

    print("[2/2] RVC: iniciando conversão restrita (sem índice FAISS)...")
    try:
        run([
            str(python), str(conversion),
            "--runtime-path", str(upstream),
            "--input-wav", str(source_wav),
            "--model-pth", str(checkpoint),
            "--output-wav", str(converted_wav),
            "--report-path", str(report),
            "--model-source", args.model_source,
            "--model-license", args.model_license,
            "--authorization-evidence", args.authorization_evidence,
            "--speaker-id", str(args.speaker_id),
            "--pitch", str(args.pitch),
            "--f0-method", "rmvpe",
        ], cwd=rvc, timeout=args.timeout, env=env)
    except Exception:
        print("Conversão não concluída. Nenhum arquivo será apresentado como saída válida.", file=sys.stderr)
        raise
    evidence = json.loads(report.read_text(encoding="utf-8"))
    if evidence.get("status") != "inference_succeeded" or evidence.get("output", {}).get("path") != str(converted_wav):
        raise RuntimeError("Relatório não confirmou a saída RVC")
    print("\nPASS: primeira conversão RVC registrada.")
    print("WAV convertido:", converted_wav)
    print("Relatório:", report)
    print("Ouça e compare com o WAV Piper original. Qualidade não validada automaticamente.")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"HYRON v0.5.15: {error}", file=sys.stderr)
        raise SystemExit(1)
