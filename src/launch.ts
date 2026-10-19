import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '@earendil-works/pi-coding-agent';
import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
export type Destination = 'tab' | 'right' | 'down';
export interface LaunchSelection { providerId: string; modelId: string; effort: ModelThinkingLevel | null; destination: Destination }
export interface LaunchOrigin { workspaceId: string; paneId: string; cwd: string }
export interface ChildConfiguration { agentDir: string; args: string[] }
export interface LaunchData { selection: LaunchSelection; origin: LaunchOrigin; child: ChildConfiguration }
export const quotePosix = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
export function childArguments(argv: string[], invocationCwd: string): string[] {
  const parsed = parseArgs(argv);
  if (parsed.apiKey !== undefined) throw new Error('Session-only API keys cannot be reproduced. Configure authentication in Pi first.');
  const result: string[] = [];
  if (parsed.noExtensions) result.push('--no-extensions');
  if (parsed.projectTrustOverride !== undefined) result.push(parsed.projectTrustOverride ? '--approve' : '--no-approve');
  for (const path of parsed.extensions ?? []) {
    if (/^(?:npm:|git:|https?:|ssh:|git@|github:)/.test(path.trim())) throw new Error('Install explicit package extensions persistently before launching a child');
    const normalized = path.startsWith('builtin:') ? path : path.startsWith('file:') ? fileURLToPath(path)
      : resolve(invocationCwd, path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);
    result.push('-e', normalized);
  }
  return result;
}
export function validateLaunch(data: LaunchData): void {
  for (const value of [data.selection.providerId, data.selection.modelId, data.origin.workspaceId, data.origin.paneId, data.origin.cwd, data.child.agentDir, ...data.child.args]) {
    if (!value || value.includes('\0')) throw new Error('Launch identifiers and paths must be nonempty and contain no NUL');
  }
  if (!['tab', 'right', 'down'].includes(data.selection.destination)) throw new Error('Invalid destination');
  if (data.selection.effort !== null && !['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(data.selection.effort)) throw new Error('Invalid effort');
}

export function renderLaunch(data: LaunchData): string {
  validateLaunch(data);
  return `\n\nExecute this ready-to-run launch block unchanged after prompt submission. Model selection is complete; no model lookup or command rewriting is needed. Use its returned agentName/paneId to send the surrounding task afterward. On failure inspect the reported state before retrying.\n\n\`\`\`sh\nnode --input-type=module -e ${quotePosix(readFileSync(new URL('./launch-program.mjs', import.meta.url), 'utf8'))} ${quotePosix(JSON.stringify(data))}\n\`\`\`\n\n`;
}
