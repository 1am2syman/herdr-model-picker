import type { LaunchOrigin } from './launch.ts';

/** Resolve only a local terminal in the app serving this machine. Never use UI focus. */
export function launchOrigin(layout: unknown, terminalId: string, cwd: string): LaunchOrigin {
  const matches: LaunchOrigin[] = [];
  if (isRecord(layout) && Array.isArray(layout.spaces)) {
    for (const space of layout.spaces) {
      if (!isRecord(space) || typeof space.id !== 'string' || (space.machine != null && space.machine !== '') || !Array.isArray(space.tabs)) continue;
      for (const tab of space.tabs) {
        if (!isRecord(tab) || !Array.isArray(tab.terminals)) continue;
        for (const terminal of tab.terminals) {
          if (isRecord(terminal) && terminal.terminal === terminalId && typeof terminal.pane === 'string' && terminal.pane) {
            matches.push({ terminalId, spaceId: space.id, paneId: terminal.pane, cwd });
          }
        }
      }
    }
  }
  if (matches.length !== 1) throw new Error('Cannot locate this hc terminal in the local Herdr app. Open Pi in a local herdr-app pane and retry.');
  return matches[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
