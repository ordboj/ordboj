export const meta = {
  name: 'ticket-pilot',
  description:
    'Per-ticket pipeline: triage → implement in isolated worktree → adversarial review → PR → CI watch → auto-merge or park with needs-human',
  whenToUse:
    'Run Ordböj board tickets autonomously. args: { tickets: [16, 18, 28] } — GitHub issue numbers in ordboj/ordboj. Risky classes (localStorage schema, verb-data correctness, dependency major bump, cross-owner) never auto-merge.',
  phases: [
    { title: 'Triage', detail: 'read issue, pick owner role, model, risk class' },
    { title: 'Implement', detail: 'owner-role agent in isolated worktree, opens PR' },
    {
      title: 'Assist',
      detail: 'on needs-help, helper role agent contributes its own files to the branch',
    },
    { title: 'QA', detail: 'qa agent adds tests to the PR branch (test files are qa-owned)' },
    { title: 'Review', detail: 'adversarial review of PR diff vs acceptance criteria' },
    { title: 'Ship', detail: 'watch CI, merge + board update, or park with needs-human' },
  ],
};

const REPO = 'ordboj/ordboj';

let parsedArgs = args;
if (typeof parsedArgs === 'string') {
  try {
    parsedArgs = JSON.parse(parsedArgs);
  } catch {
    // tolerate loose forms like "{ tickets: [16, 18] }" or "16,18,28"
    const nums = parsedArgs.match(/\d+/g);
    parsedArgs = nums ? nums.map(Number) : null;
  }
}
const tickets = Array.isArray(parsedArgs) ? parsedArgs : (parsedArgs && parsedArgs.tickets) || [];
if (!tickets.length)
  throw new Error(
    'args.tickets required: array of GitHub issue numbers, e.g. { tickets: [16, 18, 28] }',
  );

// Serialization locks: same-owner implements never run concurrently (no two
// agents hold one owner's files), and merges happen one at a time so a PR is
// never merged onto a main that just moved under it.
const locks = {};
function withLock(key, fn) {
  const prev = locks[key] || Promise.resolve();
  const next = prev.then(fn, fn);
  locks[key] = next.then(
    () => {},
    () => {},
  );
  return next;
}

// ---------------------------------------------------------------- rules

const RULES = `
Hard rules (non-negotiable):
- Never weaken or delete existing tests to pass. All existing tests must stay green.
- Do NOT edit test files (*.test.ts, *.test.tsx, src/test/**, vitest.config.ts) — qa owns them; a separate QA stage adds tests to your branch after you.
- Respect file ownership from CLAUDE.md. If the work requires editing files owned by another role, STOP and report blocked — do not edit them.
- Uncertain Swedish is NEVER guessed. Flag it and report blocked instead.
- localStorage data shape never changes without a version field and forward migration — and such a change is risky-class: it will not auto-merge.
- Before opening a PR, run all four and paste the tail of the real output as evidence:
  npm run lint && npm run typecheck && npm test && npm run build
  If any fails, fix it or report blocked. No completion claims without evidence.
`;

// ---------------------------------------------------------------- schemas

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    owner: {
      type: 'string',
      enum: ['swedish-linguist', 'srs-engine', 'staff-engineer', 'devops', 'frontend-expert', 'qa'],
    },
    model: {
      type: 'string',
      enum: ['sonnet', 'opus'],
      description: 'opus only for storage-migration or architectural tickets',
    },
    risky: {
      type: 'boolean',
      description:
        'true if localStorage schema, verb-data correctness, dependency major bump, or cross-owner change',
    },
    riskyReason: { type: 'string' },
    needsTests: {
      type: 'boolean',
      description:
        'true if the change is testable behavior (SRS math, data validation, component logic); false for pure config/formatting/docs',
    },
    title: { type: 'string' },
    acceptance: {
      type: 'string',
      description: 'acceptance criteria distilled from the issue body',
    },
  },
  required: ['owner', 'model', 'risky', 'needsTests', 'title', 'acceptance'],
};

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pr-opened', 'needs-help', 'blocked'] },
    helpRole: {
      type: 'string',
      enum: ['swedish-linguist', 'srs-engine', 'staff-engineer', 'devops', 'frontend-expert', 'qa'],
      description: 'only with status needs-help: which role owns the files the change needs',
    },
    helpRequest: {
      type: 'string',
      description: 'only with status needs-help: precise description of the change needed and why',
    },
    branch: { type: 'string' },
    prNumber: { type: 'number' },
    prUrl: { type: 'string' },
    evidence: { type: 'string', description: 'tail of lint/typecheck/test/build output' },
    blockReason: { type: 'string' },
  },
  required: ['status'],
};

const QA_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['tests-added', 'not-needed', 'blocked'] },
    evidence: { type: 'string', description: 'tail of npm test / typecheck output' },
    blockReason: { type: 'string' },
  },
  required: ['status'],
};

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'string' } },
  },
  required: ['approved', 'findings'],
};

const SHIP_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['merged', 'parked', 'failed'] },
    detail: { type: 'string' },
  },
  required: ['status', 'detail'],
};

// ---------------------------------------------------------------- pipeline

const results = await pipeline(
  tickets,

  // ---- Triage: read the issue, classify
  (n) =>
    agent(
      `Read GitHub issue #${n} in ${REPO} with: gh issue view ${n} --repo ${REPO} --json title,body,labels
Then read CLAUDE.md file-ownership table in the repo root.
Classify the ticket:
- owner: which role owns every file this ticket touches. If it genuinely spans two owners, pick the primary owner AND set risky=true with riskyReason "cross-owner".
- model: 'sonnet' by default; 'opus' only if the ticket changes localStorage storage schema/migration code or is an architectural change.
- risky: true if ANY of: localStorage schema/shape change, Swedish verb-data correctness change (verbData.ts / swedish_verbs.csv content), dependency major version bump, cross-owner change. Otherwise false.
- needsTests: true if the ticket changes testable behavior (logic, data handling, component behavior); false for pure config, formatting or docs work.
- acceptance: distill concrete acceptance criteria from the issue body.
Return only the structured result.`,
      {
        label: `triage:#${n}`,
        phase: 'Triage',
        schema: TRIAGE_SCHEMA,
        effort: 'low',
        model: 'sonnet',
      },
    ),

  // ---- Implement: owner-role agent in isolated worktree, opens PR
  (t, n) => {
    if (!t) return { status: 'blocked', blockReason: 'triage agent returned nothing' };
    return withLock('owner:' + t.owner, () =>
      agent(
        `You are implementing GitHub issue #${n} in ${REPO}: "${t.title}".
Acceptance criteria:
${t.acceptance}

You are already in an isolated git worktree. Steps:
1. Create branch: git checkout -b ticket/${n}-<short-slug>
2. Read the issue for full context: gh issue view ${n} --repo ${REPO} --json title,body
3. Implement following the rules below. Stay strictly inside your role's file ownership (CLAUDE.md table).
4. Run all four verification commands; capture real output.
5. Commit with a conventional message referencing the issue, push with: git push -u origin HEAD
6. Open the PR: gh pr create --repo ${REPO} --title "<type>: <title> (#${n})" --body "Closes #${n}\n\n<what changed, why>\n\n<verification evidence>"
7. Return status 'pr-opened' with branch, prNumber (from gh pr view --json number), prUrl, evidence.

If the fix genuinely requires a change in files owned by ANOTHER role: do NOT edit those files. Finish and commit YOUR part, push the branch, open the PR as draft (gh pr create --draft ...), and return status 'needs-help' with helpRole and a precise helpRequest — a teammate agent of that role will be dispatched to the same branch.
If you cannot proceed safely at all (uncertain Swedish, acceptance criteria ambiguous, tests cannot pass without weakening), do NOT push anything: return status 'blocked' with a precise blockReason.
${RULES}`,
        {
          label: `impl:#${n}`,
          phase: 'Implement',
          schema: IMPL_SCHEMA,
          agentType: t.owner,
          model: t.model,
          isolation: 'worktree',
        },
      ),
    ).then((impl) =>
      impl
        ? { ...impl, triage: t }
        : { status: 'blocked', blockReason: 'implement agent returned nothing', triage: t },
    );
  },

  // ---- Assist: on needs-help, helper role agent contributes its own files
  (r, n) => {
    if (!r || r.status !== 'needs-help') return r;
    return withLock('owner:' + r.helpRole, () =>
      agent(
        `You are the ${r.helpRole} on the Ordböj team. The ${r.triage.owner} implementing issue #${n} ("${r.triage.title}") on branch ${r.branch} needs your help:
${r.helpRequest}

You are in an isolated git worktree. Steps:
1. git fetch origin && git checkout ${r.branch}
2. Make ONLY the requested change, strictly inside files your role owns (CLAUDE.md table).
3. Run all four verification commands (lint, typecheck, test, build); all must pass.
4. Commit and push to the same branch.
5. Find the PR for this branch (gh pr list --repo ${REPO} --head ${r.branch}); if it is a draft mark it ready with gh pr ready; if none exists, open one: gh pr create --repo ${REPO} --title "..." --body "Closes #${n} ...".
6. Return status 'pr-opened' with branch, prNumber, prUrl and evidence.
If you cannot do it safely, return status 'blocked' with a precise blockReason. Never return needs-help yourself.
${RULES}`,
        {
          label: `assist:#${n}:${r.helpRole}`,
          phase: 'Assist',
          schema: IMPL_SCHEMA,
          agentType: r.helpRole,
          model: 'sonnet',
          isolation: 'worktree',
        },
      ),
    ).then((h) =>
      h
        ? {
            ...h,
            triage: {
              ...r.triage,
              risky: true,
              riskyReason: r.triage.riskyReason || 'cross-owner (assist)',
            },
          }
        : {
            ...r,
            status: 'blocked',
            blockReason: 'assist (' + r.helpRole + ') agent returned nothing',
          },
    );
  },

  // ---- QA: qa agent adds tests to the PR branch (test files are qa-owned)
  (r, n) => {
    if (!r || r.status !== 'pr-opened') return r;
    if (!r.triage.needsTests) return { ...r, qa: { status: 'not-needed' } };
    return agent(
      `You are the qa engineer. PR #${r.prNumber} in ${REPO} (branch ${r.branch}) implements issue #${n}: "${r.triage.title}".
Acceptance criteria:
${r.triage.acceptance}

You are in an isolated git worktree. Steps:
1. git fetch origin && git checkout ${r.branch}
2. Read the PR diff (gh pr diff ${r.prNumber} --repo ${REPO}) and write deterministic Vitest tests that pin the new behavior to the acceptance criteria. Regression tests for any bug the ticket fixes.
3. You may ONLY edit qa-owned files: *.test.ts, *.test.tsx, src/test/**, vitest.config.ts. Never change production code — if the change is untestable without a production edit, report blocked with the defect instead.
4. Run npm test and npm run typecheck; both must pass. Capture real output as evidence.
5. Commit ("test: ...") and push to the same branch.
Return status 'tests-added' with evidence, or 'blocked' with blockReason. If the PR already has adequate tests somehow, return 'not-needed'.`,
      {
        label: `qa:#${n}`,
        phase: 'QA',
        schema: QA_SCHEMA,
        agentType: 'qa',
        model: 'sonnet',
        isolation: 'worktree',
      },
    ).then((qa) =>
      qa && qa.status === 'blocked'
        ? { ...r, status: 'blocked', blockReason: 'qa: ' + (qa.blockReason || 'unknown'), qa }
        : { ...r, qa },
    );
  },

  // ---- Review: adversarial review of the PR diff
  (r, n) => {
    if (!r || r.status !== 'pr-opened') return r;
    return agent(
      `Adversarially review PR #${r.prNumber} in ${REPO} (fix for issue #${n}: "${r.triage.title}").
Get the diff: gh pr diff ${r.prNumber} --repo ${REPO}
Get the issue: gh issue view ${n} --repo ${REPO} --json title,body

Check, trying to REFUTE the claim that this PR is correct and complete:
- Does the diff actually satisfy every acceptance criterion? ${r.triage.acceptance}
- Correctness bugs, edge cases, broken tests, weakened tests.
- If the ticket changes testable behavior: does the branch actually contain meaningful tests pinning it (needsTests=${r.triage.needsTests})?
- File-ownership violations (CLAUDE.md table) or edits to src/components/ui/**.
- Any localStorage shape change without version+migration.
- Any Swedish string change that could be wrong (conjugation, spelling).
Return approved=true only if nothing material is wrong. List every finding either way.`,
      // review pinned to opus: strongest affordable tier (session model too expensive)
      { label: `review:#${n}`, phase: 'Review', schema: REVIEW_SCHEMA, model: 'opus' },
    ).then((rev) => ({ ...r, review: rev }));
  },

  // ---- Ship: CI watch, conflict handling, merge + board update, or park
  (r, n) => {
    if (!r) return { ticket: n, status: 'failed', detail: 'earlier stage returned nothing' };

    // Parked before any PR existed: make it visible on GitHub instead of
    // failing silently — comment on the issue and label it needs-human.
    if (r.status !== 'pr-opened') {
      const reason = 'blocked before merge (' + r.status + '): ' + (r.blockReason || 'unknown');
      return agent(
        `Ticket #${n} in ${REPO} was parked by automation before any PR was opened.
Reason: ${reason}

Make the parked state visible on GitHub (use the Bash tool):
1. Ensure the label exists (create-or-update, never errors):
   gh label create needs-human --repo ${REPO} --color D93F0B --description "agent parked, human decision needed" --force
2. Comment the reason on the issue: gh issue comment ${n} --repo ${REPO} --body "<the reason, one short paragraph>"
3. Label the issue: gh issue edit ${n} --repo ${REPO} --add-label needs-human
Return status 'parked' with a one-line detail.`,
        {
          label: `park:#${n}`,
          phase: 'Ship',
          schema: SHIP_SCHEMA,
          effort: 'low',
          model: 'sonnet',
        },
      ).then((s) => ({
        ticket: n,
        owner: r.triage && r.triage.owner,
        status: 'parked',
        detail: (s && s.detail) || reason,
      }));
    }

    const risky = r.triage.risky;
    const approved = r.review && r.review.approved;
    const runShip = () =>
      agent(
        `You are the ship agent for PR #${r.prNumber} in ${REPO} (issue #${n}).
Context: review approved=${approved}; findings: ${JSON.stringify((r.review && r.review.findings) || [])}. Risky class=${risky}${risky ? ' (' + (r.triage.riskyReason || '') + ')' : ''}.
Use the Bash tool for all commands.

Ensure the 'needs-human' label exists (create-or-update, never errors):
gh label create needs-human --repo ${REPO} --color D93F0B --description "agent parked, human decision needed" --force

Case A — review NOT approved:
Comment the findings on the PR, add label needs-human to BOTH the PR and issue #${n} (gh issue edit ${n} --repo ${REPO} --add-label needs-human), do NOT merge. Return parked.

Case B — review approved:
1. Watch CI by POLLING: run gh pr checks ${r.prNumber} --repo ${REPO}, then re-run it every ~60 seconds until every check has concluded, up to ~20 minutes total. Do NOT use --watch — it can outlive the command timeout.
2. CI red: read the failing job log (gh run view --log-failed). You do not edit code, even for trivial failures. Comment the failing lines on the PR, add needs-human to the PR and the issue, return parked.
3. CI green and risky=${risky}:
   - risky true: comment "CI green, review clean — risky class (${r.triage.riskyReason || 'risky'}), waiting for human approval", add needs-human to the PR and the issue, return parked.
   - risky false: merge with gh pr merge ${r.prNumber} --repo ${REPO} --squash --delete-branch.
     If merge fails due to conflicts: clone-checkout the PR branch in a temp dir (gh pr checkout inside a fresh 'git worktree add'), rebase onto origin/main, resolve MECHANICAL conflicts only (imports, adjacent lines), run npm test, force-push with --force-with-lease, re-watch CI once (polling), then retry the merge once more. If the conflict is semantic (two changes to the same behavior) or the retry fails again, do not guess: comment, needs-human on PR and issue, return parked.
4. After a successful merge, update the board:
   - The PR body says "Closes #${n}", so the issue should close automatically; verify with gh issue view ${n} --repo ${REPO} --json state and close it manually (gh issue close ${n} --repo ${REPO}) if still open.
   - Move the project item to Done: find the item id with
     gh project item-list 1 --owner ordboj --format json
     (the item whose content.number is ${n}), then
     gh project item-edit --project-id PVT_kwDOEr3qds4BfuEP --id <item-id> --field-id PVTSSF_lADOEr3qds4BfuEPzhZ--ms --single-select-option-id 98236657
5. Return merged with a one-line detail.
Never edit application source. Never weaken tests. Never merge a risky-class or unapproved PR.`,
        { label: `ship:#${n}`, phase: 'Ship', schema: SHIP_SCHEMA, model: 'sonnet' },
      );
    // Only merge candidates take the merge lock; park-only ships stay parallel.
    const shipRun = approved && !risky ? withLock('merge', runShip) : runShip();
    return shipRun.then((s) => ({
      ticket: n,
      prUrl: r.prUrl,
      prNumber: r.prNumber,
      owner: r.triage.owner,
      risky,
      ...(s || { status: 'failed', detail: 'ship agent returned nothing' }),
    }));
  },
);

const summary = results.filter(Boolean);
log(
  `ticket-pilot done: ${summary.filter((s) => s.status === 'merged').length} merged, ${summary.filter((s) => s.status === 'parked').length} parked, ${summary.filter((s) => s.status === 'failed').length} failed`,
);
return summary;
