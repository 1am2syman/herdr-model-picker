# Herdr model picker

Prepare a new **Pi** agent while composing a prompt in Herdr. Press **Ctrl+Alt+L**, search the configured provider/model list, choose a supported reasoning effort, then choose **New tab**, **Split right**, or **Split down**. The picker inserts a complete executable block at the cursor. Submit your prompt when ready; the current agent executes the block and can send your surrounding task to the returned agent name.

Opening the picker or inserting a block creates no Herdr layout and launches no interactive agent. Esc goes back; Esc on the model list cancels. Pi’s **Ctrl+L** model picker stays available. One editor undo removes the insertion. The `/herdr-model-picker` command is also available; use the shortcut to preserve a draft already being composed.

## Install

Requires Pi **1.3.0+**, herdr-core **0.1.16+** (`hc`), the new **herdr-app** desktop client, Node.js **22+**, and a POSIX shell. `pi`, `hc`, and `herdr-app` must be in PATH. Run Pi in a **local** terminal pane in an open herdr-app window. The extension resolves `HC_TERMINAL_ID` through `herdr-app ls`.

Version 0.2 replaces the legacy `herdr` 0.9.x integration. SSH panes whose desktop app runs on another machine are not supported: the app CLI must reach the window on the same machine as Pi. Headless hc terminals without an app pane cannot choose tab/split destinations.

```sh
pi install git:github.com/1am2syman/herdr-model-picker
```

Run `/reload` in an existing Pi session, then press **Ctrl+Alt+L** or run `/herdr-model-picker`.

To update later:

```sh
pi update git:github.com/1am2syman/herdr-model-picker
```

For local development, clone the repository and load its entry point for one invocation:

```sh
pi -e /absolute/path/to/herdr-model-picker/src/index.ts
```

The package declares host libraries as peer dependencies. For development, run `npm ci`, then `npm run verify`. With `hc` and `pi` installed, `npm run test:hc` also checks startup in a private core, including an interactive Pi launch with no prompt sent. It uses temporary configuration and state and cleans up its own core.

## Preferences and shortcut

Preferences are stored at `<effective Pi agent directory>/herdr-model-picker.json`, normally `~/.pi/agent/herdr-model-picker.json`. Destination defaults to new tab. Efforts are remembered separately by exact provider/model pair and are saved only after insertion. Invalid saved efforts visibly revert to Pi’s supported startup default (per-model setting, global thinking setting, then Pi 1.3.0’s `medium`, clamped through Pi’s helper). Nonreasoning models skip effort selection.

To change the shortcut, add `"shortcut": "ctrl+alt+k"` to the versioned preference file and reload:

```json
{
  "version": 1,
  "shortcut": "ctrl+alt+k",
  "destination": "tab",
  "efforts": {}
}
```

Pi 1.3.0 has no named native extension-shortcut setting; the extension registers this preference through `registerShortcut`. Pi reports conflicts during extension loading. Inspect `/hotkeys` and choose a different shortcut if your terminal or desktop intercepts it. Concurrent preference writes merge under a lock and rename atomically. A crashed writer may leave a `.lock` directory; an error identifies it for removal after confirming no writer is active.

## Launch behavior and limits

The picker captures Pi’s configured model registry and supported effort levels, then inserts the exact provider, model, effort, destination, working directory, agent directory, and three commands. After choosing the destination you can name the hc terminal (lowercase, `[a-z][a-z0-9_-]{0,31}`). Press Enter with the field blank to use a generated `pi-<hex>` name.

1. `hc run --bg --json` starts interactive Pi with the chosen name, explicit parent terminal, working directory, agent directory, and Pi arguments. Read `.address` from its JSON.
2. `herdr-app do pane.focus` selects the captured origin pane, so placement starts in its space and tab.
3. `herdr-app do terminal.keep` gives the returned terminal address a new tab or a right/down split. Replace only `STEP1_TERMINAL_ADDRESS` in this command with the address returned in step 1.

Run the commands in order and stop on an error. The startup reply confirms a process was created; before sending a task, use `hc wait <address>` and inspect `hc get <address>` / `hc read <address>` for readiness or a trust/authentication dialog. App placement may return `pending`; confirm the terminal appears in `herdr-app ls`. The child outlives its parent, like an independently opened interactive agent.

Pi owns authentication, endpoints, headers, sampling, provider fallbacks and extension behavior. The extension makes no guarantee about provider-internal routing or server-side model substitution; the block reports the requested CLI selection.

Placement follows herdr-app’s native behavior and **focuses the new child**. The new app has no `--no-focus` option. Step 2 selects the captured origin explicitly; avoid changing focus between steps 2 and 3 because `terminal.keep` uses the current pane. Nothing is created when you open the picker or insert the block. If startup or placement fails, inspect `hc get <name>` and `herdr-app ls` before retrying. A successfully started terminal can remain running without a pane after a placement failure; reuse its address rather than rerunning step 1. Nothing is retried or closed automatically.

The effective Pi agent directory, explicit local extension paths, extension-discovery flag and project-trust override are carried into the child. Paths expand home references and file URLs and resolve against the parent’s original invocation directory. Other parent flags, prompts, resume and print/RPC settings are omitted. Session-only state is not copied: configure custom providers/authentication persistently or through an inherited explicit extension. Environment credentials must be available to programs launched by the core; hc does not copy arbitrary environment variables from the calling Pi process. Runtime `--api-key` overrides are rejected so secrets never enter the draft. Explicit npm/git/URL extension references must be installed persistently first.

Models registered only in the parent process may be unavailable in a child; Pi reports resolution errors. Argument arrays and POSIX quoting preserve shell-significant identifiers and paths. The picker is terminal-UI-only. The inserted instruction asks the current agent to use the block unchanged; compliance is not enforced by the extension. See [verification summary](VERIFICATION.md).

