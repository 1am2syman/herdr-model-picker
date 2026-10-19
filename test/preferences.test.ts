import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parsePreferences, savePreferences, loadPreferences, modelKey } from '../src/preferences.ts';

test('invalid and unknown-version preferences use defaults', () => {
 for(const text of ['{','null','{"version":5}','{"version":1,"efforts":[],"destination":"bad"}']) {
  const value = parsePreferences(text); assert.equal(value.destination,'tab'); assert.equal(Object.keys(value.efforts).length,0);
 }
});
test('concurrent writers preserve exact-pair effort choices and shortcut',async () => {
 const directory=await mkdtemp(join(tmpdir(),'picker-prefs-'));const path=join(directory,'preferences.json');
 try {
 await writeFile(path,JSON.stringify({version:1,shortcut:'ctrl+alt+k'}));
 await Promise.all(Array.from({length:8},(_,i)=>savePreferences(path,{providerId:'p'+i,modelId:'same',effort:'high',destination:'down'})));
 const prefs=loadPreferences(path); assert.equal(prefs.shortcut,'ctrl+alt+k');assert.equal(prefs.destination,'down');
 for(let i=0;i<8;i++)assert.equal(prefs.efforts[modelKey('p'+i,'same')],'high');
 await savePreferences(path,{providerId:'p0',modelId:'same',effort:null,destination:'right'});
 assert.equal(loadPreferences(path).efforts[modelKey('p0','same')],'high');
 } finally {await rm(directory,{recursive:true,force:true});}
});
