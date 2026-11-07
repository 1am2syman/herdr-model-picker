import type { Destination } from './launch.ts';

/**
 * Where the app should show the new terminal. `app` targets an exact pane and
 * needs herdr-app on this machine; `labels` works through the core alone, so it
 * also works when the app runs on another machine and reaches this core.
 */
export type Placement =
  | { kind: 'app'; spaceId: string; paneId: string }
  | { kind: 'labels'; spaceId: string; tabId?: string };

export interface CommandResult { code: number | null; stdout: string; stderr?: string; killed?: boolean }
export type Exec = (command: string, args: string[], options: { timeout: number }) => Promise<CommandResult>;

type Probe = { ok: true; stdout: string } | { ok: false; failure: string };

const APP_TIMEOUT = 5000;
const CORE_TIMEOUT = 5000;

/** The app adopts labelled terminals itself; that way it can make a tab or a right split only. */
export const destinationsFor = (placement: Placement): Destination[] =>
  placement.kind === 'app' ? ['tab', 'right', 'down'] : ['tab', 'right'];

/**
 * Resolve placement for this terminal, preferring the app CLI because it can
 * target an exact pane and split down. Both probes are read-only.
 */
export async function resolvePlacement(exec: Exec, terminalId: string): Promise<Placement> {
  const app = await probeApp(exec, terminalId);
  if (app.placement) return app.placement;
  const labels = await probeLabels(exec, terminalId);
  if (labels.placement) return labels.placement;
  throw new Error(
    'Herdr does not show this terminal, so a new tab or split has nowhere to go. '
    + `Open Pi in a herdr-app terminal pane and retry. (app: ${app.diagnostic}; core: ${labels.diagnostic})`,
  );
}

/** A local pane only: a remote space belongs to the app on that other machine. */
export function appPlacement(layout: unknown, terminalId: string): Placement | undefined {
  const matches: Placement[] = [];
  for (const space of records(record(layout)?.spaces)) {
    if (!isRecord(space) || typeof space.id !== 'string' || (space.machine != null && space.machine !== '')) continue;
    for (const tab of records(space.tabs)) {
      if (!isRecord(tab)) continue;
      for (const terminal of records(tab.terminals)) {
        if (isRecord(terminal) && terminal.terminal === terminalId && typeof terminal.pane === 'string' && terminal.pane) {
          matches.push({ kind: 'app', spaceId: space.id, paneId: terminal.pane });
        }
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

/** The app writes these onto every terminal it shows. */
export function labelPlacement(terminal: unknown): Placement | undefined {
  const labels = record(terminal)?.labels;
  if (!isRecord(labels)) return undefined;
  const spaceId = typeof labels['herdr.space'] === 'string' ? labels['herdr.space'] : '';
  if (!spaceId) return undefined;
  const placement: Placement = { kind: 'labels', spaceId };
  const tabId = labels['herdr.tab'];
  if (typeof tabId === 'string' && tabId) placement.tabId = tabId;
  return placement;
}

async function probeApp(exec: Exec, terminalId: string) {
  const result = await run(exec, 'herdr-app', ['ls']);
  if (!result.ok) return { placement: undefined, diagnostic: `herdr-app ${result.failure}` };
  let layout: unknown;
  try { layout = JSON.parse(result.stdout); } catch { return { placement: undefined, diagnostic: 'herdr-app returned unreadable JSON' }; }
  const placement = appPlacement(layout, terminalId);
  return { placement, diagnostic: placement ? 'ok' : `herdr-app does not show ${terminalId}` };
}

async function probeLabels(exec: Exec, terminalId: string) {
  const result = await run(exec, 'hc', ['get', terminalId, '--json']);
  if (!result.ok) return { placement: undefined, diagnostic: `hc get ${terminalId}: ${result.failure}` };
  let terminal: unknown;
  try { terminal = JSON.parse(result.stdout); } catch { return { placement: undefined, diagnostic: 'hc get returned unreadable JSON' }; }
  const placement = labelPlacement(terminal);
  return { placement, diagnostic: placement ? 'ok' : `${terminalId} has no herdr.space label` };
}

async function run(exec: Exec, command: string, args: string[]): Promise<Probe> {
  try {
    const result = await exec(command, args, { timeout: command === 'herdr-app' ? APP_TIMEOUT : CORE_TIMEOUT });
    if (result.killed) return { ok: false, failure: 'timed out' };
    if (result.code !== 0) return { ok: false, failure: (result.stderr ?? '').trim().split('\n').at(-1) || `exited ${result.code}` };
    return { ok: true, stdout: result.stdout };
  } catch (error) {
    return { ok: false, failure: String((error as NodeJS.ErrnoException).code ?? error) };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const record = (value: unknown) => (isRecord(value) ? value : undefined);
const records = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
