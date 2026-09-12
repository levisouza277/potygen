const assert = require('node:assert/strict');
const { resolveIntent } = require('../src/backend/chatbot-floating.js');

const cases = [
  ['cadastrar animal', 'openAnimalRegister'],
  ['abrir dashboard', 'navigate:dashboard.html'],
  ['quero ver a gestão de animais', 'navigate:gestao-animais.html'],
  ['cadastrar fazenda', 'openFarmRegister'],
  ['olá', 'greeting']
];

for (const [input, expected] of cases) {
  const result = resolveIntent(input);
  assert.ok(result, `Esperava ação para: ${input}`);
  assert.equal(result, expected, `Entrada: ${input} -> ${result} (esperado: ${expected})`);
}

console.log('Testes do chatbot: OK');
