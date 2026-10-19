import { resolve } from 'node:path';
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { loadModels } from './models.ts';
import { childArguments, generatedAgentName, renderLaunch, type LaunchData } from './launch.ts';
import { loadPreferences, preferencePath, savePreferences } from './preferences.ts';
import { pick } from './picker.ts';
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
      if (process.env.HERDR_ENV !== '1' || !process.env.HERDR_WORKSPACE_ID || !process.env.HERDR_PANE_ID) throw new Error('Open Pi in a Herdr pane to prepare a launch.');
      const origin = {workspaceId:process.env.HERDR_WORKSPACE_ID,paneId:process.env.HERDR_PANE_ID,cwd:ctx.cwd};
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
