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

const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
export const quotePosix = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
export const shellWord = (text: string) => SAFE.test(text) ? text : quotePosix(text);

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
    if (!value || /[\0\r\n]/.test(value)) throw new Error('Launch identifiers and paths must be nonempty and contain no control characters');
  }
  if (!['tab', 'right', 'down'].includes(data.selection.destination)) throw new Error('Invalid destination');
  if (data.selection.effort !== null && !['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(data.selection.effort)) throw new Error('Invalid effort');
}

export const PANE_PLACEHOLDER = 'STEP2_PANE_ID';
export const NAME_PLACEHOLDER = 'STEP2_AGENT_NAME';

/** Exact argv for the two Herdr calls; no shell interpretation. */
export function launchCommands(data: LaunchData) {
  const env = `PI_CODING_AGENT_DIR=${data.child.agentDir}`;
  const create = data.selection.destination === 'tab'
    ? ['herdr', 'tab', 'create', '--workspace', data.origin.workspaceId, '--cwd', data.origin.cwd, '--env', env, '--no-focus']
    : ['herdr', 'pane', 'split', '--pane', data.origin.paneId, '--direction', data.selection.destination, '--cwd', data.origin.cwd, '--env', env, '--no-focus'];
  const start = ['herdr', 'agent', 'start', NAME_PLACEHOLDER, '--kind', 'pi', '--pane', PANE_PLACEHOLDER, '--', ...data.child.args,
    '--provider', data.selection.providerId, '--model', data.selection.modelId,
    ...(data.selection.effort === null ? [] : ['--thinking', data.selection.effort])];
  return { create, start };
}

export function renderLaunch(data: LaunchData): string {
  validateLaunch(data);
  const { create, start } = launchCommands(data);
  const line = (argv: string[]) => argv.map(shellWord).join(' ');
  const panePath = data.selection.destination === 'tab' ? '.result.root_pane.pane_id' : '.result.pane.pane_id';
  const where = data.selection.destination === 'tab' ? `new tab in workspace ${data.origin.workspaceId}` : `split ${data.selection.destination} of pane ${data.origin.paneId}`;
  return `\n\nLaunch one interactive Pi agent in Herdr with exactly these settings: provider ${data.selection.providerId}, model ${data.selection.modelId}`
    + `${data.selection.effort === null ? '' : `, thinking ${data.selection.effort}`}, ${where}, cwd ${data.origin.cwd}.\n`
    + `Run step 1, then run step 2 with ${PANE_PLACEHOLDER} replaced by the pane ID from ${panePath} in step 1's JSON, `
    + `and ${NAME_PLACEHOLDER} replaced by an agent name you choose: lowercase, matching [a-z][a-z0-9_-]{0,31}, unique among live agents. `
    + 'Use the remaining commands and values unchanged; do not look up models or rewrite flags.\n\n'
    + "```sh\n" + line(create) + "\n```\n\n```sh\n" + line(start) + "\n```\n\n";
}
