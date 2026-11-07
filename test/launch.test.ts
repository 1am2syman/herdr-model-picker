import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { renderLaunch, launchCommands, shellWord, TERMINAL_PLACEHOLDER, type LaunchData } from '../src/launch.ts';

const base = (destination: LaunchData['selection']['destination']): LaunchData => ({
  selection:{providerId:"vendor'$(false)",modelId:'org/model; $HOME Unicode π',effort:'high',destination},
  origin:{terminalId:'t7',cwd:"/tmp/cwd ' π $(false)"},
  placement:{kind:'labels',spaceId:'sp1',tabId:'tb1'},
  child:{agentDir:"/tmp/agent's π",args:['--no-extensions','-e','/tmp/extension π.ts']},
});
const appData = (destination: LaunchData['selection']['destination'] = 'tab'): LaunchData =>
  ({...base(destination),placement:{kind:'app',spaceId:'sp1',paneId:'p12'}});
const blocks = (text: string) => [...text.matchAll(/```sh\n([^\n]+)\n```/g)].map(match => match[1]);
const argv = (command: string) => {
 const result = spawnSync('/bin/sh', ['-c', `printf '%s\\0' ${command}`], { encoding: 'utf8' });
 assert.equal(result.status, 0, result.stderr);
 return result.stdout.split('\0').slice(0, -1);
};
const expectedStart = (data: LaunchData, name: string, labels: string[] = []) =>
  ['hc','run','--bg','--json','--name',name,'--cwd',data.origin.cwd,'--parent','t7','--outlive-parent',...labels,'--',
    '/usr/bin/env',`PI_CODING_AGENT_DIR=${data.child.agentDir}`,'pi',...data.child.args,
    '--provider',data.selection.providerId,'--model',data.selection.modelId,'--thinking','high'];

test('labels place a terminal without any app command',()=>{
 const text = renderLaunch(base('tab'), 'pi-check');
 const found = blocks(text);
 assert.equal(found.length, 1, 'no follow-up commands in labels mode');
 assert.ok(!text.includes('herdr-app'), 'labels mode must not call the app CLI');
 assert.match(text, /adopts the new terminal/);
 assert.match(text, /may take a moment/);
 assert.ok(text.length < 1200, `block stays short (${text.length} chars)`);
});

test('a new tab labels the space only; a right split also labels the origin tab',()=>{
 for (const [destination, labels] of [['tab',[]],['right',['--label','herdr.tab=tb1']]] as const) {
  const data = base(destination);
  assert.deepEqual(launchCommands(data,'pi-check').start, expectedStart(data,'pi-check',['--label','herdr.space=sp1',...labels]));
  assert.deepEqual(launchCommands(data,'pi-check').follow, []);
 }
});

test('the app CLI targets the exact origin pane for every destination',()=>{
 for (const destination of ['tab','right','down'] as const) {
  const data = appData(destination);
  const [start, focus, place] = blocks(renderLaunch(data, 'pi-check')).map(argv);
  assert.deepEqual(start, expectedStart(data,'pi-check'));
  assert.deepEqual(focus, ['herdr-app','do','pane.focus','{"pane":"p12"}']);
  assert.deepEqual(place.slice(0,3), ['herdr-app','do','terminal.keep']);
  assert.deepEqual(JSON.parse(place[3]), {terminal:TERMINAL_PLACEHOLDER,place:destination});
 }
});

test('shell-significant identifiers, paths and JSON survive quoting exactly',()=>{
 for (const data of [base('right'), {...appData('down'), origin:{terminalId:'t7',cwd:"/tmp/p'$(false)"}}]) {
  for (const command of [launchCommands(data,'pi-check').start, ...launchCommands(data,'pi-check').follow]) {
   assert.deepEqual(argv(command.map(shellWord).join(' ')), command);
  }
 }
});

test('impossible placements never produce a misleading command',()=>{
 assert.throws(()=>launchCommands({...base('down')},'pi-check'),/needs herdr-app/);
 assert.throws(()=>launchCommands({...base('right'),placement:{kind:'labels',spaceId:'sp1'}},'pi-check'),/origin tab label/);
 const rendered = renderLaunch({...base('tab')}, 'pi-check');
 assert.ok(rendered.includes('--label herdr.space=sp1'));
});

test('nonreasoning launches omit thinking and invalid names are refused',()=>{
 const data=base('tab');data.selection.effort=null;
 assert.ok(!launchCommands(data,'pi-check').start.includes('--thinking'));
 assert.throws(()=>renderLaunch(data,'Bad Name'),/Invalid agent name/);
 assert.throws(()=>renderLaunch({...data,origin:{terminalId:'t7\nother',cwd:'/tmp'}},'pi-check'),/control characters/);
});
