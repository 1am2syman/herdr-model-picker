import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('actual extension anchors relative agent directory before opening a different session cwd',()=>{
 const script=`
 import extension from './src/index.ts';
 import {resolve} from 'node:path';
 const initial=process.cwd();let handler;
 extension({registerCommand:(_name,options)=>{handler=options.handler},registerShortcut:()=>{}});
 let captured;
 const ctx={mode:'tui',cwd:'/tmp',isProjectTrusted:()=>false,modelRegistry:{refresh:async()=>{},getAvailable:()=>[]},ui:{notify:()=>{}}};
 // SettingsManager.create receives the anchored directory; intercept its public factory.
 const {SettingsManager}=await import('@earendil-works/pi-coding-agent');
 SettingsManager.create=(cwd,agentDir)=>{captured={cwd,agentDir};return {}};
 await handler('',ctx);
 if(captured.cwd!=='/tmp'||captured.agentDir!==resolve(initial,'./synthetic-relative-agent'))throw Error(JSON.stringify(captured));
 console.log('anchored');
 `;
 const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{cwd:process.cwd(),env:{...process.env,PI_CODING_AGENT_DIR:'./synthetic-relative-agent',HERDR_ENV:'1',HERDR_WORKSPACE_ID:'w1',HERDR_PANE_ID:'w1:p1'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/anchored/);
});
