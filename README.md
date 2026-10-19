# Herdr model picker

Prepare a new **Pi** agent while composing a prompt in Herdr. Press **Ctrl+Alt+L**, search the configured provider/model list, choose a supported reasoning effort, then choose **New tab**, **Split right**, or **Split down**. The picker inserts a complete executable block at the cursor. Submit your prompt when ready; the current agent executes the block and can send your surrounding task to the returned agent name.

Opening the picker or inserting a block creates no Herdr layout and launches no interactive agent. Esc goes back; Esc on the model list cancels. Pi’s **Ctrl+L** model picker stays available. One editor undo removes the insertion. The `/herdr-model-picker` command is also available; use the shortcut to preserve a draft already being composed.

## Install

Requires Pi **1.3.0**, Herdr **0.9.3**, Node.js **22+**, and a POSIX shell. Both `pi` and `herdr` must be in PATH. Run Pi in a Herdr terminal pane.

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

The package declares host libraries as peer dependencies. For development, run `npm install`, then `npm run verify`.

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

The picker captures Pi’s configured model registry and supported effort levels, then inserts a short, ready-to-run block: the exact provider, model, effort, destination, working directory, agent directory and working directory, plus the two Herdr CLI commands to run. The agent chooses the new agent’s name (lowercase, unique among live agents); the extension does not invent or hard-code one. Run step 1 (`herdr tab create` or `herdr pane split`), take the returned pane ID, and run step 2 (`herdr agent start`) with it. No model lookup, flag discovery or command construction is left to the agent, and the block stays short instead of embedding a script.

Pi owns authentication, endpoints, headers, sampling, provider fallbacks and extension behavior. The extension makes no guarantee about provider-internal routing or server-side model substitution; the block reports the requested CLI selection.

Destinations use `--no-focus` and the captured origin pane/workspace, so an unrelated focus change cannot redirect the split. Nothing is created when you open the picker or insert the block. If creation or startup fails, inspect Herdr’s live state before retrying; nothing is retried or closed automatically.

The effective Pi agent directory, explicit local extension paths, extension-discovery flag and project-trust override are carried into the child. Paths expand home references and file URLs and resolve against the parent’s original invocation directory. Other parent flags, prompts, resume and print/RPC settings are omitted. Session-only state is not copied: configure custom providers/authentication persistently or through an inherited explicit extension. Environment credentials must be available in Herdr-created shell panes. Runtime `--api-key` overrides are rejected so secrets never enter the draft. Explicit npm/git/URL extension references must be installed persistently first.

Models registered only in the parent process may be unavailable in a child; Pi reports resolution errors. Argument arrays and POSIX quoting preserve shell-significant identifiers and paths. The picker is terminal-UI-only. The inserted instruction asks the current agent to use the block unchanged; actual compliance is observed in tests, not guaranteed by the prompt. See [verification summary](VERIFICATION.md).

