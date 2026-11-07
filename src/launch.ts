import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { parseArgs } from '@earendil-works/pi-coding-agent';
import type { ModelThinkingLevel } from '@earendil-works/pi-ai';

export type Destination = 'tab' | 'right' | 'down';
export interface LaunchSelection { providerId: string; modelId: string; effort: ModelThinkingLevel | null; destination: Destination; agentName?: string }
export interface LaunchOrigin { terminalId: string; spaceId: string; paneId: string; cwd: string }
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
  for (const value of [data.selection.providerId, data.selection.modelId, data.origin.terminalId, data.origin.spaceId, data.origin.paneId, data.origin.cwd, data.child.agentDir, ...data.child.args]) {
    if (!value || /[\0\r\n]/.test(value)) throw new Error('Launch identifiers and paths must be nonempty and contain no control characters');
  }
  if (!['tab', 'right', 'down'].includes(data.selection.destination)) throw new Error('Invalid destination');
  if (data.selection.effort !== null && !['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(data.selection.effort)) throw new Error('Invalid effort');
}

export const TERMINAL_PLACEHOLDER = 'STEP1_TERMINAL_ADDRESS';
export const AGENT_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
export const generatedAgentName = () => `pi-${randomBytes(12).toString('hex')}`;

/** Exact argv for hc startup and app placement; no shell interpretation. */
export function launchCommands(data: LaunchData, name: string) {
  const start = ['hc', 'run', '--bg', '--json', '--name', name, '--cwd', data.origin.cwd,
    '--parent', data.origin.terminalId, '--outlive-parent', '--',
    '/usr/bin/env', `PI_CODING_AGENT_DIR=${data.child.agentDir}`, 'pi', ...data.child.args,
    '--provider', data.selection.providerId, '--model', data.selection.modelId,
    ...(data.selection.effort === null ? [] : ['--thinking', data.selection.effort])];
  const focus = ['herdr-app', 'do', 'pane.focus', JSON.stringify({ pane: data.origin.paneId })];
  const place = ['herdr-app', 'do', 'terminal.keep', JSON.stringify({ terminal: TERMINAL_PLACEHOLDER, place: data.selection.destination })];
  return { start, focus, place };
}

export function renderLaunch(data: LaunchData, name: string): string {
  validateLaunch(data);
  if (!AGENT_NAME_PATTERN.test(name)) throw new Error('Invalid agent name');
  const { start, focus, place } = launchCommands(data, name);
  const line = (argv: string[]) => argv.map(shellWord).join(' ');
  const where = data.selection.destination === 'tab' ? `new tab in space ${data.origin.spaceId}` : `split ${data.selection.destination} of pane ${data.origin.paneId}`;
  return `\n\nLaunch one interactive Pi agent with exactly these settings: provider ${data.selection.providerId}, model ${data.selection.modelId}`
    + `${data.selection.effort === null ? '' : `, thinking ${data.selection.effort}`}, ${where}, cwd ${data.origin.cwd}.\n`
    + `Run step 1 once; replace ${TERMINAL_PLACEHOLDER} in step 3 with .address from its JSON. `
    + 'Run steps 2 and 3 in order; stop on any error. Placement focuses the child and may return pending; confirm it in herdr-app ls. '
    + 'Before sending a task, use hc wait <address>; confirm idle, or inspect hc read <address> if blocked/error. '
    + 'Use these commands unchanged; do not look up models, choose names, or rewrite flags.\n\n'
    + [start, focus, place].map(command => "```sh\n" + line(command) + "\n```\n\n").join('');
}
