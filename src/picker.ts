import { Input, SelectList, getKeybindings, matchesKey, truncateToWidth, type Component, type KeybindingsManager } from '@earendil-works/pi-tui';
import { getSelectListTheme, type Theme, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { AGENT_NAME_PATTERN, type LaunchSelection, type Destination } from './launch.ts';
import type { ModelChoice } from './models.ts';
import type { Preferences } from './preferences.ts';

export class Picker implements Component {
  private input = new Input({ prompt: 'Search: ' });
  private nameInput = new Input({ prompt: 'Agent name (Enter for generated): ' });
  private list!: SelectList;
  private items: {value:string;label:string}[] = [];
  private visible = 8;
  private step: 'model' | 'effort' | 'destination' | 'name' = 'model';
  private choice?: ModelChoice;
  private effort: LaunchSelection['effort'] = null;
  private modelIndex = 0;
  private filtered: ModelChoice[] = [];
  private message = '';
  private _focused = false;
  get focused() { return this._focused; }
  set focused(value: boolean) { this._focused = value; this.input.focused = value && this.step === 'model'; this.nameInput.focused = value && this.step === 'name'; }
  constructor(private choices: ModelChoice[], private prefs: Preferences, private theme: Theme,
    private renderRequest: () => void, private done: (selection: LaunchSelection | undefined) => void,
    private keybindings: Pick<KeybindingsManager, 'matches'> = getKeybindings(), private availableRows: () => number = () => 40) { this.models(); }
  private makeList(items: { value: string; label: string }[], index = 0) {
    this.items = items;
    this.list = new SelectList(items, this.visible, getSelectListTheme());
    this.list.setSelectedIndex(Math.max(0, index));
    this.list.onCancel = () => this.back();
    this.list.onSelect = item => this.select(item.value);
  }
  private models() {
    this.step = 'model'; this.input.focused = this.focused;
    const terms = this.input.getValue().toLowerCase().split(/\s+/).filter(Boolean);
    this.filtered = this.choices.filter(({model}) => terms.every(term => `${model.provider} ${model.id} ${model.name}`.toLowerCase().includes(term)));
    this.makeList(this.filtered.map((choice, i) => ({ value: String(i), label: `${choice.model.provider} / ${choice.model.id} — ${choice.model.name}${choice.unavailable ? ' [unavailable]' : ''}` })), this.modelIndex);
  }
  private efforts() {
    this.step = 'effort'; this.input.focused = false;
    const choice = this.choice!;
    this.makeList(choice.levels.map(level => ({ value: level, label: level })), choice.levels.indexOf(this.effort!));
    this.message = choice.adjustment ?? '';
  }
  private destinations() {
    this.step = 'destination'; this.input.focused = false;
    this.makeList([{value:'tab',label:'New tab'},{value:'right',label:'Split right'},{value:'down',label:'Split down'}], ['tab','right','down'].indexOf(this.prefs.destination));
  }
  private select(value: string) {
    if (this.step === 'model') {
      this.modelIndex = Number(value); const choice = this.filtered[this.modelIndex];
      if (!choice) return;
      if (choice.unavailable) { this.message = choice.unavailable; return; }
      this.message = ''; this.choice = choice; this.effort = choice.initialEffort;
      if (choice.levels.length) this.efforts(); else this.destinations();
    } else if (this.step === 'effort') { this.effort = value as LaunchSelection['effort']; this.destinations(); }
    else if (this.step === 'destination') { this.destination = value as Destination; this.nameStep(); }
  }
  private destination: Destination = 'tab';
  private nameStep() {
    this.step = 'name'; this.message = '';
    this.input.focused = false; this.nameInput.focused = this.focused;
    this.nameInput.setValue('');
  }
  private confirmName() {
    const typed = this.nameInput.getValue().trim();
    if (typed && !AGENT_NAME_PATTERN.test(typed)) {
      this.message = 'Use lowercase a-z, 0-9, _ or -; start with a letter; max 32 characters.';
      return;
    }
    const model = this.choice!.model;
    this.done({ providerId:model.provider, modelId:model.id, effort:this.effort, destination:this.destination,
      ...(typed ? { agentName: typed } : {}) });
  }
  private back() {
    this.message = '';
    if (this.step === 'model') this.done(undefined);
    else if (this.step === 'name') { this.message = ''; this.destinations(); }
    else if (this.step === 'destination' && this.choice!.levels.length) this.efforts();
    else this.models();
  }
  handleInput(data: string) {
    if (this.step === 'name') {
      const confirmed = data === '\r' || data === '\n' || this.keybindings.matches(data, 'tui.select.confirm');
      if (confirmed) this.confirmName();
      else if (this.keybindings.matches(data, 'tui.select.cancel') || matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) this.back();
      else this.nameInput.handleInput(data);
      this.renderRequest();
      return;
    }
    const selectionAction = (['tui.select.up','tui.select.down','tui.select.confirm','tui.select.pageUp','tui.select.pageDown'] as const).some(action => this.keybindings.matches(data, action));
    if (matchesKey(data, 'escape')) this.back();
    else if (selectionAction) this.list.handleInput(data);
    else if (this.keybindings.matches(data, 'tui.select.cancel') || matchesKey(data, 'ctrl+c')) this.back();
    else if (this.step === 'model') {
      const previous = this.input.getValue(); this.input.handleInput(data);
      if (this.input.getValue() !== previous) { this.modelIndex = 0; this.models(); }
    } else this.list.handleInput(data);
    this.renderRequest();
  }
  render(width: number): string[] {
    const budget = Math.max(1, Math.floor(this.availableRows() * 0.9));
    const visible = Math.max(1, Math.min(8, budget - 5));
    if (visible !== this.visible) {
      const selected = this.list.getSelectedItem()?.value;
      this.visible = visible;
      this.makeList(this.items, Math.max(0, this.items.findIndex(item => item.value === selected)));
    }
    if (budget < 5) return this.list.render(width).slice(0, budget);
    const identity = this.choice && this.step !== 'model' ? `${this.choice.model.provider} / ${this.choice.model.id}` : '';
    if (this.step === 'name') {
      return [this.theme.fg('accent', 'Herdr Pi launch · name'), identity,
        ...this.nameInput.render(width), this.message, 'Enter confirm (blank = generated name) · Esc back']
        .filter(Boolean).map(line => truncateToWidth(line, width));
    }
    return [this.theme.fg('accent', `Herdr Pi launch · ${this.step}`), identity,
      ...(this.step === 'model' ? this.input.render(width) : []), ...this.list.render(width),
      this.message, '↑↓ choose · Enter confirm · Esc back/cancel'].filter(Boolean).map(line => truncateToWidth(line, width));
  }
  invalidate() { this.input.invalidate(); this.nameInput.invalidate(); this.list.invalidate(); }
}
export function pick(ctx: ExtensionContext, choices: ModelChoice[], prefs: Preferences, validate: (selection: LaunchSelection) => Promise<void>): Promise<LaunchSelection | undefined> {
  return ctx.ui.custom((tui,theme,keys,done) => {
    let busy = false;
    const picker = new Picker(choices,prefs,theme,() => tui.requestRender(), selection => {
      if (!selection) { done(undefined); return; }
      busy = true; tui.requestRender();
      void validate(selection).then(() => done(selection), error => {
        ctx.ui.notify(String(error), 'error'); done(undefined);
      });
    }, keys, () => tui.terminal.rows);
    return {
      get focused() { return picker.focused; }, set focused(value: boolean) { picker.focused = value; },
      handleInput(data: string) { if (!busy) picker.handleInput(data); },
      render(width: number) { return busy ? [truncateToWidth('Preparing Pi launch…', width)] : picker.render(width); },
      invalidate() { picker.invalidate(); },
    };
  }, { overlay: true, overlayOptions: { width: '95%', maxHeight: '90%', anchor: 'center' } });
}
