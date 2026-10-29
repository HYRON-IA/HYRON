import { createHash } from "node:crypto";
import { test } from "node:test";
import { equal, ok, rejects } from "node:assert/strict";
import { validateVoicePackage } from "../public/voice-package.js";

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function file(name, bytes, type = "application/octet-stream") {
  return new File([bytes], name, { type });
}

function validPiperPackage() {
  const modelBytes = new Uint8Array(1024).fill(7);
  const configBytes = new TextEncoder().encode(
    JSON.stringify({ audio: { sample_rate: 22050 }, phoneme_type: "espeak" }),
  );
  const model = file("voice.onnx", modelBytes);
  const support = file("voice.onnx.json", configBytes, "application/json");
  const manifest = {
    schemaVersion: 1,
    name: "Voz Piper",
    description: "Modelo local",
    language: "pt-BR",
    engineType: "piper",
    architecture: "Piper",
    sampleRate: 22050,
    compatibility: ["windows", "web"],
    model: { file: model.name, sha256: hash(modelBytes) },
    support: { file: support.name, sha256: hash(configBytes) },
  };
  return {
    manifestFile: file("manifest.json", JSON.stringify(manifest), "application/json"),
    model,
    support,
    manifest,
  };
}

test("validates model and Piper sidecar hashes without loading either file", async () => {
  const pkg = validPiperPackage();
  const result = await validateVoicePackage(pkg.manifestFile, pkg.model, pkg.support, null);
  equal(result.registration.kind, "piper");
  equal(result.registration.sampleRate, 22050);
  equal(result.registration.modelSha256, pkg.manifest.model.sha256);
});

test("rejects missing, traversal, incompatible and corrupt package files", async () => {
  const pkg = validPiperPackage();
  await rejects(() => validateVoicePackage(pkg.manifestFile, null, pkg.support, null));
  const traversal = { ...pkg.manifest, model: { ...pkg.manifest.model, file: "../voice.onnx" } };
  await rejects(() => validateVoicePackage(
    file("manifest.json", JSON.stringify(traversal)),
    pkg.model,
    pkg.support,
    null,
  ));
  const badConfigName = file("other.onnx.json", pkg.support);
  await rejects(() => validateVoicePackage(pkg.manifestFile, pkg.model, badConfigName, null));
  const corruptModel = file("voice.onnx", new Uint8Array(1024).fill(8));
  await rejects(() => validateVoicePackage(pkg.manifestFile, corruptModel, pkg.support, null));
  await rejects(() => validateVoicePackage(
    file("other.json", JSON.stringify(pkg.manifest)),
    pkg.model,
    pkg.support,
    null,
  ));
});

test("accepts an RVC v1 40k checkpoint without an index file", async () => {
  const modelBytes = new Uint8Array(1024).fill(9);
  const manifest = {
    schemaVersion: 1,
    name: "RVC local",
    language: "pt-BR",
    engineType: "rvc",
    architecture: "RVC-v1-40k",
    sampleRate: 40000,
    compatibility: ["windows"],
    model: { file: "voice.pth", sha256: hash(modelBytes) },
  };
  const result = await validateVoicePackage(
    file("manifest.json", JSON.stringify(manifest)),
    file("voice.pth", modelBytes),
    null,
    null,
  );
  ok(result.registration);
  equal(result.registration.supportName, "");
});

test("rejects unsupported RVC architecture", async () => {
  const bytes = new Uint8Array(1024).fill(4);
  const manifest = {
    schemaVersion: 1,
    name: "RVC",
    language: "pt-BR",
    engineType: "rvc",
    architecture: "RVC-v2-48k",
    sampleRate: 48000,
    compatibility: ["windows"],
    model: { file: "voice.pth", sha256: hash(bytes) },
  };
  await rejects(() => validateVoicePackage(
    file("manifest.json", JSON.stringify(manifest)),
    file("voice.pth", bytes),
    null,
    null,
  ));
});

test("rejects a WAV preview with a checksum that does not match the manifest", async () => {
  const modelBytes = new Uint8Array(1024).fill(5);
  const previewBytes = new Uint8Array(16);
  previewBytes.set(new TextEncoder().encode("RIFF"), 0);
  previewBytes.set(new TextEncoder().encode("WAVE"), 8);
  const preview = file("preview.wav", previewBytes, "audio/wav");
  const manifest = {
    schemaVersion: 1,
    name: "RVC",
    language: "pt-BR",
    engineType: "rvc",
    architecture: "RVC-v1-40k",
    sampleRate: 40000,
    compatibility: ["windows"],
    model: { file: "voice.pth", sha256: hash(modelBytes) },
    preview: { file: preview.name, sha256: "b".repeat(64) },
  };
  await rejects(() => validateVoicePackage(
    file("manifest.json", JSON.stringify(manifest)),
    file("voice.pth", modelBytes),
    null,
    preview,
  ));
});

test("accepts RVC v2 40k metadata without loading a checkpoint", async () => {
  const modelBytes = new Uint8Array(1024).fill(10);
  const manifest = {
    schemaVersion: 1, name: "Alastor Pilot", language: "en-US",
    engineType: "rvc", architecture: "RVC-v2-40k", sampleRate: 40000,
    compatibility: ["windows"],
    model: { file: "alastorpilot.pth", sha256: hash(modelBytes) },
  };
  const result = await validateVoicePackage(
    file("manifest.json", JSON.stringify(manifest)),
    file("alastorpilot.pth", modelBytes), null, null
  );
  equal(result.registration.architecture, "RVC-v2-40k");
  equal(result.registration.supportName, "");
});

test("rejects RVC v2 manifest with unsupported sample rate", async () => {
  const bytes = new Uint8Array(1024).fill(1);
  const manifest = {
    schemaVersion: 1, name: "Voice", language: "en-US", engineType: "rvc",
    architecture: "RVC-v2-40k", sampleRate: 48000, compatibility: ["windows"],
    model: { file: "voice.pth", sha256: hash(bytes) },
  };
  await rejects(() => validateVoicePackage(file("manifest.json", JSON.stringify(manifest)), file("voice.pth", bytes), null, null));
});
