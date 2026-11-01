import test from 'node:test';
import assert from 'node:assert/strict';
import {connection,comparisonRows} from '../extension/view.mjs';
test('connection indicator never shows stale or failed reads as connected',()=>{const now=100000;assert.equal(connection(null,90,now).label,'Sem leitura');assert.equal(connection({ok:true,readAt:now-91000},90,now).label,'Desatualizado');assert.equal(connection({ok:false,error:'Loja diferente'},90,now).label,'Bloqueado');assert.equal(connection({ok:true,readAt:now},90,now).label,'Conectado');});
test('comparison uses measured values, keeps missing data explicit and never claims a save',()=>{const rows=comparisonRows([{km:.5,minutes:25,fee:6.99},{km:1,minutes:30,fee:7.99}],[{km:.5,minutes:30,fee:8.99},{km:1,minutes:30,fee:null},{km:2,minutes:40,fee:9.99}]);assert.match(rows[0].label,/Diferença/);assert.equal(rows[1].label,'Valores iguais');assert.equal(rows[2].label,'Sem leitura iFood');assert.equal(rows[2].current,'—');assert.equal(comparisonRows(null,null).length,0);});
test('time edit history displays before/after per radius and excludes fee-only saves',()=>{
 const logs=[{type:'saved',storeId:'a',at:'2026-11-01T18:05Z',before:[{km:.5,minutes:30,fee:6.99}],after:[{km:.5,minutes:30,fee:7.99}]},{type:'saved',storeId:'a',at:'2026-11-01T18:00Z',before:[{km:.5,minutes:25,fee:6.99}],after:[{km:.5,minutes:30,fee:6.99}]}];
 const r=comparisonRows(null,null,null,logs,'a')[0];assert.equal(r.before,'25 min');assert.equal(r.after,'30 min');assert.notEqual(r.editedAt,'—');assert.equal(comparisonRows(null,null,null,logs,'b').length,0);
});
