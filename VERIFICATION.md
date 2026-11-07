# Verification

The 0.2 integration targets herdr-core (`hc`) and herdr-app. Results for legacy Herdr 0.9.x do not establish compatibility with these APIs.

## Automated checks

- `npm run verify`: TypeScript checking and the behavior suite. Coverage includes app-layout and core-label placement, fallback to labels when the app is absent or cannot find the terminal, rejection of missing/ambiguous/remote/malformed layouts, unchanged drafts and both probe results when nothing is shown, destination availability per placement mode, exact launch arguments for tab/right/down, POSIX quoting, thinking defaults, preferences, picker navigation, and editor insertion/undo.
- `npm run test:hc`: real hc 0.1.16 in a private session with a private socket and temporary XDG config/state. A fixture executable verifies the generated startup arguments, working directory, agent directory, terminal name and parent for all destinations, including Unicode and shell metacharacters. An `env` template is installed to verify it cannot override the explicit `/usr/bin/env` executable. Label launches are read back from the core record: a right split carries `herdr.space` and `herdr.tab`, a new tab carries the space only, and splitting down in label mode is refused.
- The same smoke test starts real interactive Pi 1.5.0 with `openai/gpt-5.4`, thinking `high`, a temporary agent directory, extension discovery disabled, and this repository's extension explicitly loaded with `-e`. It waits for hc's `idle` report, checks the screen for extension loading errors, confirms the child stays live after its parent exits, and cleans up. No task or provider request is sent.
- Development type checking and UI tests use the pinned Pi 1.3.0 libraries. Node 26.7.0 was used on Linux; the declared Node 22 minimum was not separately exercised.

## App contract and limits

Live placement was observed in the author's own app, which reaches this headless machine's core over SSH and has no `herdr-app` binary here. `resolvePlacement` returned the label placement for the live caller (`herdr.space` and `herdr.tab` from `hc get`), and a labelled throwaway terminal caused the app to adopt it within two seconds (`keep` flipped to true); the terminal was then killed and removed. The picker therefore offers tab and right splits in this setup, not split down.

The command shapes and layout decoder were checked against the upstream [app manual](https://github.com/herdrdev/herdr-app/blob/e5ba294ac187aa12d6f7e72ebfb59eb4ebeabd65/src/SKILL.md), [command registry](https://github.com/herdrdev/herdr-app/blob/e5ba294ac187aa12d6f7e72ebfb59eb4ebeabd65/src/commands.rs), and [window implementation](https://github.com/herdrdev/herdr-app/blob/e5ba294ac187aa12d6f7e72ebfb59eb4ebeabd65/src/window.rs). The parser consumes `spaces[].tabs[].terminals[]`; placement uses `pane.focus` then `terminal.keep`. The latter uses current focus, can return `pending`, and focuses the child on completion. No unsupported `--no-focus` flag is emitted.

This headless VPS has hc but no herdr-app executable or desktop window, so the local-app-command path and split down remain covered only by automated tests and upstream source, not by a real window. Live adoption was verified for the label path only; its visual result was not inspected, and physical keyboard routing was not exercised. App layout responses are fixtures in automated tests.

The extension forwards selected provider/model/effort values. Pi owns authentication, provider routing, fallback, sampling and extension behavior. An `idle` report proves interactive startup, not an eventual provider wire request. The prompt asks the executing agent to follow the commands; it cannot enforce compliance. With the local app CLI, focus changes between the focus and placement commands can change the destination.
