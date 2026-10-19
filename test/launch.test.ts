import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderLaunch, childArguments, type LaunchData } from '../src/launch.ts';

export function fixture(destination: 'tab' | 'right' | 'down' = 'tab'): LaunchData {
 return {selection:{providerId:"vendor'$(false)",modelId:'org/model; $HOME \n Unicode π',effort:'high',destination},origin:{workspaceId:'wTest',paneId:'wTest:pSource',cwd:process.cwd()},child:{agentDir:"/tmp/agent's π",args:[]}};
}

const executable = String.raw`#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const args=process.argv.slice(2);const command=path.basename(process.argv[1]);
fs.appendFileSync(process.env.RECORD,JSON.stringify({command,args,cwd:process.cwd()})+'\n');
if(args[0]==='--version'){console.log('1.3.0');process.exit(0)}
if(command==='pi')process.exit(0);
let result={};
if(args[0]==='pane'&&args[1]==='get')result={pane:{pane_id:process.env.FAIL==='stale'?'gone':'wTest:pSource',workspace_id:'wTest'}};
if(args[0]==='tab'&&args[1]==='create'||args[0]==='pane'&&args[1]==='split'){
 if(process.env.FAIL==='creation')process.exit(1);
 if(process.env.FAIL==='json'){console.log('{');process.exit(0)}
 result={root_pane:{pane_id:'wTest:pReturned'},pane:{pane_id:'wTest:pReturned'}};
}
if(args[0]==='agent'){
 if(process.env.FAIL==='message-secret'){console.log(JSON.stringify({error:{message:'request failed: Authorization: Bearer SYNTHETIC_FOUR api_key=SYNTHETIC_FIVE'}}));console.error('Authorization: Bearer SYNTHETIC_SIX\nAuthorization: Basic SYNTHETIC_SEVEN');process.exit(1);}
 if(process.env.FAIL==='secret'){console.log(JSON.stringify({api_key:'SYNTHETIC_ONE',token:'SYNTHETIC_TWO','x-api-key':'SYNTHETIC_THREE',error:{code:'agent_not_ready',message:'Pi model resolution failed'}}));console.error('shell integration warning');process.exit(1);}
 if(process.env.FAIL==='startup'){console.error(JSON.stringify({error:{code:'agent_not_ready',message:'agent process exited before becoming interactive; Pi model resolution failed'}}));process.exit(1);}
 const started=require('node:child_process').spawnSync(process.execPath,[path.join(path.dirname(process.argv[1]),'pi'),...args.slice(args.indexOf('--')+1)],{env:process.env,encoding:'utf8'});
 if(started.status!==0)process.exit(1);
 result=process.env.FAIL==='empty-start'?{}:{type:'agent_started',agent:{agent:'pi',name:args[2],pane_id:args[args.indexOf('--pane')+1],interactive_ready:process.env.FAIL!=='not-ready'}};
}
console.log(JSON.stringify({result}));
`;
function execute(data:LaunchData,failure='') {
 const root=mkdtempSync(join(tmpdir(),'picker-launch-test-')); const record=join(root,'record.jsonl');
 const cwd=join(root,"cwd ' π $(false)");mkdirSync(cwd);data.origin.cwd=cwd;
 for(const name of ['pi','herdr']){const path=join(root,name);writeFileSync(path,executable);chmodSync(path,0o755);}
 try {
 const block=renderLaunch(data);const command=block.split('```sh\n')[1].split('\n```')[0];
 const response=spawnSync('/bin/sh',['-c',command],{env:{...process.env,PATH:root+':'+process.env.PATH,HERDR_ENV:'1',RECORD:record,FAIL:failure},encoding:'utf8'});
 const records=readFileSync(record,'utf8').trim().split('\n').map(line=>JSON.parse(line));
 return {response,records};
 }finally{rmSync(root,{recursive:true,force:true});}
}
for(const destination of ['tab','right','down'] as const)test('standalone block safely launches '+destination,()=>{
 const data=fixture(destination);const {response,records}=execute(data);
 assert.equal(response.status,0,response.stderr);const output=JSON.parse(response.stdout);assert.equal(output.paneId,'wTest:pReturned');assert.match(output.agentName,/^pi-[a-f0-9]{24}$/);
 const creation=records.find(row=>row.args[1]===(destination==='tab'?'create':'split'));assert.ok(creation);assert.ok(creation.args.includes('--no-focus'));
 assert.equal(creation.args[creation.args.indexOf(destination==='tab'?'--workspace':'--pane')+1],destination==='tab'?'wTest':'wTest:pSource');
 assert.equal(creation.args[creation.args.indexOf('--cwd')+1],data.origin.cwd);
 const start=records.find(row=>row.args[0]==='agent');assert.equal(start.args[start.args.indexOf('--pane')+1],'wTest:pReturned');
 for(const [flag,value]of [['--provider',data.selection.providerId],['--model',data.selection.modelId],['--thinking','high']])assert.equal(start.args[start.args.indexOf(flag)+1],value);
 assert.equal(start.args[start.args.indexOf('--')+1],'--provider');
 assert.equal(records.filter(row=>row.args[1]==='create'||row.args[1]==='split').length,1);
});
for(const failure of ['stale','creation','json','startup','empty-start','not-ready'])test('failure '+failure+' never retries or substitutes',()=>{
 const {response,records}=execute(fixture(),failure);assert.equal(response.status,1,response.stdout+response.stderr);
 const output=JSON.parse(response.stderr);assert.equal(output.ok,false);
 const creationCount=records.filter(row=>row.args[1]==='create').length;assert.equal(creationCount,['stale'].includes(failure)?0:1);
 assert.equal(records.filter(row=>row.args[0]==='agent').length,['startup','empty-start','not-ready'].includes(failure)?1:0);
 if(failure==='startup'){assert.equal(output.paneId,'wTest:pReturned');assert.match(output.error,/agent_not_ready/);assert.match(output.error,/model resolution failed/);}
});
test('nonreasoning omits thinking flag; runtime API key rejected; extension paths absolute',()=>{
 const data=fixture();data.selection.effort=null;const {response,records}=execute(data);assert.equal(response.status,0,response.stderr);
 assert.ok(!records.find(row=>row.args[0]==='agent').args.includes('--thinking'));
 assert.throws(()=>childArguments(['--api-key','secret'],process.cwd()),/Session-only/);
 assert.deepEqual(childArguments(['-e','./extension.ts','--continue','--no-extensions'], '/tmp'),['--no-extensions','-e','/tmp/extension.ts']);
});

test('diagnostics retain both streams while redacting structured credentials',()=>{
 const {response}=execute(fixture(),'secret');
 assert.equal(response.status,1);
 assert.match(response.stderr,/agent_not_ready/);assert.match(response.stderr,/Pi model resolution failed/);assert.match(response.stderr,/shell integration warning/);
 for(const secret of ['SYNTHETIC_ONE','SYNTHETIC_TWO','SYNTHETIC_THREE'])assert.ok(!response.stderr.includes(secret));
});

test('JSON message strings and complete authorization schemes redact credentials',()=>{
 const {response}=execute(fixture(),'message-secret');assert.equal(response.status,1);assert.match(response.stderr,/request failed/);
 for(const secret of ['SYNTHETIC_FOUR','SYNTHETIC_FIVE','SYNTHETIC_SIX','SYNTHETIC_SEVEN'])assert.ok(!response.stderr.includes(secret),response.stderr);
});
