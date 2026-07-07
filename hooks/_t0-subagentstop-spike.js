#!/usr/bin/env node
/**
 * T0 SPIKE — TEMPORARY DIAGNOSTIC. Remove after the test.
 *
 * Purpose: prove whether a `SubagentStop` (and `Stop`) hook can BLOCK a subagent
 * and feed an instruction back so it CONTINUES — the one runtime fact the whole
 * hook-enforced-review-gate design rests on (documented for Stop, only inferred
 * for SubagentStop).
 *
 * Behaviour (safe + self-disarming):
 *   - Logs every firing (event, agent_type, keys available) to `<cwd>/.soe/t0-spike.log`.
 *   - Honors `stop_hook_active` (exits 0 to avoid loops).
 *   - The FIRST time it fires (one-shot marker), it returns a block asking the
 *     agent to reply with the token `T0-BLOCK-OBSERVED`. Every firing after that
 *     just logs and allows — so it can never wedge a real run.
 *
 * How to read the result (see the run instructions):
 *   - `.soe/t0-spike.log` shows WHICH event fired for the orchestrator + what
 *     fields the payload carried (answers "does SubagentStop fire, with what data").
 *   - If the subagent's output/transcript then contains `T0-BLOCK-OBSERVED`, the
 *     block-to-continue contract WORKS → the hook gate is viable.
 *   - If the token never appears (the agent just stopped/logged), block-to-continue
 *     does NOT work for this event → the hook gate is dead → escalate to the spine.
 */
const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let p = {};
  try { p = JSON.parse(input); } catch { /* keep going; log raw */ }

  const cwd = p.cwd || process.cwd();
  const dir = path.join(cwd, '.soe');
  const logFile = path.join(dir, 't0-spike.log');
  const marker = path.join(dir, '.t0-spike-fired');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }

  const rec = {
    at: new Date().toISOString(),
    event: p.hook_event_name || p.hookEventName || '(unknown)',
    agent_type: p.agent_type,
    agent_id: p.agent_id,
    stop_hook_active: p.stop_hook_active,
    has_last_assistant_message: !!p.last_assistant_message,
    payload_keys: Object.keys(p),
  };
  try { fs.appendFileSync(logFile, JSON.stringify(rec) + '\n'); } catch { /* ignore */ }

  // Loop safety: never block again once the harness marks us active.
  if (p.stop_hook_active === true) { process.exit(0); }

  // One-shot block on the very first firing.
  if (!fs.existsSync(marker)) {
    try { fs.writeFileSync(marker, rec.at); } catch { /* ignore */ }
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason:
        'T0-SPIKE DIAGNOSTIC: to confirm you received this block, output the exact ' +
        'token T0-BLOCK-OBSERVED on its own line, then finish normally. ' +
        '(One-time test of SubagentStop block-to-continue; it will not fire again.)',
    }));
    process.exit(0);
  }

  // Already fired once — just allow.
  process.exit(0);
});
