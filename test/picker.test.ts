import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Editor, visibleWidth, getKeybindings, setKeybindings, KeybindingsManager, TUI_KEYBINDINGS, type TUI } from '@earendil-works/pi-tui';
import { initTheme, getSelectListTheme, SettingsManager, type Theme } from '@earendil-works/pi-coding-agent';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import { Picker } from '../src/picker.ts';
import { effortChoice } from '../src/models.ts';
import { parsePreferences, modelKey } from '../src/preferences.ts';
import { renderLaunch, type LaunchData } from '../src/launch.ts';
initTheme('dark',false);
const theme={fg:(_color:string,text:string)=>text} as Theme;
const reasoning=getBuiltinModel('openai','gpt-5.4')!;
const ordinary={...reasoning,id:'plain',reasoning:false};
const prefs=parsePreferences('');
const settings=SettingsManager.inMemory({defaultThinkingLevel:'high'});
const choices=[effortChoice(reasoning,prefs,settings),effortChoice(ordinary,prefs,settings)];
test('reasoning uses Pi default, exact remembered pair, supported adjustment, and skips nonreasoning',()=>{
 assert.equal(choices[0].initialEffort,'high'); assert.equal(choices[1].initialEffort,null);
 const saved=parsePreferences('');saved.efforts[modelKey(reasoning.provider,reasoning.id)]='removed';
 const choice=effortChoice(reasoning,saved,settings);assert.equal(choice.initialEffort,'high');assert.match(choice.adjustment!,/unavailable/);
 saved.efforts[modelKey(reasoning.provider,reasoning.id)]='low';assert.equal(effortChoice(reasoning,saved,settings).initialEffort,'low');
});
test('back navigation and cancel do not complete selection; search is retained',()=>{
 let result:any='pending';const picker=new Picker(choices,prefs,theme,()=>{},value=>result=value);
 picker.focused=true;picker.handleInput('gpt');picker.handleInput('\r');assert.match(picker.render(80).join(' '),/effort/);
 picker.handleInput('\r');assert.match(picker.render(80).join(' '),/destination/);
 picker.handleInput('\x1b');assert.match(picker.render(80).join(' '),/effort/);
 picker.handleInput('\x1b');assert.match(picker.render(80).join(' '),/Search: gpt/);
 assert.equal(result,'pending');picker.handleInput('\x1b');assert.equal(result,undefined);
});
test('nonreasoning skips effort and completes only on destination confirmation',()=>{
 let result:any;const picker=new Picker([choices[1]],prefs,theme,()=>{},value=>result=value);
 picker.handleInput('\r');assert.match(picker.render(80).join(' '),/destination/);assert.equal(result,undefined);
 picker.handleInput('\x1b');assert.match(picker.render(80).join(' '),/model/);
 picker.handleInput('\r');picker.handleInput('\x1b[B');picker.handleInput('\r');assert.equal(result!.destination,'right');assert.equal(result!.effort,null);
});
test('render fits narrow and wide terminal widths after resize',()=>{
 const picker=new Picker(choices,prefs,theme,()=>{},()=>{});
 for(const width of [12,30,80,120])for(const line of picker.render(width))assert.ok(visibleWidth(line)<=width);
});
test('actual Pi Editor bracketed paste preserves Unicode/multiline cursor and single undo',()=>{
 const tui={requestRender(){},terminal:{columns:100,rows:40}} as unknown as TUI;
 const editor=new Editor(tui,{borderColor:text=>text,selectList:getSelectListTheme()});
 const before='first π\nleft 😀RIGHT\nlast';editor.setText(before);
 editor.handleInput('\x1b[A');editor.handleInput('\x01');for(let i=0;i<6;i++)editor.handleInput('\x1b[C');
 const cursor=editor.getCursor();const lines=before.split('\n');
 const prefix=lines.slice(0,cursor.line).join('\n')+(cursor.line?'\n':'')+lines[cursor.line].slice(0,cursor.col);
 const suffix=lines[cursor.line].slice(cursor.col)+(cursor.line<lines.length-1?'\n'+lines.slice(cursor.line+1).join('\n'):'');
 const data:LaunchData={selection:{providerId:'p',modelId:'m',effort:'high',destination:'tab'},origin:{workspaceId:'w1',paneId:'w1:p1',cwd:'/tmp'},child:{agentDir:'/tmp',args:[]}};
 const block=renderLaunch(data);editor.handleInput('\x1b[200~'+block+'\x1b[201~');
 assert.equal(editor.getExpandedText(),prefix+block+suffix);
 editor.handleInput('\x1f');assert.equal(editor.getExpandedText(),before);assert.deepEqual(editor.getCursor(),cursor);
});
test('remapped select actions reach the list before the search input',()=>{
 const previous=getKeybindings();
 const keys=new KeybindingsManager(TUI_KEYBINDINGS,{'tui.select.confirm':'ctrl+y','tui.select.down':'ctrl+n','tui.select.cancel':'ctrl+q'});
 setKeybindings(keys);
 try {
  let result:any='pending'; const picker=new Picker(choices,prefs,theme,()=>{},value=>result=value,keys);
  picker.handleInput('\x19');assert.match(picker.render(80).join(' '),/effort/);
  picker.handleInput('\x11');assert.match(picker.render(80).join(' '),/model/);
  picker.handleInput('\x0e');picker.handleInput('\x19');assert.match(picker.render(80).join(' '),/destination/);
  picker.handleInput('\x19');assert.equal(result.modelId,'plain');
 }finally{setKeybindings(previous);}
});
test('Ctrl+C can be remapped to confirm while Escape deliberately stays back/cancel',()=>{
 const previous=getKeybindings();
 const keys=new KeybindingsManager(TUI_KEYBINDINGS,{'tui.select.confirm':'ctrl+c','tui.select.cancel':'ctrl+q'});
 setKeybindings(keys);
 try {
  let result:any='pending';const picker=new Picker(choices,prefs,theme,()=>{},value=>result=value,keys);
  picker.handleInput('\x03');assert.match(picker.render(80).join(' '),/effort/);
  picker.handleInput('\x1b');assert.match(picker.render(80).join(' '),/Search:/);
  picker.handleInput('\x03');picker.handleInput('\x03');picker.handleInput('\x03');
  assert.equal(result.modelId,reasoning.id);assert.equal(result.effort,'high');
 }finally{setKeybindings(previous);}
});
test('selected row remains visible when terminal height shrinks',()=>{
 let rows=40;const many=Array.from({length:16},(_,i)=>({...choices[0],model:{...reasoning,id:'model-'+i}}));
 const picker=new Picker(many,prefs,theme,()=>{},()=>{},getKeybindings(),()=>rows);
 for(let i=0;i<15;i++)picker.handleInput('\x1b[B');
 for(rows of [40,10,7,4,20]) {
  const lines=picker.render(100);assert.ok(lines.length<=Math.floor(rows*0.9));assert.ok(lines.some(line=>line.includes('→')&&line.includes('model-15')),lines.join('\n'));
 }
});
