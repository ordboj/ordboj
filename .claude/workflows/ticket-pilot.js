export const meta = {
  name: 'ticket-pilot',
  description:
    'Per-ticket pipeline: triage → implement (or adopt existing open PR) → adversarial review → bounded remediation loop → Fable owner-gate for risky/contested merges → CI watch with remediation retry → ready-to-merge handoff; the LEAD merges with the human approval from the chat, then closes issues and moves the board. Park only when the owner-gate cannot decide',
  whenToUse:
    'Run Ordböj board tickets autonomously. args: { tickets: [16, 18, 28] } — GitHub issue numbers in ordboj/ordboj. Re-running a ticket that already has an open PR ADOPTS that PR (remediate → merge) instead of opening a duplicate. "Decide/Spec/Define/Research" tickets produce a merged decision doc, written by Fable acting as product owner. Review rejections get up to 2 remediation rounds on the same branch before anyone considers parking. Risky classes (localStorage schema, verb-data, major bump, cross-owner) are decided by the Fable owner-gate — clear with rationale or park with one precise question — never parked unconditionally. Ship agents never run gh pr merge: a subagent cannot prove human approval to the safety layer, so they return status "ready" and the lead session performs every merge itself (update-branch, merge --squash, close issue, board to Done) under the human approval given in the conversation.',
  phases: [
    {
      title: 'Triage',
      detail:
        'read issue, detect existing open PR (adopt, never duplicate), pick owner/model/risk, code-vs-decision kind; overlapping tickets serialize',
    },
    {
      title: 'Implement',
      detail:
        'code tickets: owner-role agent in worktree from fresh main; decision tickets: Fable writes the decision doc; adopted PRs skip to review',
    },
    {
      title: 'Assist',
      detail: 'on needs-help, helper role agent contributes its own files to the branch',
    },
    {
      title: 'QA',
      detail: 'qa agent adds fail-first-proven tests to the PR branch (test files are qa-owned)',
    },
    {
      title: 'Review',
      detail:
        'adversarial review of PR diff vs acceptance criteria; stale-body / diff-churn / CI-red / conflicts are REMEDIABLE findings, not park reasons',
    },
    {
      title: 'Remediate',
      detail: 'bounded loop (max 2 rounds total): fix findings on the same branch, re-review',
    },
    {
      title: 'Gate',
      detail:
        'Fable owner-gate decides risky-class and still-contested PRs: merge with rationale, or park with the exact question the human must answer',
      model: 'fable',
    },
    {
      title: 'Ship',
      detail:
        'update branch from main, poll CI, run the local E2E smoke gate (playwright mobile-chrome); CI-red or smoke-red routes back to remediation once; on green return ready-to-merge — the lead merges and updates the board',
    },
  ],
};

const REPO = 'ordboj/ordboj';
// Per-ticket cap on fix-and-re-review rounds (shared with the one CI-red retry).
const MAX_REMEDIATIONS = 2;

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
// agents hold one owner's files), and ship preps run one at a time. Ships no
// longer merge (the lead merges with the human's approval after the run), so
// inside a file-overlap group a later ticket may branch from a main that does
// NOT yet contain the earlier ticket's changes. The ship agent's CONFLICTING
// procedure absorbs the mechanical fallout; semantic conflicts park.
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

// ASD-STE100 style for every human-visible GitHub text (PR bodies, comments).
const STYLE = `
PR-body and comment style (mandatory):
- Keep the PR body very short: "Closes #<n>", then at most 4 lines (what changed, why), then the evidence block. No feature lists. No section headers.
- Keep every PR or issue comment very short: at most 3 sentences.
- Write in ASD-STE100 style: active voice, simple tenses, one fact per sentence, at most 20 words per sentence, one meaning per word, no noun clusters.
- Do not add filler, praise, or restated diff content.
`;

const RULES = `
Hard rules (non-negotiable):
- Do not weaken tests. Do not delete tests. All existing tests must stay green.
- Do not edit test files (*.test.ts, *.test.tsx, src/test/**, vitest.config.ts). The qa role owns them. If your change needs a test-file edit, return needs-help with helpRole "qa".
- Obey the file-ownership table in CLAUDE.md. If your change needs a file that a different role owns, return needs-help and name that role. Do not edit that file.
- Do not guess Swedish. If a Swedish form is not certain, return blocked and state the question.
- Do not change the localStorage data shape without a version field and a forward migration.
- Keep the diff minimal. Do not reformat lines that you do not change functionally. Do not run Prettier on a whole file. Do not convert quote styles. Do not re-wrap JSX that you do not change. Formatting churn causes merge conflicts with parallel work and is always a review finding.
- Push every commit to the PR branch on origin before you return. The worktree is temporary. A commit that is not pushed is lost.
- Before you return, run all four check commands and paste the tail of the real output as evidence:
  npm run lint && npm run typecheck && npm test && npm run build
  If a command fails, fix the cause or return blocked. Do not claim completion without evidence.
- Evidence must state the commit SHA of the branch head (git rev-parse HEAD). Evidence from an older commit is stale and not valid.
${STYLE}`;

// A worktree may not be able to `git checkout <branch>` directly because
// another active worktree already holds that branch. The standard procedure
// (do this ALWAYS, do not improvise):
const BRANCH_CHECKOUT_PROCEDURE = (branch, localName) => `
Branch checkout procedure. A different worktree can hold ${branch}, so do not run 'git checkout ${branch}' directly. Always use these steps:
  git fetch origin
  git checkout -b ${localName} origin/${branch}
  (make your changes and commit them)
  git push origin HEAD:${branch}
`;

// ---------------------------------------------------------------- schemas

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['code', 'decision'],
      description:
        "'decision' when the ticket asks for a product/pedagogy ruling, spec or research verdict (titles often start Decide/Spec/Define/Research) rather than a code change",
    },
    owner: {
      type: 'string',
      enum: [
        'swedish-linguist',
        'srs-engine',
        'staff-engineer',
        'devops',
        'frontend-expert',
        'qa',
        'product-manager',
        'learning-designer',
      ],
      description:
        'code tickets: role owning every touched file; decision tickets: product-manager (scope/feature) or learning-designer (pedagogy)',
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
    files: {
      type: 'array',
      items: { type: 'string' },
      description:
        'best-effort repo-relative paths of production files this ticket will likely touch (used to serialize overlapping tickets)',
    },
    fixtureBreakExpected: {
      type: 'boolean',
      description:
        'true if the change predictably breaks existing test fixtures (e.g. removes/renames a field that test fixtures hardcode)',
    },
    existingPr: {
      type: 'number',
      description:
        'number of an OPEN PR already implementing this issue (0 if none) — that PR is adopted instead of opening a duplicate',
    },
    existingPrBranch: {
      type: 'string',
      description: 'headRefName of the existing open PR, empty string if none',
    },
    title: { type: 'string' },
    acceptance: {
      type: 'string',
      description: 'acceptance criteria distilled from the issue body',
    },
  },
  required: [
    'kind',
    'owner',
    'model',
    'risky',
    'needsTests',
    'files',
    'existingPr',
    'title',
    'acceptance',
  ],
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
    evidence: {
      type: 'string',
      description:
        'tail of lint/typecheck/test/build output, including the commit SHA it was captured on',
    },
    fixtureFailures: {
      type: 'boolean',
      description:
        'true if npm test fails ONLY in qa-owned fixtures that reference something the change intentionally removed/renamed (QA stage repairs them)',
    },
    blockReason: { type: 'string' },
  },
  required: ['status'],
};

const QA_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['tests-added', 'not-needed', 'blocked'] },
    evidence: {
      type: 'string',
      description:
        'tail of npm test / typecheck output, plus fail-first proof (new tests failing against pre-fix code)',
    },
    blockReason: { type: 'string' },
  },
  required: ['status'],
};

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    remediable: {
      type: 'boolean',
      description:
        'when approved=false: true if every finding is fixable by a bounded follow-up commit on this branch (stale PR body, formatting churn, missing tests, CI red, conflicts); false ONLY for genuine design/correctness defects that invalidate the approach',
    },
    findings: { type: 'array', items: { type: 'string' } },
    remediation: {
      type: 'string',
      description:
        'when approved=false: concrete fix instructions for the remediation agent — exact files, exact edits, exact PR-body corrections',
    },
  },
  required: ['approved', 'findings'],
};

const GATE_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['merge', 'park'] },
    rationale: { type: 'string', description: '1-3 sentences: why this call' },
    question: {
      type: 'string',
      description:
        'only with decision=park: the single precise question the human must answer to unblock',
    },
  },
  required: ['decision', 'rationale'],
};

const SHIP_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ready', 'merged', 'parked', 'ci-red', 'failed'] },
    detail: { type: 'string' },
  },
  required: ['status', 'detail'],
};

// ---------------------------------------------------------------- triage
// Barrier on purpose: file-overlap groups can only be computed once ALL
// triages are in (cross-item dependency). Triage is cheap/fast.

const triaged = (
  await parallel(
    tickets.map(
      (n) => () =>
        agent(
          `Read GitHub issue #${n} in ${REPO}: gh issue view ${n} --repo ${REPO} --json title,body,labels
Then read the file-ownership table in CLAUDE.md in the repo root.
Classify the ticket. Fill each field as follows:
- kind: set 'decision' if the deliverable is a written product or pedagogy decision, spec, or research verdict, not code. Titles of such tickets often start with Decide, Spec, Define, or Research. Otherwise set 'code'.
- existingPr and existingPrBranch: look for an open PR that already implements this issue. Run:
  gh issue view ${n} --repo ${REPO} --json closedByPullRequestsReferences
  gh pr list --repo ${REPO} --state open --search "${n} in:body" --json number,headRefName,updatedAt
  If an open PR exists, set existingPr to its number and existingPrBranch to its headRefName. If several exist, pick the most recently updated. If none exists, set existingPr=0 and existingPrBranch="".
- owner: for code tickets, the role that owns every file this ticket touches. If the ticket truly spans two owners, pick the primary owner and set risky=true with riskyReason "cross-owner". For decision tickets, pick product-manager (scope or feature) or learning-designer (pedagogy).
- model: 'sonnet' by default. Set 'opus' only if the ticket changes localStorage schema or migration code, or is an architectural change.
- risky: set true if the ticket changes any of these: localStorage schema or shape, Swedish verb data (content of verbData.ts or swedish_verbs.csv), a dependency major version, or files of more than one owner. Decision tickets are never risky. Otherwise set false.
- needsTests: set true if the ticket changes testable behavior (logic, data handling, component behavior). Set false for pure config, formatting, or docs work.
- files: list the repo-relative production file paths that the fix will likely touch. Grep the repo if you are not sure. The pipeline uses this list to serialize tickets that touch the same file, so include a file when in doubt. For decision tickets, list the predicted doc path under docs/product/ or docs/learning/.
- fixtureBreakExpected: set true if the change removes or renames something that existing test fixtures likely hardcode, for example a settings field, an export, or a prop.
- acceptance: write the concrete acceptance criteria from the issue body.
Return only the structured result.`,
          {
            label: `triage:#${n}`,
            phase: 'Triage',
            schema: TRIAGE_SCHEMA,
            effort: 'low',
            model: 'sonnet',
          },
        ).then((t) => ({ n, t })),
    ),
  )
).filter(Boolean);

// Union-find over predicted-file overlap: tickets sharing any file run
// serially in one group; disjoint groups run in parallel.
const parent = triaged.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < triaged.length; i++) {
  for (let j = i + 1; j < triaged.length; j++) {
    const a = new Set(((triaged[i].t && triaged[i].t.files) || []).map((f) => f.toLowerCase()));
    const hit = ((triaged[j].t && triaged[j].t.files) || []).some((f) => a.has(f.toLowerCase()));
    if (hit) parent[find(i)] = find(j);
  }
}
const groupMap = new Map();
triaged.forEach((x, i) => {
  const r = find(i);
  if (!groupMap.has(r)) groupMap.set(r, []);
  groupMap.get(r).push(x);
});
const groups = [...groupMap.values()];
groups
  .filter((g) => g.length > 1)
  .forEach((g) => log(`serializing overlapping tickets: ${g.map((x) => '#' + x.n).join(' → ')}`));

// Tickets triage missed entirely: park visibly, keep going with the rest.
const missing = tickets.filter((n) => !triaged.some((x) => x.n === n));

// ---------------------------------------------------------------- stages

// Isolated worktrees are created from the primary tree's current HEAD. Pull
// latest main in the repo root FIRST so every implement worktree is born from
// fresh main, not a stale local copy. Serialized under one lock so concurrent
// tickets never race the pull.
function syncMainBeforeWorktree(n) {
  return withLock('main-sync', () =>
    agent(
      `You are in the ordboj repo root, not in an isolated worktree. Update local main so the next worktree starts from the latest main. Use the Bash tool:
1. Run: git fetch origin
2. Read the current branch: git rev-parse --abbrev-ref HEAD
   - If HEAD is main, and git status shows no merge or rebase in progress: run git pull --ff-only origin main
   - If HEAD is not main: run git fetch origin main:main. This updates the main ref without a checkout. If git refuses because a different worktree holds main, that is acceptable: origin/main is already fresh from step 1.
Do not check out a different branch. Do not reset. Do not touch working files.
Return exactly one line: "main at <output of git rev-parse origin/main>".`,
      {
        label: `sync-main:#${n}`,
        phase: 'Implement',
        effort: 'low',
        model: 'sonnet',
      },
    ),
  );
}

function parkNoPr(n, r, reason) {
  return agent(
    `Automation parked ticket #${n} in ${REPO} before a PR was opened.
Reason: ${reason}

Record the parked state on GitHub. Use the Bash tool:
1. Make sure the label exists. This command creates or updates it and never errors:
   gh label create needs-human --repo ${REPO} --color D93F0B --description "agent parked, human decision needed" --force
2. Comment the reason on the issue: gh issue comment ${n} --repo ${REPO} --body "..."
   Keep the comment at most 3 sentences. Use ASD-STE100 style: active voice, simple tenses, one fact per sentence.
3. Add the label to the issue: gh issue edit ${n} --repo ${REPO} --add-label needs-human
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
    owner: r && r.triage && r.triage.owner,
    status: 'parked',
    detail: (s && s.detail) || reason,
  }));
}

function parkWithPr(n, r, reason) {
  return agent(
    `The owner-gate parked PR #${r.prNumber} in ${REPO} (issue #${n}).
Reason: ${reason}

Record the parked state on GitHub. Use the Bash tool:
1. Run: gh label create needs-human --repo ${REPO} --color D93F0B --description "agent parked, human decision needed" --force
2. Comment the reason on the PR. Include any question for the human verbatim: gh pr comment ${r.prNumber} --repo ${REPO} --body "..."
   Keep the comment at most 3 sentences plus the question. Use ASD-STE100 style: active voice, simple tenses, one fact per sentence.
3. Add the label to both the PR and the issue: gh pr edit ${r.prNumber} --repo ${REPO} --add-label needs-human ; gh issue edit ${n} --repo ${REPO} --add-label needs-human
Return status 'parked' with a one-line detail.`,
    {
      label: `park:#${n}`,
      phase: 'Ship',
      schema: SHIP_SCHEMA,
      effort: 'low',
      model: 'sonnet',
    },
  ).then((s) => (s && s.status ? s : { status: 'parked', detail: reason }));
}

// On needs-help (from implement OR remediation), a helper-role agent
// contributes its own files to the same branch.
function runAssist(n, r) {
  return withLock('owner:' + r.helpRole, () =>
    agent(
      `You are the ${r.helpRole} on the Ordböj team. The ${r.triage.owner} who implements issue #${n} ("${r.triage.title}") on branch ${r.branch} asks for your help:
${r.helpRequest}

You are in an isolated git worktree.
${BRANCH_CHECKOUT_PROCEDURE(r.branch, `assist-${n}-work`)}
Steps:
1. Check out the branch with the procedure above. Do not run plain 'git checkout ${r.branch}'.
2. Make only the requested change. Stay inside the files that your role owns (CLAUDE.md table).
3. Run all four check commands (lint, typecheck, test, build). All must pass. Capture the output and the commit SHA.
4. Commit, then push to the same branch: git push origin HEAD:${r.branch}
5. Find the PR for this branch: gh pr list --repo ${REPO} --head ${r.branch}. If the PR is a draft, run gh pr ready. If no PR exists, open one: gh pr create --repo ${REPO} --title "..." --body "Closes #${n} ...".
6. Return status 'pr-opened' with branch, prNumber, prUrl, and evidence.
If you cannot make the change safely, return status 'blocked' with a precise blockReason. Do not return needs-help yourself.
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
          ...r,
          ...h,
          branch: h.branch || r.branch,
          prNumber: h.prNumber || r.prNumber,
          prUrl: h.prUrl || r.prUrl,
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
}

// Decision tickets ("Decide/Spec/Define/Research") produce a written decision
// note instead of code. The repo owner has delegated these product/pedagogy
// calls to this stage (see whenToUse); the note lands as a normal docs PR.
function implementDecision(n, t) {
  return agent(
    `Issue #${n} ("${t.title}") in ${REPO} asks for a product or pedagogy decision, not code. Act in the ${t.owner} role and write the decision note that the ticket asks for.
Acceptance criteria:
${t.acceptance}

You are in an isolated git worktree. Steps:
1. Run: git fetch origin. Then run: git checkout -b docs/${n}-<short-slug> origin/main
2. Read the full issue: gh issue view ${n} --repo ${REPO} --json title,body
3. Read the related material: existing notes in docs/product/ and docs/learning/, the relevant source files, and CLAUDE.md. Base the ruling on how the app works today.
4. Write a conclusive note. Choose concrete defaults. Fix real numbers. Resolve every trade-off that the issue raises. An engineer must be able to implement the note without follow-up questions. Do not write a list of options. Write one ruling with its rationale. Return blocked only when the ruling needs external facts that you cannot obtain.
5. Put the note in docs/learning/ for pedagogy, or in docs/product/ for product scope and features. Match the file naming and structure of the existing notes there. Use a date-prefixed filename if the existing notes use one.
6. The diff is docs-only, so run only npm run lint as evidence. The Prettier format gate must pass on the new file. The other three check commands are not required.
7. Commit with message "docs: ... (#${n})". Push: git push -u origin HEAD. Open the PR: gh pr create --repo ${REPO} --title "docs: <title> (#${n})" --body "Closes #${n}" plus a three-line summary of the ruling and the lint evidence with the SHA.
8. Return status 'pr-opened' with branch, prNumber, prUrl, and evidence.
Push every commit before you return. A commit that stays only in the worktree is lost.
Do not guess Swedish. If the ruling depends on a Swedish form that you cannot check, return blocked with the precise question.
${STYLE}`,
    {
      label: `decide:#${n}`,
      phase: 'Implement',
      schema: IMPL_SCHEMA,
      model: 'fable',
      isolation: 'worktree',
    },
  );
}

function runReview(n, r, round) {
  const reReviewNote = round
    ? `\nThis is re-review round ${round} after remediation. Check that the previous findings are resolved at the current head. Also check for regressions that the fix introduced.`
    : '';
  const adoptedNote = r.adopted
    ? `\nAn earlier run opened this PR and possibly parked it. It can carry a needs-human label and stale review comments. Judge only the current head. Earlier objections can already be fixed.`
    : '';
  return agent(
    `Review PR #${r.prNumber} in ${REPO} as an adversary. The PR claims to fix issue #${n}: "${r.triage.title}". Try to refute the claim that the PR is correct and complete.
Get the diff: gh pr diff ${r.prNumber} --repo ${REPO}
Get the issue: gh issue view ${n} --repo ${REPO} --json title,body
Get the PR state: gh pr view ${r.prNumber} --repo ${REPO} --json mergeable,mergeStateStatus,headRefOid,body
${reReviewNote}${adoptedNote}
Check each point:
- Does the diff satisfy every acceptance criterion? ${r.triage.acceptance}
- Are there correctness bugs, edge cases, broken tests, or weakened tests?
- needsTests=${r.triage.needsTests}. If true: does the branch contain meaningful tests that pin the new behavior? Does the QA evidence show fail-first proof?
- Does the diff violate the file-ownership table in CLAUDE.md? Does it edit src/components/ui/**?
- Does the diff change a localStorage shape without a version field and a migration?
- Does the diff change a Swedish string that can be wrong (conjugation, spelling)?
- Diff hygiene: does the diff reformat lines that are not part of the fix? Is the PR body stale, or does it describe the code incorrectly? Is the branch CONFLICTING or BEHIND against main? Is CI red on the head commit?

Report every finding. Write each finding as one short sentence in ASD-STE100 style: active voice, simple tense, one fact per sentence, at most 20 words. Then classify the overall result:
- approved=true: nothing material is wrong with the code. List description-only imperfections as findings.
- approved=false and remediable=true: one follow-up commit on this branch can fix all findings. Examples: stale or incorrect PR body, unrelated formatting churn, missing tests, CI red on head, CONFLICTING or BEHIND branch, stale evidence. A remediation stage runs next, and a re-review follows it.
- approved=false and remediable=false: at least one finding invalidates the approach itself. Examples: acceptance criteria not met, wrong behavior, data loss, weakened tests, wrong Swedish, ownership violations.
When approved=false, fill 'remediation' with concrete instructions: the exact files, the exact edits, and the exact PR-body corrections.`,
    // review pinned to opus: strongest affordable tier (session model too expensive)
    {
      label: `review:#${n}${round ? ':r' + round : ''}`,
      phase: 'Review',
      schema: REVIEW_SCHEMA,
      model: 'opus',
    },
  );
}

function runRemediate(n, r, rev, round) {
  const lockKey =
    'owner:' + (r.triage.kind === 'decision' ? 'decision-' + r.triage.owner : r.triage.owner);
  const opts = {
    label: `fix:#${n}:r${round}`,
    phase: 'Remediate',
    schema: IMPL_SCHEMA,
    model: 'sonnet',
    isolation: 'worktree',
  };
  if (r.triage.kind !== 'decision') opts.agentType = r.triage.owner;
  return withLock(lockKey, () =>
    agent(
      `Fix the review findings on PR #${r.prNumber} in ${REPO} (branch ${r.branch}, issue #${n}: "${r.triage.title}"). This is remediation round ${round} of ${MAX_REMEDIATIONS}.

Findings:
${(rev.findings || []).map((f) => '- ' + f).join('\n')}

Remediation instructions from the reviewer:
${rev.remediation || '(none provided: derive the fixes from the findings)'}

You are in an isolated git worktree.
${BRANCH_CHECKOUT_PROCEDURE(r.branch, `fix-${n}-r${round}`)}
Fix only what the findings require. Do not add scope. Standard remedies:
- Stale or incorrect PR body: rewrite it to match the current head. Run: gh pr edit ${r.prNumber} --repo ${REPO} --body "..." with an accurate description, fresh evidence, and the current SHA.
- Unrelated formatting churn: revert those hunks to the formatting of origin/main, so that the diff contains only functional changes.
- Branch CONFLICTING or BEHIND: merge origin/main into the branch. Resolve only mechanical conflicts (imports, adjacent lines). If a conflict is semantic (two changes to the same behavior), return blocked and describe the exact conflict.
- CI red on head: run gh run view --log-failed. Fix the root cause in files that your role owns.
- Missing tests, or fixes inside test files: the qa role owns test files. Return needs-help with helpRole "qa" and a precise request.
After code fixes: run all four check commands, commit, push (git push origin HEAD:${r.branch}), and update the evidence block in the PR body with the new SHA.
Return 'pr-opened' when the branch is fixed and pushed. Return 'needs-help' with helpRole and helpRequest when a fix lies in files of a different role. Return 'blocked' when a fix is not possible.
${RULES}`,
      opts,
    ),
  );
}

// The owner-gate arbitrates merges that previously waited for the human:
// risky-class PRs and reviews still contested after remediation. The repo
// owner delegated these calls to this stage (see whenToUse).
function runGate(n, r, rev) {
  const risky = r.triage.risky && r.triage.kind !== 'decision';
  return agent(
    `You are the merge arbiter for Ordböj. You act as the project owner's delegate. Decide for PR #${r.prNumber} in ${REPO}: 'merge' or 'park'.

Context: issue #${n} "${r.triage.title}". Risky class: ${risky}${risky ? ' (' + (r.triage.riskyReason || 'unspecified') + ')' : ''}. Review approved: ${!!(rev && rev.approved)}. Outstanding findings: ${JSON.stringify((rev && rev.findings) || [])}.

Inspect the PR yourself. Do not decide from the summary alone. Run:
gh pr diff ${r.prNumber} --repo ${REPO}
gh pr view ${r.prNumber} --repo ${REPO} --json mergeable,mergeStateStatus,statusCheckRollup,body
gh issue view ${n} --repo ${REPO} --json title,body

Always park, and state the exact question, when one of these is true:
- The diff changes verb data and contains a conjugation that you cannot check. Wrong Swedish is worse than missing Swedish. The question is the specific linguistic uncertainty.
- The diff changes a localStorage shape and has no version field or no forward migration. When a correct migration with tests is present, you can approve. That approval is inside your mandate.
- The diff weakens or deletes tests.

In all other cases, weigh the real trade-off. A parked PR goes stale: main moves on, the branch conflicts, and the work dies. That was the dominant failure mode of this project. Park only when a merge would risk user data, teach wrong Swedish, or ship broken behavior. These points alone do not justify a park: a cosmetic finding, an imperfect PR description, a risk-class label on a change that you checked and found sound. A dependency major bump with green CI and no behavioral findings is mergeable. A cross-owner diff with two coherent halves is mergeable.

Return decision merge|park and a rationale of 1-3 sentences. On park, also return 'question': the single precise question that the human must answer to unblock. You are read-only. Do not run gh mutations. Do not edit files. The pipeline acts on your decision.`,
    { label: `gate:#${n}`, phase: 'Gate', schema: GATE_SCHEMA, model: 'fable' },
  );
}

function runShip(n, r, authorizedBy, attempt) {
  return agent(
    `You are the ship agent for PR #${r.prNumber} in ${REPO} (issue #${n}). The owner-gate cleared this PR (${authorizedBy}). Your job is to make it ready to merge and report back. You never merge: the lead session performs the merge with the human's approval. Use the Bash tool for all commands.

Make sure the 'needs-human' label exists. This command creates or updates it and never errors:
gh label create needs-human --repo ${REPO} --color D93F0B --description "agent parked, human decision needed" --force

1. Read the merge state: gh pr view ${r.prNumber} --repo ${REPO} --json mergeStateStatus,mergeable,headRefOid
2. If the branch is BEHIND main: update it. First try: gh api -X PUT repos/${REPO}/pulls/${r.prNumber}/update-branch. If the API refuses, update manually: create a fresh worktree with 'git worktree add', run git checkout -b tmp origin/<branch>, run git merge origin/main, then push with git push origin HEAD:<branch>.
   If the branch is CONFLICTING: use the same manual procedure. Resolve only mechanical conflicts (imports, adjacent lines). Run npm test. Push. If a conflict is semantic (two changes to the same behavior): comment on the PR, add needs-human to the PR and the issue, and return 'parked'.
3. Watch CI by polling. Run gh pr checks ${r.prNumber} --repo ${REPO}. Repeat the command about every 60 seconds until every check has concluded, up to about 20 minutes. Do not use --watch, because it can outlive the command timeout.
   If no checks appear at all: trigger CI once with an empty commit. Create a fresh worktree, run git checkout -b tmp2 origin/<branch>, then git commit --allow-empty -m "ci: trigger", then git push origin HEAD:<branch>. Poll again. If checks still do not appear: comment, add needs-human to the PR and the issue, and return 'parked'.
4. If CI is red: read the failing job with gh run view --log-failed. Do not park. Do not edit code. Return status 'ci-red' and put the decisive failing lines in detail. The pipeline routes the failure to a remediation agent.
5. If CI is green: check that the concluded checks ran on the current head. Compare with headRefOid. Checks from an older head do not count. Poll until the checks of the current head conclude. Do NOT merge.
6. E2E smoke gate (runs after CI is green, before 'ready'). In a fresh worktree checked out at the PR head: run npm ci if node_modules is absent, then run npx playwright test --project=mobile-chrome. Requirements: use the LOCAL Playwright install via npx, never a global binary; the dev server binds port 4173 with strictPort, so make sure no other server holds that port (kill your own leftover servers only). Budget: the suite takes well under 5 minutes; give the command a 10-minute timeout.
   - If the smoke suite passes: continue to step 7.
   - If it fails: capture the failing spec names and the decisive error lines. Do not edit code. Do not park. Return status 'ci-red' with those lines in detail — the pipeline routes it to remediation exactly like a red CI check.
   - If the suite cannot run at all in this environment (browser missing, install blocked): do NOT fail the ticket for that. Note "smoke gate skipped: <reason>" in detail and continue to step 7 — CI remains the authoritative gate.
7. When the current head is green:
   - Remove stale park labels. Ignore errors: gh pr edit ${r.prNumber} --repo ${REPO} --remove-label needs-human ; gh issue edit ${n} --repo ${REPO} --remove-label needs-human
8. Return 'ready' with a one-line detail that names the green head SHA and states the smoke-gate outcome (passed / skipped: <reason>). The lead merges, closes issue #${n}, and moves the board item to Done.
Do not edit application source. Do not weaken tests.
When you comment on a PR or issue: keep the comment at most 3 sentences. Use ASD-STE100 style: active voice, simple tenses, one fact per sentence.`,
    {
      label: `ship:#${n}${attempt > 1 ? ':retry' : ''}`,
      phase: 'Ship',
      schema: SHIP_SCHEMA,
      model: 'sonnet',
    },
  );
}

async function runTicket(n, t, serializedAfter) {
  if (!t) return parkNoPr(n, null, 'triage agent returned nothing');

  let r;
  if (t.existingPr) {
    // Adopt the open PR from an earlier run instead of opening a duplicate;
    // review + remediation below bring it up to date.
    log(`#${n}: adopting existing open PR #${t.existingPr} (${t.existingPrBranch})`);
    r = {
      status: 'pr-opened',
      prNumber: t.existingPr,
      branch: t.existingPrBranch,
      prUrl: `https://github.com/${REPO}/pull/${t.existingPr}`,
      adopted: true,
      triage: t,
    };
  } else if (t.kind === 'decision') {
    await syncMainBeforeWorktree(n);
    const d = await withLock('owner:decision-' + t.owner, () => implementDecision(n, t));
    r = d
      ? { ...d, triage: t }
      : { status: 'blocked', blockReason: 'decision agent returned nothing', triage: t };
  } else {
    // ---- Implement
    const serialNote = serializedAfter
      ? `\nNote: this ticket runs after #${serializedAfter} because both tickets touch the same files. That ticket's PR may still be OPEN (ready-to-merge, waiting for the lead) — its changes are then NOT on main yet. Branch from a freshly fetched origin/main, expect a possible conflict with that PR's branch later, and keep your diff minimal so the conflict stays mechanical. Do not branch from the local main of the worktree, because it can be stale.`
      : '';
    const fixtureNote = t.fixtureBreakExpected
      ? `\nExpected fixture breakage: triage predicts that your change breaks existing test fixtures that hardcode what you remove or rename. This is acceptable and does not mean needs-help. Condition: npm test fails only in qa-owned test files whose fixtures reference the thing that you intentionally changed, and every other suite is green. When this condition holds: open the PR as a draft (gh pr create --draft), set fixtureFailures=true, list the failing tests in the evidence, and return 'pr-opened'. The QA stage runs next on your branch and repairs the fixtures. Do not edit test files yourself. Do not wait for help.`
      : '';
    await syncMainBeforeWorktree(n);
    const impl = await withLock('owner:' + t.owner, () =>
      agent(
        `Implement GitHub issue #${n} in ${REPO}: "${t.title}".
Acceptance criteria:
${t.acceptance}
${serialNote}${fixtureNote}

You are in an isolated git worktree that was created from a freshly pulled main. Steps:
1. Run: git fetch origin. Then create the branch from origin/main, even though the worktree base is fresh: git checkout -b ticket/${n}-<short-slug> origin/main
2. Read the full issue: gh issue view ${n} --repo ${REPO} --json title,body
3. Implement the fix. Follow the rules below. Stay inside the files that your role owns (CLAUDE.md table). Keep the diff minimal. Do not reformat untouched lines.
4. Commit. Then run all four check commands. Capture the real output and the commit SHA (git rev-parse HEAD).
5. Use a conventional commit message that references the issue. Push: git push -u origin HEAD
6. Open the PR: gh pr create --repo ${REPO} --title "<type>: <title> (#${n})" --body "Closes #${n}\n\n<what changed, why>\n\n<check evidence with SHA>"
7. Check that CI started: gh pr checks <number> --repo ${REPO}. If no checks appear after about 2 minutes, trigger CI once with an empty commit (git commit --allow-empty -m "ci: trigger" && git push) and check again. State the outcome in the evidence.
8. Return status 'pr-opened' with branch, prNumber (from gh pr view --json number), prUrl, and evidence.

If the fix needs a change in files that a different role owns: do not edit those files. Complete and commit your part. Push the branch. Open the PR as a draft (gh pr create --draft ...). Return status 'needs-help' with helpRole and a precise helpRequest. The pipeline sends an agent of that role to the same branch.
If you cannot proceed safely at all (Swedish not certain, acceptance criteria ambiguous, tests cannot pass without weakening): do not push anything. Return status 'blocked' with a precise blockReason.
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
    );
    r = impl
      ? { ...impl, triage: t }
      : { status: 'blocked', blockReason: 'implement agent returned nothing', triage: t };
  }

  // ---- Assist: on needs-help, helper role agent contributes its own files
  if (r.status === 'needs-help') r = await runAssist(n, r);

  // ---- QA: fixture repair + fail-first-proven tests. Fresh code tickets only:
  // adopted PRs carry earlier QA work (the reviewer flags gaps; remediation
  // routes them to qa via needs-help), decision tickets are docs-only.
  if (r.status === 'pr-opened' && !r.adopted && t.kind !== 'decision') {
    if (!r.triage.needsTests && !r.fixtureFailures) {
      r = { ...r, qa: { status: 'not-needed' } };
    } else {
      const fixtureRepairNote = r.fixtureFailures
        ? `\nFixture repair first: the branch has failing tests now. Existing qa-owned fixtures reference something that the change intentionally removed or renamed. Update those fixtures to the new intended shape. Do not weaken a real behavioral assertion; adjust only fixture data and shape. Make the suite green. If the PR is a draft, run gh pr ready ${r.prNumber}.`
        : '';
      const qa = await agent(
        `You are the qa engineer. PR #${r.prNumber} in ${REPO} (branch ${r.branch}) implements issue #${n}: "${r.triage.title}".
Acceptance criteria:
${r.triage.acceptance}
${fixtureRepairNote}

You are in an isolated git worktree.
${BRANCH_CHECKOUT_PROCEDURE(r.branch, `qa-${n}-work`)}
Steps:
1. Check out the branch with the procedure above. Do not run plain 'git checkout ${r.branch}'.
2. Read the PR diff: gh pr diff ${r.prNumber} --repo ${REPO}. Write deterministic Vitest tests that pin the new behavior to the acceptance criteria. Write a regression test for each bug that the ticket fixes.
3. Edit only qa-owned files: *.test.ts, *.test.tsx, src/test/**, vitest.config.ts. Do not change production code. If the behavior is not testable without a production edit, return blocked and describe the defect.
4. Fail-first proof. This step is mandatory for every new test. First, revert the production files that the PR changed to their merge-base versions: git checkout $(git merge-base HEAD origin/main) -- <files>. Run your new tests. Check that they fail for the predicted reason. Then restore the branch versions byte for byte: git checkout HEAD -- <files>. Check that git diff shows no production changes. Run the tests again and check that they pass. A new test that passes against the pre-fix code is vacuous: rewrite it or drop it. Include both outputs (fail and pass) in the evidence.
5. Run npm test and npm run typecheck. Both must pass. Capture the real output and the commit SHA as evidence.
6. Commit with a "test: ..." message. Push to the same branch: git push origin HEAD:${r.branch}
Return status 'tests-added' with evidence, or 'blocked' with blockReason. If the PR already has adequate tests, return 'not-needed'.`,
        {
          label: `qa:#${n}`,
          phase: 'QA',
          schema: QA_SCHEMA,
          agentType: 'qa',
          model: 'sonnet',
          isolation: 'worktree',
        },
      );
      r =
        qa && qa.status === 'blocked'
          ? { ...r, status: 'blocked', blockReason: 'qa: ' + (qa.blockReason || 'unknown'), qa }
          : { ...r, qa };
    }
  }

  if (r.status !== 'pr-opened') {
    return parkNoPr(
      n,
      r,
      'blocked before merge (' + r.status + '): ' + (r.blockReason || 'unknown'),
    );
  }

  // ---- Review + bounded remediation loop
  let rounds = 0;
  let rev = await runReview(n, r);
  while (rev && !rev.approved && rev.remediable !== false && rounds < MAX_REMEDIATIONS) {
    rounds++;
    let fix = await runRemediate(n, r, rev, rounds);
    if (fix && fix.status === 'needs-help') {
      const assisted = await runAssist(n, {
        ...r,
        helpRole: fix.helpRole,
        helpRequest: fix.helpRequest,
      });
      if (assisted.triage) r = { ...r, triage: assisted.triage };
      fix =
        assisted.status === 'pr-opened'
          ? assisted
          : { status: 'blocked', blockReason: assisted.blockReason };
    }
    if (!fix || fix.status !== 'pr-opened') {
      rev = {
        ...rev,
        remediable: false,
        findings: [
          ...(rev.findings || []),
          'remediation round ' +
            rounds +
            ' failed: ' +
            ((fix && fix.blockReason) || 'agent returned nothing'),
        ],
      };
      break;
    }
    rev = await runReview(n, r, rounds);
  }
  r = { ...r, review: rev };

  // ---- Gate: a clean review on a non-risky ticket merges directly. All
  // other outcomes go to the owner-gate, which returns merge or park.
  const risky = r.triage.risky && r.triage.kind !== 'decision';
  const approved = !!(rev && rev.approved);
  let authorizedBy;
  if (approved && !risky) {
    authorizedBy = 'clean review, non-risky class';
  } else {
    const gate = await runGate(n, r, rev);
    r = { ...r, gate };
    if (gate && gate.decision === 'merge') {
      authorizedBy = 'owner-gate: ' + gate.rationale;
    } else {
      const reason = gate
        ? gate.rationale + (gate.question ? ' QUESTION FOR HUMAN: ' + gate.question : '')
        : 'owner-gate returned nothing';
      const parked = await parkWithPr(n, r, reason);
      return {
        ticket: n,
        prNumber: r.prNumber,
        prUrl: r.prUrl,
        owner: t.owner,
        risky,
        adopted: !!r.adopted,
        rounds,
        status: 'parked',
        detail: (parked && parked.detail) || reason,
      };
    }
  }

  // ---- Ship: merges are serialized. One ci-red result gets one remediation
  // retry if the budget allows; a second ci-red parks.
  let s = await withLock('merge', () => runShip(n, r, authorizedBy, 1));
  if (s && s.status === 'ci-red' && rounds < MAX_REMEDIATIONS) {
    rounds++;
    const fix = await runRemediate(
      n,
      r,
      {
        findings: ['CI red on head: ' + s.detail],
        remediation:
          'Fix the failing CI on this branch. Decisive log lines from the ship agent: ' + s.detail,
      },
      rounds,
    );
    if (fix && fix.status === 'pr-opened') {
      s = await withLock('merge', () => runShip(n, r, authorizedBy, 2));
    }
  }
  if (s && s.status === 'ci-red') {
    s = await parkWithPr(n, r, 'CI still red after remediation: ' + s.detail);
  }

  return {
    ticket: n,
    prNumber: r.prNumber,
    prUrl: r.prUrl,
    owner: t.owner,
    risky,
    adopted: !!r.adopted,
    rounds,
    ...(s || { status: 'failed', detail: 'ship agent returned nothing' }),
  };
}

// ---------------------------------------------------------------- run
// Groups run in parallel; tickets INSIDE a group run strictly one after the
// other (implement through ship), each later ticket branching from the main
// that already absorbed the previous merge.

const groupRuns = await parallel(
  groups.map((g) => async () => {
    const out = [];
    for (let i = 0; i < g.length; i++) {
      const prevN = i > 0 ? g[i - 1].n : null;
      out.push(await runTicket(g[i].n, g[i].t, prevN));
    }
    return out;
  }),
);
const parkedMissing = await parallel(
  missing.map((n) => () => parkNoPr(n, null, 'triage agent returned nothing')),
);

const summary = [...groupRuns.filter(Boolean).flat(), ...parkedMissing].filter(Boolean);
log(
  `ticket-pilot done: ${summary.filter((s) => s.status === 'ready').length} ready-to-merge, ${summary.filter((s) => s.status === 'merged').length} merged, ${summary.filter((s) => s.status === 'parked').length} parked, ${summary.filter((s) => s.status === 'failed').length} failed`,
);
// LEAD: for every 'ready' result, in list order: confirm the human's merge
// approval from the conversation, then gh pr update-branch, wait for green CI
// on the new head, gh pr merge --squash --delete-branch, close the issue, and
// move the board item to Done. Re-update later ready branches after each
// merge, since main moves under them.
return summary;
