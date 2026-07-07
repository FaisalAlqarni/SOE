/**
 * lib/worker-brief.js — assemble the MINIMAL context a worker needs, and render
 * the dispatch prompt that keeps it scoped.
 *
 * PRINCIPLE (the whole point of the orchestrator/worker split): the
 * ORCHESTRATOR holds full context and coordinates/validates/guides; each WORKER
 * is a cheap, focused executor that knows only the thing it is responsible for.
 * A worker that re-reads the whole design doc + rules + sibling tasks defeats the
 * split and balloons cost — measured at ~10M cache-read tokens per worker in the
 * advantage-backend runs, ~63% of the worker bill. This module builds a bounded
 * brief from the persisted plan/state (task slice + acceptance + file handles +
 * only the task-relevant constraints) and renders a prompt that forbids the
 * worker from re-reading the world.
 *
 * PURE: no fs, no I/O — the caller (orchestrator) owns dispatch and persistence.
 */

/** Default brief budget. The brief is a POINTER set, not a document — the worker
 *  reads the touched files itself. Keep the injected context tiny. */
export const DEFAULT_BUDGET_CHARS = 6000;

const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Build the minimal brief for one task from the persisted plan/state.
 * Deliberately EXCLUDES: the full design doc, the full plan, sibling tasks, and
 * rules/skill bodies — the orchestrator holds those.
 *
 * @param {{id:string, title?:string, description?:string, acceptance?:string, files?:string[], touches?:string[], depends_on?:string[]}} task
 * @param {{constraints?:Array<{text:string, applies_to?:string[]}>}} [state]
 * @param {{budgetChars?:number, maxConstraints?:number}} [opts]
 * @returns {object} the bounded brief (with `_within_budget` flag)
 */
export function buildWorkerBrief(task, state = {}, opts = {}) {
  if (!task || !task.id) throw new Error('buildWorkerBrief: task with an id is required');
  const budget = opts.budgetChars ?? DEFAULT_BUDGET_CHARS;
  const maxC = opts.maxConstraints ?? 5;

  const touches = arr(task.files).length ? arr(task.files) : arr(task.touches);
  // Only constraints that actually apply to THIS task (by id or a touched file),
  // plus explicitly-global ones — capped, so we never dump the whole rulebook.
  const constraints = arr(state.constraints)
    .filter((c) => {
      const scope = arr(c.applies_to);
      if (scope.length === 0) return c.global === true; // global only if flagged
      return scope.includes(task.id) || scope.some((s) => touches.includes(s));
    })
    .map((c) => c.text)
    .filter(Boolean)
    .slice(0, maxC);

  const brief = {
    task_id: task.id,
    responsibility: task.title || task.description || '',
    acceptance: task.acceptance || task.acceptance_criteria || '(acceptance not specified — infer from responsibility + tests)',
    touches: touches.slice(), // PATHS only — handles, not contents
    depends_on: arr(task.depends_on).length ? arr(task.depends_on) : arr(task.deps),
    constraints,
  };
  brief._within_budget = JSON.stringify(brief).length <= budget;
  return brief;
}

/**
 * Render the worker dispatch prompt from a brief. Encodes the split: worker does
 * its slice, does NOT re-read the world, returns a firewall envelope; the
 * orchestrator validates/coordinates/guides.
 *
 * @param {object} brief - from buildWorkerBrief
 * @returns {string}
 */
export function renderWorkerPrompt(brief) {
  const lines = [
    `You are responsible for EXACTLY ONE task: ${brief.task_id}. Nothing else.`,
    ``,
    `## Your responsibility`,
    brief.responsibility,
    ``,
    `## Done means (acceptance)`,
    brief.acceptance,
    ``,
    `## Touch ONLY these files (read them yourself — they are your scope):`,
    ...(brief.touches.length ? brief.touches.map((f) => `  - ${f}`) : ['  (none listed — ask the orchestrator before widening scope)']),
  ];
  if (arr(brief.depends_on).length) {
    lines.push(``, `## Depends on (already done — do not redo): ${brief.depends_on.join(', ')}`);
  }
  if (arr(brief.constraints).length) {
    lines.push(``, `## Constraints that apply here:`, ...brief.constraints.map((c) => `  - ${c}`));
  }
  lines.push(
    ``,
    `## Rules of engagement (why you have a tiny brief)`,
    `- The ORCHESTRATOR holds the full design, plan, and cross-task context, and will validate, coordinate, and guide your result. You do not need that context to do your one task.`,
    `- Do NOT read the design doc, the full plan, or other tasks — this brief is complete and authoritative for your scope. Re-reading the world is the single biggest waste in the loop.`,
    `- Read only the files in your touch-list (plus anything they directly import to compile/test).`,
    `- Follow TDD: write the failing test first, then the minimal code to pass it.`,
    `- Return ONLY the firewall envelope { path, summary, confidence } — never stream your full output back. The orchestrator reads files, not your transcript.`,
  );
  return lines.join('\n');
}
