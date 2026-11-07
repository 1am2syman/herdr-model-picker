import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { launchCommands, type LaunchData } from '../src/launch.ts';

// Never use the user's core, config, socket, templates, credentials or programs.
const scratch = mkdtempSync(join(tmpdir(), 'hmp-'));
const env = { ...process.env, HC_SESSION: 'model-picker-smoke', HC_SOCKET: join(scratch,'core.sock'),
  XDG_STATE_HOME: join(scratch,'state'), XDG_CONFIG_HOME: join(scratch,'config'), XDG_RUNTIME_DIR: scratch,
  HC_TERMINAL_ID: '', HC_TERMINAL_SOCKET: '', PATH: join(scratch,'bin')+':'+process.env.PATH };
function hc(args: string[]) {
  const result = spawnSync('hc', args, {env,encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,`${args.join(' ')}: ${result.stderr || result.error}`);
  return JSON.parse(result.stdout);
}
try {
  mkdirSync(join(scratch,'bin'));
  const templates=join(scratch,'config','herdr-core','templates');
  mkdirSync(templates,{recursive:true});
  writeFileSync(join(templates,'env.md'),'---\nname: env\ndescription: must not override the executable\ncommand: false\n---\n');
  const cwd=join(scratch,"cwd ' π $(false)");mkdirSync(cwd);
  const agentDir=join(scratch,"agent's π");mkdirSync(agentDir);
  writeFileSync(join(scratch,'bin','pi'),`#!${process.execPath}
const fs=require('node:fs');
fs.writeFileSync(process.env.PI_CODING_AGENT_DIR+'/received.json',JSON.stringify({cwd:process.cwd(),agentDir:process.env.PI_CODING_AGENT_DIR,args:process.argv.slice(2)}));
`,{mode:0o700});
  const parent=hc(['run','--bg','--no-parent','--','sh','-c','read line']);
  assert.match(parent.address,/^t[0-9a-z]+$/);
  for (const destination of ['tab','right','down'] as const) {
    const data: LaunchData={selection:{providerId:"vendor'$(false)",modelId:'org/model; $HOME π',effort:'high',destination},
      origin:{terminalId:parent.address,spaceId:'sp1',paneId:'p1',cwd},child:{agentDir,args:['--no-extensions','-e','/tmp/extension π.ts']}};
    const {start}=launchCommands(data,`pi-${destination}`);
    const child=hc(start.slice(1));
    hc(['wait',child.address,'--timeout','10']);
    assert.deepEqual(JSON.parse(readFileSync(join(agentDir,'received.json'),'utf8')),
      {cwd,agentDir,args:[...data.child.args,'--provider',data.selection.providerId,'--model',data.selection.modelId,'--thinking','high']});
    const record=hc(['get',child.address]);
    assert.equal(record.parent,parent.address);
    assert.equal(record.name,`pi-${destination}`);
    assert.equal(record.state,'finished');
    assert.equal(record.exit_code,0);
    hc(['rm',child.address]);
  }
  if (process.argv.includes('--real-pi')) {
    rmSync(join(scratch,'bin','pi'));
    const data: LaunchData={selection:{providerId:'openai',modelId:'gpt-5.4',effort:'high',destination:'tab'},
      origin:{terminalId:parent.address,spaceId:'sp1',paneId:'p1',cwd},
      child:{agentDir,args:['--no-extensions','--no-skills','--no-prompt-templates','--approve',
        '-e',fileURLToPath(new URL('../src/index.ts',import.meta.url))]}};
    const {start}=launchCommands(data,'pi-live');
    const child=hc(start.slice(1));
    const ready=hc(['wait',child.address,'--timeout','15']);
    const record=hc(['get',child.address]);
    assert.equal(record.state,'live',JSON.stringify(record));
    assert.equal(ready.status,'idle',JSON.stringify(ready));
    const screen=spawnSync('hc',['read',child.address],{env,encoding:'utf8',timeout:20000});
    assert.equal(screen.status,0,screen.stderr);
    assert.doesNotMatch(screen.stdout,/failed to load|error loading|extension error/i);
    hc(['kill',parent.address]);hc(['rm',parent.address]);
    assert.equal(hc(['get',child.address]).state,'live','child outlives its parent');
    hc(['kill',child.address]);hc(['rm',child.address]);
    console.log('interactive Pi startup passed (no prompt sent)');
  } else {
    hc(['kill',parent.address]);hc(['rm',parent.address]);
  }
  console.log('hc smoke passed');
} finally {
  // HC_SOCKET and all XDG paths above bind this exclusively to our private core.
  const stopped=spawnSync('hc',['server','stop'],{env,encoding:'utf8',timeout:20000});
  assert.equal(stopped.status,0,stopped.stderr);
  rmSync(scratch,{recursive:true,force:true});
}
