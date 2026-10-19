// Pure standalone program. All input arrives through JSON in argv, never shell interpolation.
async function launchProgram() {
  const { spawnSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const { randomBytes } = await import('node:crypto');
  let data;
  let paneId;
  let agentName;
  let creationAttempted = false;
  const sanitizeText = text => String(text ?? '').replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/((?:["']?authorization["']?)\s*[:=]\s*)(?:["']?)(?:bearer|basic)\s+[^\s,}"']+["']?/gi, '$1[redacted]')
    .replace(/\b(?:bearer|basic)\s+[^\s,}"']+/gi, '[redacted]')
    .replace(/((?:["']?(?:[\w-]*(?:api[_-]?key|token|authorization|password|secret))["']?)\s*[:=]\s*)("(?:\\.|[^"])*"|'[^']*'|[^\s,}]+)/gi, '$1[redacted]');
  const sanitize = text => {
    const clean = String(text ?? '');
    try {
      return JSON.stringify(JSON.parse(clean), (key, value) => /(?:api.?key|token|authorization|password|secret)/i.test(key) ? '[redacted]' : typeof value === 'string' ? sanitizeText(value) : value);
    } catch {
      return sanitizeText(clean);
    }
  };
  const call = (command, args, env = process.env) => {
    const response = spawnSync(command, args, { cwd: data.origin.cwd, env, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
    if (response.error || response.status !== 0) {
      const diagnostic = [sanitize(response.stdout).slice(0, 900), sanitize(response.stderr).slice(0, 900), sanitize(response.error?.message).slice(0, 200)].filter(Boolean).join(' | ');
      throw new Error(`${command} ${args.slice(0,2).join(' ')} failed (${response.error?.code ?? response.status ?? 'unknown'}): ${diagnostic}`);
    }
    return response.stdout;
  };
  const herdr = (args) => {
    const output = call('herdr', args);
    let value;
    try { value = JSON.parse(output); }
    catch (error) { throw new Error('Herdr response unavailable or malformed; reconcile live state before retrying', { cause: error }); }
    if (value.error || !value.result) throw new Error('Herdr returned an error or invalid response');
    return value.result;
  };
  try {
    data = JSON.parse(process.argv[1]);
    if (process.env.HERDR_ENV !== '1') throw new Error('Run this launch block inside Herdr');
    if (!fs.statSync(data.origin.cwd).isDirectory()) throw new Error('Origin working directory is unavailable');
    call('pi', ['--version']); call('herdr', ['--version']);
    const origin = herdr(['pane', 'get', data.origin.paneId]).pane;
    if (origin?.pane_id !== data.origin.paneId || origin?.workspace_id !== data.origin.workspaceId) throw new Error('Captured origin no longer exists in its workspace');
    const base = [...data.child.args, '--provider', data.selection.providerId, '--model', data.selection.modelId,
      ...(data.selection.effort === null ? [] : ['--thinking', data.selection.effort])];
    agentName = `pi-${randomBytes(12).toString('hex')}`;
    creationAttempted = true;
    const created = herdr(data.selection.destination === 'tab'
      ? ['tab', 'create', '--workspace', data.origin.workspaceId, '--cwd', data.origin.cwd, '--env', `PI_CODING_AGENT_DIR=${data.child.agentDir}`, '--label', agentName, '--no-focus']
      : ['pane', 'split', '--pane', data.origin.paneId, '--direction', data.selection.destination, '--cwd', data.origin.cwd, '--env', `PI_CODING_AGENT_DIR=${data.child.agentDir}`, '--no-focus']);
    paneId = data.selection.destination === 'tab' ? created.root_pane?.pane_id : created.pane?.pane_id;
    if (typeof paneId !== 'string' || !paneId.startsWith(`${data.origin.workspaceId}:`)) throw new Error('Creation response has no valid pane ID; reconcile Herdr topology before retrying');
    const started = herdr(['agent', 'start', agentName, '--kind', 'pi', '--pane', paneId, '--', ...base]);
    if (started.type !== 'agent_started' || started.agent?.interactive_ready !== true || started.agent?.pane_id !== paneId || started.agent?.name !== agentName || started.agent?.agent !== 'pi') throw new Error('Invalid or not-ready agent start response; reconcile live state before retrying');
    console.log(JSON.stringify({ok:true,paneId,agentName,...data.selection,cwd:data.origin.cwd}));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error), paneId: paneId ?? null, agentName: agentName ?? null, creationAttempted, retry: 'Inspect live Herdr state before retrying; no automatic retry or cleanup was performed.' }));
    process.exitCode = 1;
  }
}

await launchProgram();
