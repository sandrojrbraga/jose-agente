import test from 'node:test';import assert from 'node:assert/strict';
import {chooseSaipos} from '../extension/link-report.mjs';
const source={storeId:'65416'};const valid=id=>({tabId:id,complete:true,storeId:'65416',count:1});
test('absence and reader failure have different actionable errors',()=>{assert.throws(()=>chooseSaipos([],source,null,'incognito'),/Nenhuma aba Saipos visível no ambiente ANÔNIMO/);assert.throws(()=>chooseSaipos([{tabId:10,error:'Limpe os filtros de busca do Kanban.'}],source),/Aba 10: Limpe os filtros/);});
test('explicit chosen tab resolves duplicates without adding queues together',()=>{const a=valid(10),b=valid(11);assert.equal(chooseSaipos([a,b],source,11),b);assert.throws(()=>chooseSaipos([a,b],source),/Há 2 abas/);});
test('wrong kitchen reports observed and expected IDs rather than duplicate warning',()=>{assert.throws(()=>chooseSaipos([{...valid(10),storeId:'999'}],source),/esperado ID 65416; lidos 999/);assert.throws(()=>chooseSaipos([{...valid(10),storeId:'999'},valid(11)],source,10),/ID 999; esperado 65416/);});
test('reopened unique kitchen reconnects when saved tab was closed; numeric IDs normalize',()=>{const a={...valid(12),storeId:65416};assert.equal(chooseSaipos([a],source,9),a);});
test('chosen unreadable tab exposes original error instead of choosing another kitchen silently',()=>{assert.throws(()=>chooseSaipos([{tabId:10,error:'Não foi possível identificar o ID Saipos.'},valid(11)],source,10),/aba 10: Não foi possível identificar/);});
