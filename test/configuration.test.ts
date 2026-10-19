import {test} from 'node:test';
import assert from 'node:assert/strict';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {childArguments} from '../src/launch.ts';

test('Pi argument parser preserves value boundaries and positional terminator',()=>{
 assert.deepEqual(childArguments(['--append-system-prompt','--approve'],'/original'),[]);
 assert.deepEqual(childArguments(['--system-prompt','-e','ordinary prompt'],'/original'),[]);
 assert.deepEqual(childArguments(['--','--api-key','-e','--approve'],'/original'),[]);
 assert.deepEqual(childArguments(['--name','--no-extensions'],'/original'),[]);
 assert.deepEqual(childArguments(['--no-approve'],'/original'),['--no-approve']);
});
test('extension paths normalize home, file URLs, and original invocation directory',()=>{
 assert.deepEqual(childArguments(['-e','~/extensions/example.ts'],'/original'),['-e',join(homedir(),'extensions/example.ts')]);
 assert.deepEqual(childArguments(['-e',pathToFileURL('/tmp/path π/example.ts').href],'/other'),['-e','/tmp/path π/example.ts']);
 assert.deepEqual(childArguments(['-e','relative.ts'],'/original'),['-e','/original/relative.ts']);
});
test('remote extension source forms are rejected before local resolution',()=>{
 for(const path of ['https://github.com/example/tools','ssh://git@github.com/example/tools','git@github.com:example/tools','npm:tools','git:github.com/example/tools'])assert.throws(()=>childArguments(['-e',path],'/original'),/persistently/);
});

test('remote classification trims whitespace without changing actual local paths',()=>{
 for(const remote of [' https://github.com/example/tools',' ssh://git@github.com/example/tools',' git:github.com/example/tools'])assert.throws(()=>childArguments(['-e',remote],'/original'),/persistently/);
 assert.deepEqual(childArguments(['-e',' local.ts'],'/original'),['-e','/original/ local.ts']);
});
