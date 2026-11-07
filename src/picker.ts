import { Input, SelectList, getKeybindings, matchesKey, truncateToWidth, visibleWidth, type Component, type KeybindingsManager } from '@earendil-works/pi-tui';
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
    private keybindings: Pick<KeybindingsManager, 'matches'> = getKeybindings(), private availableRows: () => number = () => 40,
    private allowed: Destination[] = ['tab', 'right', 'down']) { this.models(); }
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
    this.makeList(this.filtered.map((choice, i) => ({ value: String(i), label: `${choice.model.provider} / ${modelLabel(choice.model.id, choice.model.name)}${choice.unavailable ? ' [unavailable]' : ''}` })), this.modelIndex);
  }
  private efforts() {
    this.step = 'effort'; this.input.focused = false;
    const choice = this.choice!;
    this.makeList(choice.levels.map(level => ({ value: level, label: level })), choice.levels.indexOf(this.effort!));
    this.message = choice.adjustment ?? '';
  }
  private destinations() {
    this.step = 'destination'; this.input.focused = false;
    const labels: Record<Destination, string> = { tab: 'New tab', right: 'Split right', down: 'Split down' };
    const preferred = this.allowed.includes(this.prefs.destination) ? this.prefs.destination : this.allowed[0] ?? 'tab';
    this.makeList(this.allowed.map(value => ({ value, label: labels[value] })), Math.max(0, this.allowed.indexOf(preferred)));
    this.message = this.allowed.includes(this.prefs.destination) ? ''
      : `Saved destination ${this.prefs.destination} needs herdr-app on this machine; choose another.`;
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
    const framed = width >= 34 && budget >= 9;
    const message = this.message;
    // Rows the frame needs besides the list; the list keeps the selected row visible.
    const chrome = framed ? 7 + (message ? 1 : 0) : 2;
    let rows = framed ? Math.max(1, Math.min(10, budget - chrome)) : Math.max(1, budget - (budget >= 5 ? chrome : 0));
    // A paginated list spends one row on its "3/38" indicator.
    if (framed && this.items.length > rows) rows = Math.max(1, rows - 1);
    if (rows !== this.visible) {
      const selected = this.list.getSelectedItem()?.value;
      this.visible = rows;
      this.makeList(this.items, Math.max(0, this.items.findIndex(item => item.value === selected)));
    }
    const content = framed ? width - 4 : width;
    const naming = this.step === 'name';
    const editor = naming ? this.nameInput : this.step === 'model' ? this.input : undefined;
    const head = editor ? editor.render(content)[0] ?? '' : this.choice ? this.theme.fg('dim', this.summary()) : '';
    const list = naming ? [] : this.items.length ? this.list.render(content) : [this.theme.fg('muted', '   No models match this search')];
    const hint = this.theme.fg('dim', this.hint());
    if (!framed) {
      const middle = budget < 5 ? [] : [head];
      return [...middle, ...list, ...(budget < 5 ? [] : [hint])].slice(0, budget).map(line => {
        // Padded even without a frame: short lines would let the transcript show through.
        const clipped = truncateToWidth(line, width);
        return clipped + ' '.repeat(Math.max(0, width - visibleWidth(clipped)));
      });
    }
    const note = message ? [this.theme.fg('warning', message)] : [];
    const body = naming ? [head, '', this.theme.fg('muted', this.summary()), ...note] : [head, '', ...list, ...note];
    const count = this.filtered.length;
    return this.frame(width, this.title(width), this.step === 'model' ? `${count} model${count === 1 ? '' : 's'}` : '', body, hint);
  }

  /** Keep the step readable: shorten the product name before the step when space is tight. */
  private title(width: number): string {
    const room = width - 14;
    const full = `Herdr Pi launch · ${this.step}`;
    const short = `Pi launch · ${this.step}`;
    if (visibleWidth(full) <= room) return full;
    return visibleWidth(short) <= room ? short : this.step;
  }

  /** What the next agent will be: provider, model, effort and where it goes. */
  private summary(): string {
    const model = this.choice?.model;
    const effort = this.effort ? ` · thinking ${this.effort}` : '';
    const where = { tab: 'new tab', right: 'split right', down: 'split down' }[this.destination];
    return `${model ? `${model.provider} / ${model.id}` : ''}${effort} · ${where}`;
  }

  /** A full-width panel: every line is padded to `width`, so nothing behind it shows through. */
  private frame(width: number, title: string, right: string, body: string[], hint: string): string[] {
    return [this.header(width, title, right), ...body.map(line => this.row(width, line)),
      ...(hint ? [this.rule(width, '├', '┤'), this.row(width, hint)] : []), this.rule(width, '╰', '╯')];
  }
  private header(width: number, title: string, right: string): string {
    const border = (text: string) => this.theme.fg('border', text);
    const name = truncateToWidth(title, Math.max(0, width - 14));
    const noteRoom = width - 8 - visibleWidth(name);
    const note = right && visibleWidth(right) + 6 <= noteRoom ? right : '';
    const fill = Math.max(1, width - 6 - visibleWidth(name) - (note ? visibleWidth(note) + 2 : 0));
    return border('╭─ ') + this.theme.fg('accent', name) + border(' ') + border('─'.repeat(fill))
      + (note ? ' ' + this.theme.fg('muted', note) + border(' ') : '') + border('─╮');
  }  private row(width: number, text: string): string {
    const inner = Math.max(0, width - 4);
    const clipped = truncateToWidth(text, inner, '…');
    // Each segment carries the panel background: inner theme resets must not expose what is behind.
    const paint = (segment: string) => this.theme.bg('customMessageBg', segment);
    return paint(this.theme.fg('border', '│ ')) + paint(clipped)
      + paint(' '.repeat(Math.max(0, inner - visibleWidth(clipped)))) + paint(this.theme.fg('border', ' │'));
  }
  private rule(width: number, left: string, right: string): string {
    return this.theme.bg('customMessageBg', this.theme.fg('border', left + '─'.repeat(Math.max(0, width - 2)) + right));
  }
  private hint(): string {
    if (this.step === 'model') return 'type to search · ↑↓ move · Enter choose · Esc cancel';
    if (this.step === 'name') return 'Enter confirm (blank = generated name) · Esc back';
    return '↑↓ choose · Enter confirm · Esc back';
  }
  /** Shown while the launch is being prepared; framed when the terminal allows it. */
  renderBusy(width: number, text = 'Preparing Pi launch…'): string[] {
    if (width < 34) return [truncateToWidth(text, width)];
    return this.frame(width, 'Herdr Pi launch', '', ['', this.theme.fg('accent', text)], '');
  }
  invalidate() { this.input.invalidate(); this.nameInput.invalidate(); this.list.invalidate(); }
}
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
/** A display name that only repeats the id is left out; the list stays readable. */
const modelLabel = (id: string, name: string) => squash(name) === squash(id) ? id : `${id} — ${name}`;
export function pick(ctx: ExtensionContext, choices: ModelChoice[], prefs: Preferences, validate: (selection: LaunchSelection) => Promise<void>, allowed: Destination[] = ['tab', 'right', 'down']): Promise<LaunchSelection | undefined> {
  return ctx.ui.custom((tui,theme,keys,done) => {
    let busy = false;
    const picker = new Picker(choices,prefs,theme,() => tui.requestRender(), selection => {
      if (!selection) { done(undefined); return; }
      busy = true; tui.requestRender();
      void validate(selection).then(() => done(selection), error => {
        ctx.ui.notify(String(error), 'error'); done(undefined);
      });
    }, keys, () => tui.terminal.rows, allowed);
    return {
      get focused() { return picker.focused; }, set focused(value: boolean) { picker.focused = value; },
      handleInput(data: string) { if (!busy) picker.handleInput(data); },
      render(width: number) { return busy ? picker.renderBusy(width) : picker.render(width); },
      invalidate() { picker.invalidate(); },
    };
  }, { overlay: true, overlayOptions: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 } });
}
