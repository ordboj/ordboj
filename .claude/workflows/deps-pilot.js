export const meta = {
  name: 'deps-pilot',
  description:
    'Dependabot PR pipeline: inventory → changelog analysis for majors → serial merge queue (update branch, watch CI, merge pure bumps) → code-changed PRs go to a human approval queue',
  whenToUse:
    'Drain open Dependabot PRs in ordboj/ordboj. args optional: { prs: [74, 79] } to limit, otherwise all open Dependabot PRs. Pure bumps (no app code touched) with green CI merge autonomously — minor AND major. Any PR where an agent had to change application code is prepared but NOT merged: the workflow returns it in `approval`, and the lead presents the batch to the human, then enables `gh pr merge --auto --squash` for approved ones. Spec: docs/superpowers/specs/2026-08-08-deps-pilot-design.md',
  phases: [
    {
      title: 'Inventory',
      detail: 'list open Dependabot PRs, classify update type / CI / conflicts',
    },
    {
      title: 'Analyze',
      detail: 'majors only: changelog vs codebase usage — clean-bump / needs-adaptation / blocked',
    },
    {
      title: 'Merge',
      detail: 'serial queue: update branch, wait CI, merge pure bumps; red CI → diagnose',
    },
    {
      title: 'Adapt',
      detail:
        'code changes on the PR branch (API adaptation or CI fix), CI green, then approval queue',
    },
  ],
};

const REPO = 'ordboj/ordboj';

let parsedArgs = args;
if (typeof parsedArgs === 'string') {
  try {
    parsedArgs = JSON.parse(parsedArgs);
  } catch {
    const nums = parsedArgs.match(/\d+/g);
    parsedArgs = nums ? { prs: nums.map(Number) } : null;
  }
}
const onlyPrs = Array.isArray(parsedArgs) ? parsedArgs : (parsedArgs && parsedArgs.prs) || null;

// ---------------------------------------------------------------- rules

const RULES = `
Hard rules (non-negotiable):
- Never weaken or delete existing tests to pass. A CI failure is closed by fixing the cause. A legitimate test update forced by an upstream API change is allowed, but it counts as a code change: the PR must NOT be merged by you.
- You NEVER merge a PR that contains commits beyond Dependabot's own bump. Code-changed PRs go to the human approval queue.
- If your change touches localStorage schema/persistence, src/lib/srs.ts, src/data/verbData.ts, public/data/swedish_verbs.csv or src/lib/verbs.ts, say so explicitly in filesTouched — these always need a human callout.
- Verification before any completion claim: npm run lint && npm run typecheck && npm test && npm run build. Paste the tail of the real output as evidence.
- No infinite retries: if you cannot resolve a failure, stop and report it precisely.
`;

const CI_POLL = `Watch CI by POLLING inside a single Bash call (standalone sleep is blocked, but sleep INSIDE a loop in one command works). Use exactly this pattern with a 600000ms tool timeout:
  for i in $(seq 1 18); do gh pr checks <n> --repo ${REPO} && break; sleep 30; done; gh pr checks <n> --repo ${REPO}
(gh pr checks exits non-zero while checks are pending/failing, so the loop breaks on all-green.) If checks are still pending after that call, run the same call once more (~20 min total).
NEVER start a background task or Monitor to wait for CI, and NEVER end your turn with CI still pending "to report later" — there is no later; your StructuredOutput call is your ONLY result and placeholder results are forbidden. If after ~20 minutes checks have not concluded, treat it as unresolved and follow your parked path.`;

const PARK = `Park procedure (make it visible on GitHub):
1. gh label create needs-human --repo ${REPO} --color D93F0B --description "agent parked, human decision needed" --force
2. gh pr comment <n> --repo ${REPO} --body "<one short paragraph: why parked>"
3. gh pr edit <n> --repo ${REPO} --add-label needs-human`;

// ---------------------------------------------------------------- schemas

const INVENTORY_SCHEMA = {
  type: 'object',
  properties: {
    prs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'number' },
          title: { type: 'string' },
          updateType: {
            type: 'string',
            enum: ['patch', 'minor', 'major'],
            description: 'highest severity across all deps in the PR (grouped PRs: the max)',
          },
          grouped: { type: 'boolean', description: 'dependabot group PR (bumps several deps)' },
          conflicted: { type: 'boolean', description: 'mergeable state is CONFLICTING' },
          behindBase: { type: 'boolean' },
          ciGreen: {
            type: 'boolean',
            description: 'all completed checks succeeded on current head',
          },
          deps: {
            type: 'array',
            items: { type: 'string' },
            description: 'package names with from→to versions, e.g. "recharts 2.15.4→3.10.1"',
          },
        },
        required: ['number', 'title', 'updateType', 'grouped', 'conflicted', 'deps'],
      },
    },
  },
  required: ['prs'],
};

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    class: { type: 'string', enum: ['clean-bump', 'needs-adaptation', 'blocked'] },
    breakingChanges: {
      type: 'array',
      items: { type: 'string' },
      description: 'breaking changes from release notes that intersect actual codebase usage',
    },
    adaptationPlan: {
      type: 'string',
      description: 'only for needs-adaptation: concrete file-level changes required',
    },
    blockReason: { type: 'string', description: 'only for blocked: peer-dep conflict etc.' },
  },
  required: ['class'],
};

const MERGE_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['merged', 'already-merged', 'ci-red', 'code-changed', 'parked'],
    },
    detail: { type: 'string' },
    failureSummary: {
      type: 'string',
      description: 'only for ci-red: which job failed and the decisive log lines',
    },
  },
  required: ['status', 'detail'],
};

const ADAPT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ready-for-approval', 'parked'] },
    diffSummary: { type: 'string', description: 'what was changed and why, human-readable' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'string', description: 'tail of lint/typecheck/test/build output' },
    detail: { type: 'string' },
  },
  required: ['status', 'detail'],
};

// ---------------------------------------------------------------- phase 1: inventory

phase('Inventory');
const inv = await agent(
  `Inventory open Dependabot PRs in ${REPO}. Use the Bash tool.
1. gh pr list --repo ${REPO} --state open --author app/dependabot --json number,title,mergeable,statusCheckRollup --limit 50
2. For each PR determine:
   - deps and from→to versions (from the title; for grouped PRs read the PR body: gh pr view <n> --repo ${REPO} --json body)
   - updateType: compare versions semver-wise; grouped PR = highest severity in the group
   - conflicted: mergeable == CONFLICTING
   - behindBase: gh pr view <n> --repo ${REPO} --json mergeStateStatus (BEHIND)
   - ciGreen: statusCheckRollup checks on the CI workflow all SUCCESS
${onlyPrs ? `ONLY include these PR numbers: ${JSON.stringify(onlyPrs)}` : 'Include every open Dependabot PR.'}
Return the structured list only.`,
  {
    label: 'inventory',
    phase: 'Inventory',
    schema: INVENTORY_SCHEMA,
    effort: 'low',
    model: 'sonnet',
  },
);

if (!inv || !inv.prs.length) {
  log('deps-pilot: no open Dependabot PRs found');
  return { merged: [], approval: [], parked: [], unprocessed: [] };
}
log(
  `deps-pilot: ${inv.prs.length} Dependabot PRs (${inv.prs.filter((p) => p.updateType === 'major').length} major)`,
);

// ---------------------------------------------------------------- phase 2: analyze majors

phase('Analyze');
const majors = inv.prs.filter((p) => p.updateType === 'major');
// Barrier is deliberate: the merge queue is ordered by analysis outcome, so
// every analysis must land before the queue can be sorted.
const analyses = await parallel(
  majors.map(
    (p) => () =>
      agent(
        `Analyze Dependabot PR #${p.number} in ${REPO}: "${p.title}" (major bump: ${p.deps.join(', ')}).
1. Read the PR diff for the manifest change: gh pr diff ${p.number} --repo ${REPO}
2. Fetch the release notes / changelog / migration guide for each major-bumped package (GitHub releases page or the package's CHANGELOG; use WebFetch).
3. Grep this codebase for actual usage of every changed or removed API. Only breaking changes that intersect REAL usage matter.
4. Classify:
   - clean-bump: no breaking change touches our usage (or package is dev-only tooling whose config we don't use in a breaking way)
   - needs-adaptation: our code must change; give a concrete file-level adaptationPlan
   - blocked: cannot bump safely (peer-dependency conflict with another pinned dep, dropped platform support, etc.) — give blockReason
Be strict: when genuinely uncertain whether a breaking change hits us, prefer needs-adaptation over clean-bump.`,
        {
          label: `analyze:#${p.number}`,
          phase: 'Analyze',
          schema: ANALYSIS_SCHEMA,
          model: 'sonnet',
        },
      ),
  ),
);
const analysisByPr = {};
majors.forEach((p, i) => {
  analysisByPr[p.number] = analyses[i] || {
    class: 'blocked',
    blockReason: 'analysis agent returned nothing',
  };
});

// ---------------------------------------------------------------- phase 3+4: serial merge queue

// Easy → hard: minor/patch groups, single minors/patches, clean majors,
// adaptation majors. Blocked majors are parked without queue work.
function rank(p) {
  if (p.updateType !== 'major') return p.grouped ? 0 : 1;
  const cls = analysisByPr[p.number].class;
  return cls === 'clean-bump' ? 2 : 3;
}
const queue = inv.prs
  .filter((p) => p.updateType !== 'major' || analysisByPr[p.number].class !== 'blocked')
  .sort((a, b) => rank(a) - rank(b) || a.number - b.number);

const merged = [];
const approval = [];
const parked = [];
const unprocessed = [];

for (const p of inv.prs.filter(
  (x) => x.updateType === 'major' && analysisByPr[x.number].class === 'blocked',
)) {
  const reason = analysisByPr[p.number].blockReason || 'blocked by analysis';
  const s = await agent(
    `Dependabot PR #${p.number} in ${REPO} is blocked: ${reason}
${PARK}
Return status 'parked' with a one-line detail.`,
    {
      label: `park:#${p.number}`,
      phase: 'Merge',
      schema: MERGE_SCHEMA,
      effort: 'low',
      model: 'sonnet',
    },
  );
  parked.push({ pr: p.number, title: p.title, reason, detail: s && s.detail });
}

for (const p of queue) {
  const analysis = analysisByPr[p.number] || { class: 'clean-bump' };

  // --- needs-adaptation majors: code work first, never merged here
  if (analysis.class === 'needs-adaptation') {
    const a = await agent(
      `You are adapting the codebase for Dependabot PR #${p.number} in ${REPO}: "${p.title}".
Breaking changes that hit our usage:
${(analysis.breakingChanges || []).map((b) => '- ' + b).join('\n')}
Adaptation plan from analysis:
${analysis.adaptationPlan || '(none — derive it from the breaking changes)'}

You are in an isolated git worktree. Steps:
1. Find the PR branch: gh pr view ${p.number} --repo ${REPO} --json headRefName
2. git fetch origin && git checkout <branch> && git merge origin/main (resolve mechanical conflicts only; if a conflict is semantic, park instead)
3. npm ci, then implement the adaptation — smallest change that makes the new major work. Follow existing code style.
4. Run all four verification commands; capture real output as evidence.
5. Commit ("fix: adapt to <pkg> v<major>") and push to the PR branch.
6. ${CI_POLL.replace('<n>', String(p.number))}
7. CI green → return 'ready-for-approval' with diffSummary, filesTouched, evidence. Do NOT merge — a human approves code-changed PRs.
If you cannot adapt safely or CI stays red after your best fix: ${PARK.replace(/<n>/g, String(p.number))} and return 'parked' with detail.
${RULES}`,
      { label: `adapt:#${p.number}`, phase: 'Adapt', schema: ADAPT_SCHEMA, isolation: 'worktree' },
    );
    if (a && a.status === 'ready-for-approval') {
      approval.push({
        pr: p.number,
        title: p.title,
        kind: 'major-adaptation',
        diffSummary: a.diffSummary,
        filesTouched: a.filesTouched,
        evidence: a.evidence,
      });
      log(`#${p.number} ready for human approval (adaptation)`);
    } else {
      parked.push({
        pr: p.number,
        title: p.title,
        reason: (a && a.detail) || 'adaptation agent returned nothing',
      });
    }
    continue;
  }

  // --- pure bumps (minors + clean majors): update branch, wait CI, merge
  const m = await agent(
    `You are the merge agent for Dependabot PR #${p.number} in ${REPO}: "${p.title}" (${p.updateType}${p.grouped ? ', grouped' : ''}).
Use the Bash tool. Steps:
1. Check state first: gh pr view ${p.number} --repo ${REPO} --json state,mergeStateStatus,mergeable — if already merged/closed, return 'already-merged'.
2. Safety check: gh pr view ${p.number} --repo ${REPO} --json commits — if ANY commit author is not dependabot[bot], this PR is code-changed: do NOT merge, return 'code-changed' with detail listing the extra commits.
3. Branch update:
   - conflicted → comment "@dependabot rebase" on the PR, wait ~2 minutes, re-check; if still conflicted after 10 minutes, park.
   - behind base → gh pr update-branch ${p.number} --repo ${REPO}
4. ${CI_POLL.replace('<n>', String(p.number))}
5. All checks green → gh pr merge ${p.number} --repo ${REPO} --squash --delete-branch. (If GitHub's auto-merge already merged it meanwhile, that's fine: 'already-merged'.) Return 'merged'.
6. Any check red → do NOT edit code, do NOT merge. Read the failing log: gh run view --log-failed for the failing run. Return 'ci-red' with failureSummary quoting the decisive log lines.
If gh itself fails repeatedly (rate limit, network), return 'parked' with detail — no retry loops.
Never merge a PR with non-dependabot commits. Never weaken anything to get green.`,
    {
      label: `merge:#${p.number}`,
      phase: 'Merge',
      schema: MERGE_SCHEMA,
      effort: 'low',
      model: 'sonnet',
    },
  );

  if (!m) {
    unprocessed.push({ pr: p.number, title: p.title, reason: 'merge agent returned nothing' });
    continue;
  }
  if (m.status === 'merged' || m.status === 'already-merged') {
    merged.push({ pr: p.number, title: p.title });
    log(`#${p.number} merged (${p.updateType})`);
    continue;
  }
  if (m.status === 'code-changed' || m.status === 'parked') {
    parked.push({ pr: p.number, title: p.title, reason: m.detail });
    continue;
  }

  // --- ci-red: diagnose and fix on the PR branch, then approval queue
  const f = await agent(
    `CI is red on Dependabot PR #${p.number} in ${REPO}: "${p.title}".
Failure summary from the merge agent:
${m.failureSummary || m.detail}

You are in an isolated git worktree. Diagnose the ROOT CAUSE first (systematic: read the full failing log, reproduce locally), then fix it. Steps:
1. gh pr view ${p.number} --repo ${REPO} --json headRefName; git fetch origin && git checkout <branch>; npm ci
2. Reproduce the failure locally (the failing command from CI).
3. Fix the cause. Typical legitimate fixes: type errors from updated types, lint rule changes, test updates forced by a changed upstream API. Never paper over: no test deletion, no rule disabling, no dependency pinning-back unless the bump itself is broken — in that case park with the evidence.
4. Run all four verification commands; capture output as evidence.
5. Commit ("fix: <cause> after <pkg> bump") and push to the PR branch.
6. ${CI_POLL.replace('<n>', String(p.number))}
7. CI green → return 'ready-for-approval' with diffSummary, filesTouched, evidence. Do NOT merge — your fix is a code change, a human approves it.
If the root cause is critical/unclear (app behavior genuinely changes, data-integrity risk) or CI stays red: ${PARK.replace(/<n>/g, String(p.number))} and return 'parked' with a precise detail — the human decides.
${RULES}`,
    { label: `fix:#${p.number}`, phase: 'Adapt', schema: ADAPT_SCHEMA, isolation: 'worktree' },
  );
  if (f && f.status === 'ready-for-approval') {
    approval.push({
      pr: p.number,
      title: p.title,
      kind: 'ci-fix',
      diffSummary: f.diffSummary,
      filesTouched: f.filesTouched,
      evidence: f.evidence,
    });
    log(`#${p.number} ready for human approval (CI fix)`);
  } else {
    parked.push({
      pr: p.number,
      title: p.title,
      reason: (f && f.detail) || 'fix agent returned nothing',
    });
  }
}

log(
  `deps-pilot done: ${merged.length} merged, ${approval.length} awaiting human approval, ${parked.length} parked, ${unprocessed.length} unprocessed`,
);
return { merged, approval, parked, unprocessed };
