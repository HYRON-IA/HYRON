import { test } from "node:test";
import { equal, ok } from "node:assert/strict";
import { validateVoiceRegistration } from "../src/voice-library.ts";

const hash = "a".repeat(64);

function rvc(overrides: Record<string, unknown> = {}) {
  return {
    name: "Voz local",
    kind: "rvc",
    description: "Modelo RVC validado localmente",
    language: "pt-BR",
    modelName: "voice.pth",
    modelBytes: 1024,
    supportName: "voice.index",
    supportBytes: 1024,
    architecture: "RVC-v1-40k",
    sampleRate: 40000,
    modelSha256: hash,
    supportSha256: hash,
    compatibility: ["windows"],
    previewName: "preview.wav",
    ...overrides,
  };
}

test("valid voice metadata is normalized without accepting binary contents", () => {
  const result = validateVoiceRegistration(rvc({ name: "  Voz local  " }));
  ok(result);
  equal(result.name, "Voz local");
  equal(result.modelSha256, hash);
  equal(result.compatibility[0], "windows");
});

test("invalid hashes, filenames, architecture and compatibility are rejected", () => {
  equal(validateVoiceRegistration(rvc({ modelSha256: "not-a-hash" })), null);
  equal(validateVoiceRegistration(rvc({ modelName: "../voice.pth" })), null);
  equal(validateVoiceRegistration(rvc({ supportName: "C:\\voice.index" })), null);
  equal(validateVoiceRegistration(rvc({ architecture: "" })), null);
  equal(validateVoiceRegistration(rvc({ compatibility: ["android", "android"] })), null);
  equal(validateVoiceRegistration(rvc({ compatibility: ["linux"] })), null);
});

test("Piper requires a matching ONNX metadata file and SHA-256 hashes", () => {
  const value = {
    name: "Piper PT",
    kind: "piper",
    language: "pt-BR",
    modelName: "pt_BR.onnx",
    supportName: "pt_BR.onnx.json",
    modelBytes: 1024,
    supportBytes: 128,
    architecture: "Piper",
    sampleRate: 22050,
    modelSha256: hash,
    supportSha256: hash,
    compatibility: ["windows", "web"],
  };
  ok(validateVoiceRegistration(value));
  equal(validateVoiceRegistration({ ...value, supportName: "outside.json" }), null);
});

test("RVC can be registered without an optional index file", () => {
  const value = rvc({
    supportName: "",
    supportBytes: 0,
    supportSha256: null,
  });
  ok(validateVoiceRegistration(value));
});

test("RVC v2 40k registration is accepted but invalid combinations are rejected", () => {
  ok(validateVoiceRegistration(rvc({ architecture: "RVC-v2-40k" })));
  equal(validateVoiceRegistration(rvc({ architecture: "RVC-v2-40k", sampleRate: 48000 })), null);
  equal(validateVoiceRegistration(rvc({ architecture: "RVC-v2-48k", sampleRate: 48000 })), null);
  equal(validateVoiceRegistration(rvc({ architecture: "RVC-v1-40k", sampleRate: 48000 })), null);
});
