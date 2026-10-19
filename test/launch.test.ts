import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { renderLaunch, launchCommands, childArguments, shellWord, PANE_PLACEHOLDER, type LaunchData } from '../src/launch.ts';

export function fixture(destination: 'tab' | 'right' | 'down' = 'tab'): LaunchData {
 return {selection:{providerId:"vendor'$(false)",modelId:'org/model; $HOME Unicode π',effort:'high',destination},origin:{workspaceId:'wTest',paneId:'wTest:pSource',cwd:"/tmp/cwd ' π $(false)"},child:{agentDir:"/tmp/agent's π",args:[]}};
}
const blocks = (text: string) => [...text.matchAll(/```sh\n([^\n]+)\n```/g)].map(match => match[1]);
const argv = (command: string) => {
 const result = spawnSync('/bin/sh', ['-c', `printf '%s\\0' ${command}`], { encoding: 'utf8' });
 assert.equal(result.status, 0, result.stderr);
 return result.stdout.split('\0').slice(0, -1);
};
test('block contains exactly two short Herdr commands, not a bundled program',()=>{
 const text = renderLaunch(fixture(), 'pi-check');
 const found = blocks(text);
 assert.equal(found.length, 2);
 assert.ok(found.every(line => line.startsWith('herdr ')));
 assert.ok(!text.includes('node --input-type'), 'no inlined Node program');
 assert.ok(text.length < 900, `block stays short (${text.length} chars)`);
});
for(const destination of ['tab','right','down'] as const)test('exact Herdr argv for '+destination,()=>{
 const data = fixture(destination);
 const [first, second] = blocks(renderLaunch(data, 'pi-check'));
 const env = `PI_CODING_AGENT_DIR=${data.child.agentDir}`;
 const firstArgv = argv(first), startArgv = argv(second);
 assert.equal(startArgv[3], 'pi-check');
 const expectedCreate = destination === 'tab'
  ? ['herdr','tab','create','--workspace','wTest','--cwd',data.origin.cwd,'--env',env,'--label','pi-check','--no-focus']
  : ['herdr','pane','split','--pane','wTest:pSource','--direction',destination,'--cwd',data.origin.cwd,'--env',env,'--label','pi-check','--no-focus'];
 assert.deepEqual(firstArgv, expectedCreate);
 assert.deepEqual(startArgv, ['herdr','agent','start','pi-check','--kind','pi','--pane',PANE_PLACEHOLDER,'--','--provider',data.selection.providerId,'--model',data.selection.modelId,'--thinking','high']);
});
test('shell-significant identifiers and paths survive quoting exactly',()=>{
 const data = fixture('right');
 const { start } = launchCommands(data, 'pi-check');
 const rendered = start.map(shellWord).join(' ');
 assert.deepEqual(argv(rendered), start);
});
