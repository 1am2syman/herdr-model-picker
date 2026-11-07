import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { renderLaunch, launchCommands, shellWord, TERMINAL_PLACEHOLDER, type LaunchData } from '../src/launch.ts';

function fixture(destination: 'tab' | 'right' | 'down' = 'tab'): LaunchData {
 return {selection:{providerId:"vendor'$(false)",modelId:'org/model; $HOME Unicode π',effort:'high',destination},origin:{terminalId:'t7',spaceId:'sp1',paneId:'p12',cwd:"/tmp/cwd ' π $(false)"},child:{agentDir:"/tmp/agent's π",args:['--no-extensions','-e','/tmp/extension π.ts']}};
}
const blocks = (text: string) => [...text.matchAll(/```sh\n([^\n]+)\n```/g)].map(match => match[1]);
const argv = (command: string) => {
 const result = spawnSync('/bin/sh', ['-c', `printf '%s\\0' ${command}`], { encoding: 'utf8' });
 assert.equal(result.status, 0, result.stderr);
 return result.stdout.split('\0').slice(0, -1);
};
test('block contains hc startup and explicit app placement without a bundled program',()=>{
 const text = renderLaunch(fixture(), 'pi-check');
 const found = blocks(text);
 assert.equal(found.length, 3);
 assert.ok(found[0].startsWith('hc run '));
 assert.ok(found.slice(1).every(line => line.startsWith('herdr-app do ')));
 assert.ok(!text.includes('node --input-type'), 'no inlined Node program');
 assert.ok(text.length < 1200, `block stays short (${text.length} chars)`);
 assert.match(text, /\.address/);
 assert.match(text, /stop on any error/);
 assert.match(text, /pending/);
});
for(const destination of ['tab','right','down'] as const)test('exact hc and app argv for '+destination,()=>{
 const data = fixture(destination);
 const [start, focus, place] = blocks(renderLaunch(data, 'pi-check')).map(argv);
 assert.deepEqual(start, ['hc','run','--bg','--json','--name','pi-check','--cwd',data.origin.cwd,'--parent','t7','--outlive-parent','--','/usr/bin/env',`PI_CODING_AGENT_DIR=${data.child.agentDir}`,'pi',...data.child.args,'--provider',data.selection.providerId,'--model',data.selection.modelId,'--thinking','high']);
 assert.deepEqual(focus, ['herdr-app','do','pane.focus','{"pane":"p12"}']);
 assert.deepEqual(place.slice(0,3), ['herdr-app','do','terminal.keep']);
 assert.deepEqual(JSON.parse(place[3]), {terminal:TERMINAL_PLACEHOLDER,place:destination});
});
test('shell-significant identifiers, paths and JSON survive quoting exactly',()=>{
 const data = fixture('right');
 data.origin.paneId = 'p"$(false) π';
 for (const command of Object.values(launchCommands(data, 'pi-check'))) {
  assert.deepEqual(argv(command.map(shellWord).join(' ')), command);
 }
});
test('nonreasoning launches omit thinking and invalid inputs cannot enter the draft',()=>{
 const data=fixture();data.selection.effort=null;
 assert.ok(!launchCommands(data,'pi-check').start.includes('--thinking'));
 assert.throws(()=>renderLaunch(data,'Bad Name'),/Invalid agent name/);
 data.origin.terminalId='t7\nother';
 assert.throws(()=>renderLaunch(data,'pi-check'),/control characters/);
});
