import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { parseArgs } from '@earendil-works/pi-coding-agent';
import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { Placement } from './placement.ts';

export type Destination = 'tab' | 'right' | 'down';
export interface LaunchSelection { providerId: string; modelId: string; effort: ModelThinkingLevel | null; destination: Destination; agentName?: string }
export interface LaunchOrigin { terminalId: string; cwd: string }
export interface ChildConfiguration { agentDir: string; args: string[] }
export interface LaunchData { selection: LaunchSelection; origin: LaunchOrigin; placement: Placement; child: ChildConfiguration }
export interface LaunchCommands { start: string[]; follow: string[][] }

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
  const placement = data.placement;
  const where = placement.kind === 'app'
    ? [placement.spaceId, placement.paneId]
    : [placement.spaceId, placement.tabId ?? ''];
  for (const value of [data.selection.providerId, data.selection.modelId, data.origin.terminalId, data.origin.cwd, data.child.agentDir, ...where, ...data.child.args]) {
    if (/[\0\r\n]/.test(value)) throw new Error('Launch identifiers and paths must contain no control characters');
  }
  for (const value of [data.selection.providerId, data.selection.modelId, data.origin.terminalId, data.origin.cwd, data.child.agentDir]) {
    if (!value) throw new Error('Launch identifiers and paths must be nonempty');
  }
  if (!placement.spaceId) throw new Error('Launch requires a Herdr space');
  if (!['tab', 'right', 'down'].includes(data.selection.destination)) throw new Error('Invalid destination');
  if (placement.kind === 'labels' && data.selection.destination === 'down') throw new Error('Splitting down needs herdr-app on this machine; labels can make a tab or a right split');
  if (placement.kind === 'app' && !placement.paneId) throw new Error('Launch requires the origin pane');
  if (placement.kind === 'labels' && data.selection.destination === 'right' && !placement.tabId) throw new Error('A right split needs the origin tab label');
  if (data.selection.effort !== null && !['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(data.selection.effort)) throw new Error('Invalid effort');
}

export const TERMINAL_PLACEHOLDER = 'STEP1_TERMINAL_ADDRESS';
export const AGENT_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
export const generatedAgentName = () => `pi-${randomBytes(12).toString('hex')}`;

/**
 * Exact argv for the launch and, when the app CLI is local, for placing the
 * terminal. Labels let the app place a terminal by itself, which also works
 * when the app runs on another machine.
 */
export function launchCommands(data: LaunchData, name: string): LaunchCommands {
  validateLaunch(data);
  const placement = data.placement;
  const labels = placement.kind === 'labels'
    ? ['--label', `herdr.space=${placement.spaceId}`, ...(data.selection.destination === 'right' ? ['--label', `herdr.tab=${placement.tabId}`] : [])]
    : [];
  const start = ['hc', 'run', '--bg', '--json', '--name', name, '--cwd', data.origin.cwd,
    '--parent', data.origin.terminalId, '--outlive-parent', ...labels, '--',
    '/usr/bin/env', `PI_CODING_AGENT_DIR=${data.child.agentDir}`, 'pi', ...data.child.args,
    '--provider', data.selection.providerId, '--model', data.selection.modelId,
    ...(data.selection.effort === null ? [] : ['--thinking', data.selection.effort])];
  if (placement.kind === 'labels') return { start, follow: [] };
  return { start, follow: [
    ['herdr-app', 'do', 'pane.focus', JSON.stringify({ pane: placement.paneId })],
    ['herdr-app', 'do', 'terminal.keep', JSON.stringify({ terminal: TERMINAL_PLACEHOLDER, place: data.selection.destination })],
  ] };
}

export function renderLaunch(data: LaunchData, name: string): string {
  validateLaunch(data);
  if (!AGENT_NAME_PATTERN.test(name)) throw new Error('Invalid agent name');
  const { start, follow } = launchCommands(data, name);
  const line = (argv: string[]) => argv.map(shellWord).join(' ');
  const placement = data.placement;
  const where = placement.kind === 'app'
    ? data.selection.destination === 'tab' ? `new tab in space ${placement.spaceId}` : `split ${data.selection.destination} of pane ${placement.paneId}`
    : data.selection.destination === 'tab' ? `new tab in space ${placement.spaceId}` : `right split in tab ${placement.tabId}`;
  const steps = follow.length
    ? `Run step 1 once; replace ${TERMINAL_PLACEHOLDER} in step 3 with .address from its JSON. `
      + 'Run steps 2 and 3 in order; stop on any error. Placement focuses the child and may return pending; confirm it in herdr-app ls. '
    : 'Run step 1 once. The app adopts the new terminal through its labels without moving your focus; it may take a moment to appear. ';
  return `\n\nLaunch one interactive Pi agent with exactly these settings: provider ${data.selection.providerId}, model ${data.selection.modelId}`
    + `${data.selection.effort === null ? '' : `, thinking ${data.selection.effort}`}, ${where}, cwd ${data.origin.cwd}.\n`
    + steps
    + 'Before sending a task, use hc wait <address>; confirm idle, or inspect hc read <address> if blocked/error. '
    + 'Use these commands unchanged; do not look up models, choose names, or rewrite flags.\n\n'
    + [start, ...follow].map(command => "```sh\n" + line(command) + "\n```\n\n").join('');
}
