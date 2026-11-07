import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appPlacement, labelPlacement, resolvePlacement, destinationsFor, type Exec } from '../src/placement.ts';

const space = (terminal='t7', pane='p12', machine: string | null=null) => ({id:'sp1',machine,tabs:[{id:'tb1',terminals:[{terminal,pane}]}]});
const app = (stdout: unknown) => ({code:0,stdout:JSON.stringify(stdout)});
const labels = (value: unknown) => ({code:0,stdout:JSON.stringify(value)});
const missing = (code: number, stderr = '') => ({code,stdout:'',stderr});

test('app placement follows the caller terminal even when another space is focused',()=>{
 const layout={spaces:[{...space('t8','p13'),active:true},space()]};
 assert.deepEqual(appPlacement(layout,'t7'),{kind:'app',spaceId:'sp1',paneId:'p12'});
});
test('app placement rejects missing, malformed, ambiguous and remote entries',()=>{
 for (const layout of [null,{}, {spaces:[]}, {spaces:[space('t8')]}, {spaces:[space(),space()]}, {spaces:[space('t7','p12','vps')]}, {spaces:[space('t7','')]}, {spaces:[{id:'sp1',tabs:[null]}]}]) {
  assert.equal(appPlacement(layout,'t7'),undefined,JSON.stringify(layout));
 }
});
test('labels carry the space and optional tab the app wrote',()=>{
 assert.deepEqual(labelPlacement({labels:{'herdr.space':'sp1','herdr.tab':'tb1'}}),{kind:'labels',spaceId:'sp1',tabId:'tb1'});
 assert.deepEqual(labelPlacement({labels:{'herdr.space':'sp1'}}),{kind:'labels',spaceId:'sp1'});
 for (const value of [null, {}, {labels:null}, {labels:{}}, {labels:{'herdr.space':''}}, {labels:{'herdr.tab':'tb1'}}]) assert.equal(labelPlacement(value),undefined,JSON.stringify(value));
});
test('placement prefers the app, falls back to core labels when the app is remote',async()=>{
 const calls: string[] = [];
 const remote: Exec = async command => {
  calls.push(command);
  if (command === 'herdr-app') throw Object.assign(new Error('spawn herdr-app ENOENT'),{code:'ENOENT'});
  return labels({labels:{'herdr.space':'sp1','herdr.tab':'tb1'}});
 };
 assert.deepEqual(await resolvePlacement(remote,'t7'),{kind:'labels',spaceId:'sp1',tabId:'tb1'});
 assert.deepEqual(calls,['herdr-app','hc']);
 const local: Exec = async () => app({spaces:[space()]});
 assert.deepEqual(await resolvePlacement(local,'t7'),{kind:'app',spaceId:'sp1',paneId:'p12'});
});
test('an app that cannot find the terminal falls through to labels',async()=>{
 const exec: Exec = async command => command === 'herdr-app'
  ? missing(2,'no Herdr window at /home/x/.config/herdr-app/herdr-app.sock')
  : labels({labels:{'herdr.space':'sp1'}});
 assert.deepEqual(await resolvePlacement(exec,'t7'),{kind:'labels',spaceId:'sp1'});
});
test('an unshown terminal fails with both probe diagnostics',async()=>{
 const exec: Exec = async command => command === 'herdr-app' ? missing(2,'no Herdr window at /tmp/herdr-app.sock') : labels({labels:{}});
 await assert.rejects(resolvePlacement(exec,'t7'),/does not show this terminal.*app: herdr-app no Herdr window.*core: t7 has no herdr\.space label/s);
});
test('only the app can split down',()=>{
 assert.deepEqual(destinationsFor({kind:'app',spaceId:'sp1',paneId:'p12'}),['tab','right','down']);
 assert.deepEqual(destinationsFor({kind:'labels',spaceId:'sp1',tabId:'tb1'}),['tab','right']);
});
