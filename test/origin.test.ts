import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchOrigin } from '../src/origin.ts';

const space = (terminal='t7', pane='p12', machine: string | null=null) => ({id:'sp1',machine,tabs:[{id:'tb1',terminals:[{terminal,pane}]}]});
test('origin follows caller terminal even when a different space is focused',()=>{
 const layout={spaces:[{...space('t8','p13'),active:true},space()]};
 assert.deepEqual(launchOrigin(layout,'t7','/tmp'),{terminalId:'t7',spaceId:'sp1',paneId:'p12',cwd:'/tmp'});
});
test('missing, malformed, ambiguous and remote caller layouts fail closed',()=>{
 for (const layout of [null,{}, {spaces:[]}, {spaces:[space('t8')]}, {spaces:[space(),space()]}, {spaces:[space('t7','p12','vps')]}, {spaces:[space('t7','')]}, {spaces:[{id:'sp1',tabs:[null]}]}]) {
  assert.throws(()=>launchOrigin(layout,'t7','/tmp'),/Cannot locate/);
 }
});
test('actual extension uses hc identity and only reads app layout before inserting',()=>{
 const script=`
 import assert from 'node:assert/strict';
 import extension from './src/index.ts';
 import {SettingsManager,initTheme} from '@earendil-works/pi-coding-agent';
 import {getBuiltinModel} from '@earendil-works/pi-ai/providers/all';
 initTheme('dark',false);
 SettingsManager.create=()=>SettingsManager.inMemory();
 let handler;const calls=[];const notifications=[];let inserted='';
 extension({registerCommand:(_name,o)=>handler=o.handler,registerShortcut:()=>{},exec:async(...args)=>{
  calls.push(args);
  return {code:0,stdout:JSON.stringify({spaces:[{id:'sp1',tabs:[{terminals:[{terminal:'t7',pane:'p12'}]}]}]})};
 }});
 const model={...getBuiltinModel('openai','gpt-5.4'),reasoning:false};
 const ctx={mode:'tui',cwd:'/tmp',isProjectTrusted:()=>false,modelRegistry:{refresh:async()=>{},getAvailable:()=>[model]},ui:{
  notify:(...args)=>notifications.push(args),getEditorText:()=>'draft π',pasteToEditor:text=>inserted=text,
  custom:async(factory)=>new Promise(resolve=>{
   const component=factory({requestRender(){},terminal:{rows:40}},{fg:(_c,t)=>t},undefined,resolve);
   for(let i=0;i<3;i++)component.handleInput('\\r');
  })
 }};
 await handler('',ctx);
 assert.deepEqual(notifications,[]);
 assert.deepEqual(calls,[['herdr-app',['ls'],{timeout:5000}]]);
 assert.match(inserted,/hc run --bg/);
 assert.match(inserted,/--parent t7/);
 assert.match(inserted,/p12/);
 console.log('draft inserted without launching');
 `;
 const agentDir=mkdtempSync(join(tmpdir(),'model-picker-origin-'));
 try {
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:{...process.env,PI_CODING_AGENT_DIR:agentDir,HC_TERMINAL_ID:'t7',HERDR_ENV:'',HERDR_WORKSPACE_ID:'',HERDR_PANE_ID:''},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/draft inserted without launching/);
 } finally { rmSync(agentDir,{recursive:true,force:true}); }
});
test('unavailable app, missing hc context and invalid layouts leave the draft untouched',()=>{
 const script=`
 import assert from 'node:assert/strict';
 import extension from './src/index.ts';
 for (const failure of ['context','exit','timeout','json','layout']) {
  process.env.HC_TERMINAL_ID=failure==='context'?'':'t7';
  let handler;const errors=[];let calls=0;
  extension({registerCommand:(_n,o)=>handler=o.handler,registerShortcut:()=>{},exec:async()=>{
   calls++;
   return {code:failure==='exit'?1:0,killed:failure==='timeout',stdout:failure==='json'?'broken':'{}'};
  }});
  const ctx={mode:'tui',ui:{notify:(message,level)=>errors.push({message,level}),pasteToEditor:()=>assert.fail('must not insert')},modelRegistry:{refresh:()=>assert.fail('must not load models')}};
  await handler('',ctx);
  assert.equal(errors.length,1,failure);
  assert.equal(errors[0].level,'error',failure);
  assert.equal(calls,failure==='context'?0:1);
 }
 console.log('failures preserve draft');
 `;
 const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/failures preserve draft/);
});
