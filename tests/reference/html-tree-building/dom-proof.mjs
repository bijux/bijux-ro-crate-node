import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium, firefox, webkit} from 'playwright';
import {selectedEngines} from '../../ci/selection.mjs';
const root = new URL('../../../', import.meta.url);
const input = await readFile(new URL('./pairs.json', import.meta.url));
const {pairs} = JSON.parse(input);
const capture = JSON.parse(await readFile(new URL('./trees.json', import.meta.url)));
assert.equal(capture.pairs_sha256, createHash('sha256').update(input).digest('hex'));
const reports = [];
for (const [engineName, engine] of selectedEngines({chromium, firefox, webkit})) {
  const browser = await engine.launch({headless: true});
  try {
    const context = await browser.newContext({serviceWorkers: 'block'}), unexpected = [], errors = [];
    await context.route('**/*', route => {unexpected.push(route.request().url()); return route.abort();});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<!doctype html><meta charset="utf-8"><title>HTML tree contracts</title>');
    const rows = await page.evaluate(pairs => {
      const nodeValue = node => {
        if (node.nodeType === Node.ELEMENT_NODE) return {type: 'element', namespace: node.namespaceURI, name: node.localName,
          attributes: [...node.attributes].map(attribute => [attribute.namespaceURI, attribute.localName, attribute.value]),
          children: [...node.childNodes].map(nodeValue)};
        if (node.nodeType === Node.TEXT_NODE) return {type: 'text', value: node.data};
        if (node.nodeType === Node.COMMENT_NODE) return {type: 'comment', value: node.data};
        throw new Error('Unexpected DOM node type ' + node.nodeType);
      };
      if (document.compatMode !== 'CSS1Compat') throw new Error('DOM proof requires standards mode');
      return pairs.map(pair => {
        const result = {name: pair.name};
        for (const side of ['first', 'second']) {
          const element = document.createElement('div'); element.innerHTML = pair[side];
          result[side] = [...element.childNodes].map(nodeValue);
        }
        return result;
      });
    }, pairs);
    assert.deepEqual(rows.map(row => row.name), pairs.map(pair => pair.name));
    for (const row of rows) {
      const expected = capture.pairs.find(pair => pair.name === row.name).corrected;
      for (const side of ['first', 'second']) assert.deepEqual(row[side], expected[side].tree, row.name + '/' + side);
    }
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    reports.push({engine: engineName, version: browser.version(), pairs: rows.length,
      actual_executed_case_names: rows.map(row => row.name), unexpected, errors, rows});
  } finally {await browser.close();}
}
const report = {pairs_sha256: capture.pairs_sha256, html_grammar_correction: capture.html_grammar_correction, reports};
await mkdir(new URL('artifacts/reports/', root), {recursive: true});
await writeFile(new URL('artifacts/reports/html-tree-building-dom.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({reports: reports.map(({rows, ...row}) => row)}));
