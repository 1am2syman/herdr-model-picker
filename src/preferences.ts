import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { KeyId } from '@earendil-works/pi-tui';
import type { Destination, LaunchSelection } from './launch.ts';

export interface Preferences { version: 1; shortcut?: KeyId; destination: Destination; efforts: Record<string, string> }
export const modelKey = (provider: string, id: string) => JSON.stringify([provider, id]);
export const preferencePath = (agentDir: string) => join(agentDir, 'herdr-model-picker.json');
export function parsePreferences(text: string): Preferences {
  const fallback: Preferences = { version: 1, destination: 'tab', efforts: Object.create(null) };
  try {
    const value = JSON.parse(text);
    if (value?.version !== 1) return fallback;
    if (['tab', 'right', 'down'].includes(value.destination)) fallback.destination = value.destination;
    if (typeof value.shortcut === 'string') fallback.shortcut = value.shortcut as KeyId;
    if (value.efforts && typeof value.efforts === 'object' && !Array.isArray(value.efforts)) {
      for (const [key, effort] of Object.entries(value.efforts)) if (typeof effort === 'string') fallback.efforts[key] = effort;
    }
  } catch { /* Invalid settings use defaults. */ }
  return fallback;
}
export function loadPreferences(path: string): Preferences {
  try { return parsePreferences(readFileSync(path, 'utf8')); } catch { return parsePreferences(''); }
}
export async function savePreferences(path: string, selection: LaunchSelection): Promise<void> {
  const lock = `${path}.lock`;
  // A crashed writer leaves an actionable error rather than risking another writer's lock.
  await mkdir(join(path, '..'), { recursive: true });
  let acquired = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await mkdir(lock); acquired = true; break; }
    catch (error: any) { if (error.code !== 'EEXIST') throw error; await new Promise(resolve => setTimeout(resolve, 25)); }
  }
  if (!acquired) throw new Error(`Preferences busy: remove ${lock} only if no writer is active`);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    let text = ''; try { text = await readFile(path, 'utf8'); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    const prefs = parsePreferences(text);
    prefs.destination = selection.destination;
    if (selection.effort !== null) prefs.efforts[modelKey(selection.providerId, selection.modelId)] = selection.effort;
    await writeFile(temporary, `${JSON.stringify(prefs, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); await rm(lock, { recursive: true }); }
}
