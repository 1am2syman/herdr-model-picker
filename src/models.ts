import { clampThinkingLevel, getSupportedThinkingLevels, type Api, type Model, type ModelThinkingLevel } from '@earendil-works/pi-ai';
import { SettingsManager, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { modelKey, type Preferences } from './preferences.ts';
export interface ModelChoice { model: Model<Api>; levels: ModelThinkingLevel[]; initialEffort: ModelThinkingLevel | null; adjustment?: string; unavailable?: string }
export function effortChoice(model: Model<Api>, prefs: Preferences, settings: Pick<SettingsManager, 'getModelThinkingLevel' | 'getDefaultThinkingLevel'>): Omit<ModelChoice, 'unavailable'> {
  const levels = getSupportedThinkingLevels(model);
  if (!model.reasoning || levels.length <= 1) return { model, levels: [], initialEffort: null };
  // Pi 1.3.0 SDK startup precedence, verified in core/sdk.js and defaults.js.
  const supportedDefault = clampThinkingLevel(model, settings.getModelThinkingLevel(model.provider, model.id) ?? settings.getDefaultThinkingLevel() ?? 'medium');
  const saved = prefs.efforts[modelKey(model.provider, model.id)];
  const valid = saved !== undefined && levels.includes(saved as ModelThinkingLevel);
  return { model, levels, initialEffort: valid ? saved as ModelThinkingLevel : supportedDefault,
    ...(saved !== undefined && !valid ? { adjustment: `Saved effort ${saved} is unavailable; using Pi default ${supportedDefault}.` } : {}) };
}
export async function loadModels(ctx: ExtensionContext, prefs: Preferences, agentDir: string): Promise<ModelChoice[]> {
  await ctx.modelRegistry.refresh({ allowNetwork: false });
  const settings = SettingsManager.create(ctx.cwd, agentDir, { projectTrusted: ctx.isProjectTrusted() });
  return ctx.modelRegistry.getAvailable().map(model => effortChoice(model, prefs, settings))
    .sort((a,b) => `${a.model.provider}/${a.model.id}`.localeCompare(`${b.model.provider}/${b.model.id}`));
}
