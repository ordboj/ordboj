export const meta = {
  name: 'ticket-pilot',
  description:
    'Per-ticket pipeline: triage → implement in isolated worktree → adversarial review → PR → CI watch → auto-merge or park with needs-human',
  whenToUse:
    'Run Ordböj board tickets autonomously. args: { tickets: [16, 18, 28] } — GitHub issue numbers in tugrulcan/ordboj. Risky classes (localStorage schema, verb-data correctness, dependency major bump, cross-owner) never auto-merge.',
  phases: [
    { title: 'Triage', detail: 'read issue, pick owner role, model, risk class' },
    { title: 'Implement', detail: 'owner-role agent in isolated worktree, test-first, opens PR' },
    { title: 'Review', detail: 'adversarial review of PR diff vs acceptance criteria' },
    { title: 'Ship', detail: 'watch CI, resolve rebase conflicts, merge or park' },
  ],
};

const REPO = 'tugrulcan/ordboj';

const tickets = Array.isArray(args) ? args : (args && args.tickets) || [];
if (!tickets.length)
  throw new Error(
    'args.tickets required: array of GitHub issue numbers, e.g. { tickets: [16, 18, 28] }',
  );

// ---------------------------------------------------------------- rules

const RULES = `
Hard rules (non-negotiable):
- Test first where the ticket is testable: write the failing test, then the fix. Never weaken or delete existing tests to pass.
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
    title: { type: 'string' },
    acceptance: {
      type: 'string',
      description: 'acceptance criteria distilled from the issue body',
    },
  },
  required: ['owner', 'model', 'risky', 'title', 'acceptance'],
};

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pr-opened', 'blocked'] },
    branch: { type: 'string' },
    prNumber: { type: 'number' },
    prUrl: { type: 'string' },
    evidence: { type: 'string', description: 'tail of lint/typecheck/test/build output' },
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
    if (!t) return null;
    return agent(
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

If you cannot proceed safely (needs files outside your ownership, uncertain Swedish, acceptance criteria ambiguous, tests cannot pass without weakening), do NOT push anything: return status 'blocked' with a precise blockReason.
${RULES}`,
      {
        label: `impl:#${n}`,
        phase: 'Implement',
        schema: IMPL_SCHEMA,
        agentType: t.owner,
        model: t.model,
        isolation: 'worktree',
      },
    ).then((impl) => (impl ? { ...impl, triage: t } : null));
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
- File-ownership violations (CLAUDE.md table) or edits to src/components/ui/**.
- Any localStorage shape change without version+migration.
- Any Swedish string change that could be wrong (conjugation, spelling).
Return approved=true only if nothing material is wrong. List every finding either way.`,
      { label: `review:#${n}`, phase: 'Review', schema: REVIEW_SCHEMA, model: 'opus' },
    ).then((rev) => ({ ...r, review: rev }));
  },

  // ---- Ship: CI watch, conflict handling, merge or park
  (r, n) => {
    if (!r) return { ticket: n, status: 'failed', detail: 'earlier stage returned nothing' };
    if (r.status === 'blocked')
      return {
        ticket: n,
        status: 'parked',
        detail: 'blocked before PR: ' + (r.blockReason || 'unknown'),
      };
    const risky = r.triage.risky;
    const approved = r.review && r.review.approved;
    return agent(
      `You are the ship agent for PR #${r.prNumber} in ${REPO} (issue #${n}).
Context: review approved=${approved}; findings: ${JSON.stringify((r.review && r.review.findings) || [])}. Risky class=${risky}${risky ? ' (' + (r.triage.riskyReason || '') + ')' : ''}.

Ensure the 'needs-human' label exists (ignore error if it does):
gh label create needs-human --repo ${REPO} --color D93F0B --description "agent parked, human decision needed" || true

Case A — review NOT approved:
Comment the findings on the PR, add label needs-human, do NOT merge. Return parked.

Case B — review approved:
1. Watch CI: gh pr checks ${r.prNumber} --repo ${REPO} --watch --interval 30 (if this exceeds your command timeout, poll gh pr checks in a loop instead; overall give CI up to ~20 minutes).
2. CI red: read the failing job log (gh run view --log-failed). If the failure is clearly caused by this PR and trivially fixable is NOT your call — you do not edit code. Comment the failing lines on the PR, add needs-human, return parked.
3. CI green and risky=${risky}:
   - risky true: comment "CI green, review clean — risky class (${r.triage.riskyReason || 'risky'}), waiting for human approval", add needs-human, return parked.
   - risky false: merge with gh pr merge ${r.prNumber} --repo ${REPO} --squash --delete-branch.
     If merge fails due to conflicts: clone-checkout the PR branch in a temp dir (gh pr checkout inside a fresh 'git worktree add'), rebase onto origin/main, resolve MECHANICAL conflicts only (imports, adjacent lines), run npm test, force-push with --force-with-lease, re-watch CI once, then merge. If the conflict is semantic (two changes to the same behavior), do not guess: comment, needs-human, return parked.
4. Return merged with a one-line detail.
Never edit application source. Never weaken tests. Never merge a risky-class or unapproved PR.`,
      { label: `ship:#${n}`, phase: 'Ship', schema: SHIP_SCHEMA, model: 'sonnet' },
    ).then((s) => ({
      ticket: n,
      prUrl: r.prUrl,
      prNumber: r.prNumber,
      owner: r.triage.owner,
      risky,
      ...s,
    }));
  },
);

const summary = results.filter(Boolean);
log(
  `ticket-pilot done: ${summary.filter((s) => s.status === 'merged').length} merged, ${summary.filter((s) => s.status === 'parked').length} parked, ${summary.filter((s) => s.status === 'failed').length} failed`,
);
return summary;
