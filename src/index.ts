import { resolve } from 'node:path';
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { loadModels } from './models.ts';
import { childArguments, generatedAgentName, renderLaunch, type LaunchData } from './launch.ts';
import { loadPreferences, preferencePath, savePreferences } from './preferences.ts';
import { pick } from './picker.ts';
import { launchOrigin } from './origin.ts';
export default function(pi: ExtensionAPI) {
  const invocationCwd = process.cwd();
  const agentDir = resolve(invocationCwd, getAgentDir());
  const path = preferencePath(agentDir);
  let active = false;
  async function open(ctx: ExtensionContext) {
    if (ctx.mode !== 'tui') { ctx.ui.notify('Herdr model picker requires Pi terminal UI mode.', 'warning'); return; }
    if (active) return;
    active = true;
    try {
      const terminalId = process.env.HC_TERMINAL_ID;
      if (!terminalId) throw new Error('Open Pi in a herdr-core terminal shown in the local Herdr app to prepare a launch.');
      const layout = await pi.exec('herdr-app', ['ls'], { timeout: 5000 });
      if (layout.code !== 0 || layout.killed) throw new Error('Cannot reach herdr-app. Install it on this machine, open its window, and retry.');
      const origin = launchOrigin(JSON.parse(layout.stdout), terminalId, ctx.cwd);
      const args = childArguments(process.argv.slice(2), invocationCwd);
      const prefs = loadPreferences(path);
      const choices = await loadModels(ctx,prefs,agentDir);
      if (!choices.length) { ctx.ui.notify('No available Pi models. Configure a provider and authenticate, then reopen the picker.', 'warning'); return; }
      const draft = ctx.ui.getEditorText();
      let data: LaunchData | undefined;
      const selection = await pick(ctx,choices,prefs, async selection => {
        data = {selection,origin,child:{agentDir,args}};
      });
      if (!selection || !data) return;
      if (ctx.ui.getEditorText() !== draft) throw new Error('Draft changed while preparing the command; reopen the picker.');
      ctx.ui.pasteToEditor(renderLaunch(data, selection.agentName ?? generatedAgentName()));
      try { await savePreferences(path,selection); } catch(error) { ctx.ui.notify(`Launch inserted, but preferences could not be saved: ${String(error)}`, 'warning'); }
    } catch(error) { ctx.ui.notify(String(error), 'error'); }
    finally { active = false; }
  }
  pi.registerCommand('herdr-model-picker',{description:'Insert a prepared Pi launch for a Herdr tab or split',handler:(_args,ctx) => open(ctx)});
  pi.registerShortcut(loadPreferences(path).shortcut ?? 'ctrl+alt+l',{description:'Prepare a new Herdr Pi agent',handler:open});
}
