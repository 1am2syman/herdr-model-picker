# Verification

The 0.2 integration targets herdr-core (`hc`) and herdr-app. Results for legacy Herdr 0.9.x do not establish compatibility with these APIs.

## Automated checks

- `npm run verify`: TypeScript checking and the behavior suite. Coverage includes caller-terminal origin discovery independent of UI focus; rejection of missing, ambiguous, remote and malformed layouts; unchanged drafts when the app is unavailable; exact launch arguments for tab/right/down; POSIX quoting; thinking defaults; preferences; picker navigation; and editor insertion/undo.
- `npm run test:hc`: real hc 0.1.16 in a private session with a private socket and temporary XDG config/state. A fixture executable verifies the generated startup arguments, working directory, agent directory, terminal name and parent for all destinations, including Unicode and shell metacharacters. An `env` template is installed to verify it cannot override the explicit `/usr/bin/env` executable.
- The same smoke test starts real interactive Pi 1.5.0 with `openai/gpt-5.4`, thinking `high`, a temporary agent directory, extension discovery disabled, and this repository's extension explicitly loaded with `-e`. It waits for hc's `idle` report, checks the screen for extension loading errors, confirms the child stays live after its parent exits, and cleans up. No task or provider request is sent.
- Development type checking and UI tests use the pinned Pi 1.3.0 libraries. Node 26.7.0 was used on Linux; the declared Node 22 minimum was not separately exercised.

## App contract and limits

The command shapes and layout decoder were checked against the upstream [app manual](https://github.com/herdrdev/herdr-app/blob/e5ba294ac187aa12d6f7e72ebfb59eb4ebeabd65/src/SKILL.md), [command registry](https://github.com/herdrdev/herdr-app/blob/e5ba294ac187aa12d6f7e72ebfb59eb4ebeabd65/src/commands.rs), and [window implementation](https://github.com/herdrdev/herdr-app/blob/e5ba294ac187aa12d6f7e72ebfb59eb4ebeabd65/src/window.rs). The parser consumes `spaces[].tabs[].terminals[]`; placement uses `pane.focus` then `terminal.keep`. The latter uses current focus, can return `pending`, and focuses the child on completion. No unsupported `--no-focus` flag is emitted.

This headless VPS has hc but no herdr-app executable or desktop window. Actual app placement, physical keyboard routing and visual behavior were not exercised. App layout responses are fixtures in automated tests. Support is limited to Pi and the app CLI on the same machine; SSH panes with the app on another machine are rejected.

The extension forwards selected provider/model/effort values. Pi owns authentication, provider routing, fallback, sampling and extension behavior. An `idle` report proves interactive startup, not an eventual provider wire request. The prompt asks the executing agent to follow the commands; it cannot enforce compliance. Focus changes between the focus and placement commands can change the destination.
