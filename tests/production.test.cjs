/* Executar: node --test tests/production.test.cjs */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'producao.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);

function freshProduction() {
  const sandbox = {window: {}, TextEncoder, btoa: text => Buffer.from(text, 'binary').toString('base64')};
  sandbox.globalThis = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(scripts[0], sandbox);
  vm.runInContext(scripts[1], sandbox);
  return {D: sandbox.window.ProductionDomain, state: sandbox.window.createProductionSeed()};
}

test('todos os scripts da produção são JavaScript válido', () => {
  assert.equal(scripts.length, 4);
  scripts.forEach((script, index) => new vm.Script(script, {filename: 'producao-script-' + index}));
});

test('política de consulta e exportação admite atualização independente pelo ambiente pai', () => {
  const {D} = freshProduction();
  const policy = D.createAccessPolicy({edit: false, export: false});
  assert.equal(policy.canEdit, false);
  assert.equal(policy.canExport, false);
  assert.throws(() => policy.assertEdit(), /somente para consulta/);
  assert.throws(() => policy.assertExport(), /exportar, imprimir ou baixar anexos/);
  policy.update({edit: true});
  assert.equal(policy.canEdit, true);
  assert.equal(policy.canExport, false);
  policy.assertEdit();
  policy.update({edit: false, export: true});
  assert.equal(policy.canEdit, false);
  policy.assertExport();
});

test('mutate bloqueia consulta antes de executar callback ou persistir e reage à revogação', async () => {
  const {D, state} = freshProduction();
  const permissions = D.createAccessPolicy({edit: false});
  let called = 0, saved = 0;
  const context = {permissions, D, S: state, busy: false, currentId: null,
    DB: {save: async () => {saved++;}}, publishProduction() {}, render() {},
    renderPiece() {}, toast() {}, $: () => ({open: false})};
  vm.createContext(context);
  const source = scripts[3].match(/  async function mutate[^\n]+/)[0].trim();
  const mutate = vm.runInContext('(' + source + ')', context);
  await assert.rejects(mutate(() => {called++;}), /somente para consulta/);
  assert.equal(called, 0);
  assert.equal(saved, 0);
  permissions.update({edit: true});
  await mutate(next => {called++; next.permissionTest = 'saved';});
  assert.equal(context.S.permissionTest, 'saved');
  assert.equal(called, 1);
  assert.equal(saved, 1);
  permissions.update({edit: false});
  await assert.rejects(mutate(() => {called++;}), /somente para consulta/);
  assert.equal(called, 1);
});

test('restaurar backup, anexar e baixar arquivos respeitam a política mesmo por chamada direta', async () => {
  const {D} = freshProduction();
  const permissions = D.createAccessPolicy({edit: false, export: false});
  const context = vm.createContext({permissions, embedded: false});
  for (const name of ['uploadFiles', 'importBackup']) {
    const source = scripts[3].match(new RegExp('  async function ' + name + '[^\\n]+'))[0].trim();
    const fn = vm.runInContext('(' + source + ')', context);
    await assert.rejects(fn({}), /somente para consulta/);
  }
  const downloadSource = scripts[3].match(/  function download\([^\n]+/)[0].trim();
  const download = vm.runInContext('(' + downloadSource + ')', context);
  assert.throws(() => download('blocked.json', null), /permissão para exportar/);
  const printSource = scripts[3].match(/  function printPiece\([^\n]+/)[0].trim();
  const print = vm.runInContext('(' + printSource + ')', context);
  assert.throws(() => print('blocked'), /permissão para exportar/);
});

test('modo integrado impede backup, restauração e reset individuais antes de qualquer efeito', async () => {
  let notices = 0;
  const context = vm.createContext({embedded: true, managementBackupNotice() {notices++;}});
  for (const name of ['exportBackup', 'resetDemo']) {
    const source = scripts[3].match(new RegExp('  function ' + name + '[^\\n]+'))[0].trim();
    const fn = vm.runInContext('(' + source + ')', context);
    fn();
  }
  const restoreSource = scripts[3].match(/  async function importBackup[^\n]+/)[0].trim();
  const restore = vm.runInContext('(' + restoreSource + ')', context);
  const input = {value: 'selected-file'};
  await restore(input);
  assert.equal(input.value, '');
  assert.equal(notices, 3);
});

test('composição aceita 80% + 90% e rendimento mantém 12,5 kg × 3,2 m/kg = 40 m', () => {
  const {D, state} = freshProduction();
  const m = D.upsertMaterial(state, {name: 'Tecido de teste', unit: 'm', kilos: 12.5, yieldRate: 3.2,
    composition: [{fiber: 'Algodão', percent: 80}, {fiber: 'Poliéster', percent: 90}]});
  assert.equal(m.composition.reduce((total, fiber) => total + fiber.percent, 0), 170);
  assert.equal(m.yield.kg, 12.5);
  assert.equal(m.yield.metersPerKg, 3.2);
  assert.equal(m.yield.meters, 40);
  assert.equal(state.materialEntries.filter(entry => entry.materialId === m.id).length, 0,
    'salvar metadados de rendimento isoladamente não duplica movimentos');
});

test('participação da etiqueta acima de 100% preserva cálculo sem normalização e símbolos', () => {
  const {D, state} = freshProduction();
  const m = D.upsertMaterial(state, {name: 'Composição livre', unit: 'm',
    composition: [{fiber: 'Algodão', percent: 80}, {fiber: 'Poliéster', percent: 90}]});
  const label = D.upsertLabel(state, {name: 'Etiqueta de teste', type: 'composition',
    sources: [{materialId: m.id, percent: 180}], careSymbols: {wash: '30-mild', dry: 'line-shade'}});
  assert.equal(label.sources[0].percent, 180);
  assert.equal(label.composition.reduce((total, fiber) => total + fiber.percent, 0), 306);
  assert.equal(label.careSymbols.wash, '30-mild');
  assert.equal(label.careSymbols.dry, 'line-shade');
  assert.throws(() => D.upsertMaterial(state, {name: 'Inválido', unit: 'm',
    composition: [{fiber: 'Algodão', percent: -1}]}), /quantidade válida/);
});

test('copiar uma referência para outra cor cria lote independente sem repetir progresso ou anexos', () => {
  const {D, state} = freshProduction();
  const source = state.pieces.find(piece => piece.stage >= 10);
  const copied = D.addPiece(state, {...source, owner: state.actor, color: 'Rosa', lot: 'LOTE-COPIA',
    sourcePieceId: source.id});
  assert.notEqual(copied.id, source.id);
  assert.equal(copied.ref, source.ref);
  assert.equal(copied.lot, 'LOTE-COPIA');
  assert.equal(copied.sourcePieceId, source.id);
  assert.equal(copied.compositionLabel, source.compositionLabel);
  assert.equal(copied.barcodeLabel, source.barcodeLabel);
  assert.equal(copied.stage, 0);
  assert.equal(copied.finished, false);
  assert.equal(copied.quality, null);
  assert.equal(copied.steps.flatMap(step => step.files).length, 0);
  assert.equal(copied.steps.filter(step => step.status === 'Concluída').length, 0);
  assert.equal(copied.history.length, 1);
  assert.match(copied.history[0].text, /copiada de/);
});

test('unicidade permite referência repetida e distingue cor e lote', () => {
  const {D, state} = freshProduction();
  const data = {...state.pieces[0], owner: state.actor, lot: 'LOTE-A', color: 'Verde'};
  const first = D.addPiece(state, data);
  assert.throws(() => D.addPiece(state, data), /referência, cor e lote/);
  const otherColor = D.addPiece(state, {...data, color: 'Azul'});
  const otherLot = D.addPiece(state, {...data, lot: 'LOTE-B'});
  assert.equal(first.ref, otherColor.ref);
  assert.equal(first.ref, otherLot.ref);
  assert.equal(otherColor.color, 'Azul');
  assert.equal(otherLot.lot, 'LOTE-B');
});

test('controle de qualidade distribui a grade e impede segunda entrada da mesma produção', () => {
  const {D, state} = freshProduction();
  const piece = state.pieces.find(piece => piece.stage === 11 && !piece.finished);
  const before = state.stockEntries.length;
  const rows = piece.grade.map((grade, index) => ({size: grade.size,
    normal: grade.qty - (index === 0 ? 2 : 0), second: index === 0 ? 1 : 0, rejected: index === 0 ? 1 : 0}));
  D.finish(state, piece.id, {approval: 'Aprovado com observação', note: 'Uma segunda linha e uma rejeitada.', rows});
  assert.equal(state.stockEntries.length, before + 1);
  assert.equal(piece.finished, true);
  assert.equal(piece.quality.rows.reduce((total, row) => total + row.normal + row.second + row.rejected, 0), D.total(piece));
  assert.throws(() => D.finish(state, piece.id, {approval: 'Aprovado', rows}), /disponível para finalização/);
});

test('retorno ao fluxo preserva anexos e reinicia os status das etapas refeitas', () => {
  const {D, state} = freshProduction();
  const piece = state.pieces.find(piece => piece.stage === 10);
  const fileCount = piece.steps.flatMap(step => step.files).length;
  D.rewind(state, piece.id, 6, state.actor, 'Refazer molde');
  assert.equal(piece.stage, 6);
  assert.equal(piece.steps[6].status, 'Em andamento');
  assert.equal(piece.steps[10].status, 'A iniciar');
  assert.equal(piece.steps.flatMap(step => step.files).length, fileCount);
  assert.match(piece.history[0].text, /Refazer molde/);
});

test('integração importa normais e segunda linha uma única vez e mantém rendimento', () => {
  const {D, state: production} = freshProduction();
  const F = require('../core.js');
  const C = require('../integration-core.js');
  const erp = C.migrate(F.seed());
  const material = D.upsertMaterial(production, {name: 'Rendimento integrado', unit: 'm', kilos: 10,
    yieldRate: 4, composition: [{fiber: 'Algodão', percent: 170}]});
  D.receiveMaterial(production, {materialId: material.id, qty: 40, unitCost: 0, date: D.today()});
  const first = C.importProduction(erp, production);
  const moveCount = erp.moves.length;
  const second = C.importProduction(erp, production);
  assert.equal(first.imported, 1);
  assert.equal(second.imported, 0);
  assert.equal(second.materials, 0);
  assert.equal(erp.moves.length, moveCount);
  const materialProduct = erp.products.find(product => product.sourceMaterialKey === 'material:' + material.id);
  assert.equal(materialProduct.yield.meters, 40);
  assert.equal(F.at(erp, materialProduct.id, 'raw'), 40);
  const importRecord = erp.integration.productionImports[0];
  assert.equal(importRecord.lines.filter(line => line.quality === 'normal').reduce((total, line) => total + line.qty, 0), 58);
  assert.equal(importRecord.lines.filter(line => line.quality === 'segunda').reduce((total, line) => total + line.qty, 0), 2);
});
