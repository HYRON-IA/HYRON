import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHumorSettings, humorInstructions } from '../src/hyron-humor.ts';
test('valida limites e ignora valores maliciosos',()=>{
 assert.deepEqual(parseHumorSettings({level:500,frequency:'3',teasing:'true'}),{level:2,frequency:1,teasing:false});
 assert.deepEqual(parseHumorSettings({level:5,frequency:3,teasing:true}),{level:5,frequency:3,teasing:true});
});
test('modo monge é sério, nível máximo mantém limites',()=>{
 assert.match(humorInstructions({level:0}),/Modo serio/);
 assert.match(humorInstructions({level:5,frequency:3,teasing:true}),/provocacoes leves/);
});
