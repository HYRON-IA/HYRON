import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedHyronIdentity } from '../src/hyron-identity.ts';

test('pergunta completa sobre HYRON gera identidade baseada em metadados reais', () => {
 const r = verifiedHyronIdentity('Quem é você, quem desenvolveu você e qual é a diferença entre HYRON e o modelo de IA que está respondendo?', 'openrouter','dots-studio/dots-3-note-preview:free');
 assert.ok(r?.includes('Sou HYRON'));
 assert.ok(r?.includes('dots-studio/dots-3-note-preview:free'));
 assert.ok(r?.includes('openrouter'));
 assert.ok(r?.includes('não um modelo de linguagem da Z.ai'));
});
test('pergunta simples identifica o assistente', () => {
 assert.ok(verifiedHyronIdentity('Quem é você?', 'gemini', 'gemini-3.5-flash-lite'));
});
test('pergunta sobre autoria do HYRON nao atribui autor inventado', () => {
 const r=verifiedHyronIdentity('Quem desenvolveu o HYRON?', 'cloudflare-ai','@cf/zai-org/glm-4.7-flash');
 assert.ok(r?.includes('não vou inventar essa autoria'));
 assert.ok(r?.includes('@cf/zai-org/glm-4.7-flash'));
});
test('pergunta sobre o modelo recebe dados do backend', () => {
 assert.ok(verifiedHyronIdentity('Qual modelo está respondendo?', 'openrouter','x/y:free')?.includes('x/y:free'));
});
test('perguntas normais nao sao interceptadas', () => {
 for(const question of ['Responda exatamente: HYRON Alfa Seis','Quem desenvolveu GLM?','Quem é Alan Turing?','Explique PHP e SQL', 'Qual o melhor modelo para escrever código?']){
  assert.equal(verifiedHyronIdentity(question, 'openrouter', 'x/y:free'),null, question);
 }
});
test('texto muito longo ou com anexos nao e interceptado', () => {
 assert.equal(verifiedHyronIdentity('Quem é você?\n\nOs anexos a seguir sao dados...', 'gemini','x'),null);
 assert.equal(verifiedHyronIdentity('Quem é você?'+'.'.repeat(500), 'gemini','x'),null);
});
test('metadados com caracteres nao seguros sao normalizados', () => {
 const r=verifiedHyronIdentity('Você é da Z.ai?', 'bad\nprovider','bad\nmodel');
 assert.ok(r?.includes('provedor nao identificado'));
 assert.ok(r?.includes('modelo nao identificado'));
 assert.ok(!r?.includes('bad\n'));
});
