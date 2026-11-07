import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Exercises the real extension with a mocked host: no core, no app, no models.
const script = `
import assert from 'node:assert/strict';
import extension from './src/index.ts';
import {SettingsManager,initTheme} from '@earendil-works/pi-coding-agent';
import {getBuiltinModel} from '@earendil-works/pi-ai/providers/all';
initTheme('dark',false);
SettingsManager.create=()=>SettingsManager.inMemory();
const model={...getBuiltinModel('openai','gpt-5.4'),reasoning:false};
const layout={spaces:[{id:'sp1',tabs:[{terminals:[{terminal:'t7',pane:'p12'}]}]}]};
const coreLabels={code:0,stdout:JSON.stringify({labels:{'herdr.space':'sp1','herdr.tab':'tb1'}})};
const enter='\\r';

async function run(exec, steps) {
  let handler; const notifications=[]; const screens=[]; let inserted='';
  extension({registerCommand:(_name,o)=>handler=o.handler,registerShortcut:()=>{},exec});
  const ctx={mode:'tui',cwd:'/tmp',isProjectTrusted:()=>false,
    modelRegistry:{refresh:async()=>{},getAvailable:()=>[model]},
    ui:{notify:(...args)=>notifications.push(args),getEditorText:()=>'draft π',pasteToEditor:text=>inserted=text,
      custom:async(factory)=>new Promise(resolve=>{
        const component=factory({requestRender(){},terminal:{rows:40}},{fg:(_c,t)=>t,bg:(_c,t)=>t,bold:t=>t},undefined,resolve);
        for (const step of steps) { component.handleInput(step); screens.push(component.render(100).join(' ')); }
      })}};
  await handler('',ctx);
  return {notifications,inserted,screens};
}

// The app runs on another machine: the core's labels place the terminal, and
// splitting down is not offered because only a local app can do it.
{
  const exec=async (command)=>{ if(command==='herdr-app') throw Object.assign(new Error('spawn herdr-app ENOENT'),{code:'ENOENT'}); return coreLabels; };
  const {notifications,inserted,screens}=await run(exec,[enter,enter,enter]);
  assert.deepEqual(notifications,[]);
  assert.match(screens[0],/New tab/);
  assert.match(screens[0],/Split right/);
  assert.doesNotMatch(screens[0],/Split down/);
  assert.match(inserted,/--label herdr\\.space=sp1/);
  assert.doesNotMatch(inserted,/herdr-app/);
}
// A local app keeps all three destinations and exact pane targeting.
{
  const exec=async()=>({code:0,stdout:JSON.stringify(layout)});
  const {inserted,screens}=await run(exec,[enter,'\\x1b[B',enter,enter]);
  assert.match(screens[0],/Split down/);
  assert.match(screens[1],/→ Split right/);
  assert.match(inserted,/herdr-app do pane.focus/);
  assert.match(inserted,/"place":"right"/);
}
// Nothing shown: the message names both probes instead of guessing at installation.
{
  const exec=async (command)=>command==='herdr-app'
    ? {code:2,stdout:'',stderr:'no Herdr window at /tmp/x.sock'}
    : {code:0,stdout:'{"labels":{}}'};
  const {notifications,inserted}=await run(exec,[]);
  assert.equal(inserted,'');
  assert.equal(notifications.length,1);
  assert.equal(notifications[0][1],'error');
  assert.match(notifications[0][0],/does not show this terminal/);
  assert.match(notifications[0][0],/no Herdr window/);
  assert.match(notifications[0][0],/no herdr\\.space label/);
}
console.log('extension scenarios passed');
`;

test('extension resolves remote app placement through core labels and degrades honestly',()=>{
 const agentDir=mkdtempSync(join(tmpdir(),'model-picker-ext-'));
 try {
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{
   cwd:process.cwd(),env:{...process.env,PI_CODING_AGENT_DIR:agentDir,HC_TERMINAL_ID:'t7'},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/extension scenarios passed/);
 } finally { rmSync(agentDir,{recursive:true,force:true}); }
});
