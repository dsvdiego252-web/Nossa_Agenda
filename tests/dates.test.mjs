import test from 'node:test';
import assert from 'node:assert/strict';
import { occursOn, occurrences, monthDays, validateEvent, addDays } from '../src/dates.js';
const event = { title:'Teste', owner:'Diego', date:'2026-01-31', start_time:'09:00', end_time:'10:00', category:'Pessoal', repeat:'none', weekdays:[], repeat_until:null, notes:'', color:'#668bc1', reminder:10, deleted:false };
test('repetição mensal pula meses sem o dia original', () => {
  const e = {...event, repeat:'monthly'};
  assert.equal(occursOn(e,'2026-02-28'),false);
  assert.equal(occursOn(e,'2026-03-31'),true);
  assert.equal(occursOn(e,'2026-01-30'),false);
});
test('diária, semanal e personalizada respeitam início e fim inclusivo', () => {
  assert.equal(occursOn({...event,repeat:'daily'},'2026-02-01'),true);
  assert.equal(occursOn({...event,repeat:'weekly'},'2026-02-07'),true);
  assert.equal(occursOn({...event,repeat:'weekly'},'2026-02-08'),false);
  const custom = {...event,repeat:'custom',weekdays:[1,3],repeat_until:'2026-02-04'};
  assert.equal(occursOn(custom,'2026-02-02'),true);
  assert.equal(occursOn(custom,'2026-02-04'),true);
  assert.equal(occursOn(custom,'2026-02-09'),false);
});
test('não exibe excluídos; ordena ocorrências e atravessa ano bissexto', () => {
  assert.equal(occursOn({...event,deleted:true},event.date),false);
  assert.equal(addDays('2028-02-28',1),'2028-02-29');
  assert.equal(monthDays('2026-09-20').length,42);
  assert.equal(occurrences([{...event,repeat:'daily'}],'2026-01-30','2026-02-02').length,3);
});
test('validação rejeita horário, cor, responsável e repetição inválidos', () => {
  assert.doesNotThrow(() => validateEvent(event));
  for (const invalid of [{end_time:'08:00'},{owner:'Terceiro'},{color:'red'},{date:'2026-02-30'},{repeat:'custom',weekdays:[]},{reminder:5},{repeat_until:'2026-01-30'}]) {
    assert.throws(() => validateEvent({...event,...invalid}));
  }
});

