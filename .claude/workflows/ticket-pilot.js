export const meta = {
  name: 'ticket-pilot',
  description:
    'Per-ticket pipeline: triage → implement in isolated worktree → adversarial review → PR → CI watch → auto-merge or park with needs-human',
  whenToUse:
    'Run Ordböj board tickets autonomously. args: { tickets: [16, 18, 28] } — GitHub issue numbers in ordboj/ordboj. Tickets predicted to touch the same files run serially (chained on one branch-after-merge), disjoint tickets run in parallel. Risky classes (localStorage schema, verb-data correctness, dependency major bump, cross-owner) never auto-merge.',
  phases: [
    {
      title: 'Triage',
      detail:
        'read issue, pick owner role, model, risk class, predicted files; overlapping tickets serialize',
    },
    { title: 'Implement', detail: 'owner-role agent in isolated worktree, opens PR' },
    {
      title: 'Assist',
      detail: 'on needs-help, helper role agent contributes its own files to the branch',
    },
    {
      title: 'QA',
      detail: 'qa agent adds fail-first-proven tests to the PR branch (test files are qa-owned)',
    },
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
// never merged onto a main that just moved under it. File-overlap groups are
// serialized end-to-end (implement→ship) below, so a later ticket always
// branches from a main that already contains the earlier ticket's merge.
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
- MINIMAL DIFF: never reformat lines you do not functionally change. No Prettier sweeps, no quote-style conversion, no JSX re-wrapping of untouched code. The reviewer rejects formatting-only churn — it causes merge conflicts with parallel work.
- Before opening a PR, run all four and paste the tail of the real output as evidence:
  npm run lint && npm run typecheck && npm test && npm run build
  If any fails, fix it or report blocked. No completion claims without evidence.
- Evidence must state the commit SHA it was captured on (git rev-parse HEAD). Evidence captured on an older commit than the branch head is stale and invalid.
`;

// A worktree may not be able to `git checkout <branch>` directly because
// another active worktree already holds that branch. The standard procedure
// (do this ALWAYS, do not improvise):
const BRANCH_CHECKOUT_PROCEDURE = (branch, localName) => `
Branch checkout procedure (another worktree may hold ${branch} — never checkout the branch name directly):
  git fetch origin
  git checkout -b ${localName} origin/${branch}
  ...make your changes, commit...
  git push origin HEAD:${branch}
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
    title: { type: 'string' },
    acceptance: {
      type: 'string',
      description: 'acceptance criteria distilled from the issue body',
    },
  },
  required: ['owner', 'model', 'risky', 'needsTests', 'files', 'title', 'acceptance'],
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

// ---------------------------------------------------------------- triage
// Barrier on purpose: file-overlap groups can only be computed once ALL
// triages are in (cross-item dependency). Triage is cheap/fast.

const triaged = (
  await parallel(
    tickets.map(
      (n) => () =>
        agent(
          `Read GitHub issue #${n} in ${REPO} with: gh issue view ${n} --repo ${REPO} --json title,body,labels
Then read CLAUDE.md file-ownership table in the repo root.
Classify the ticket:
- owner: which role owns every file this ticket touches. If it genuinely spans two owners, pick the primary owner AND set risky=true with riskyReason "cross-owner".
- model: 'sonnet' by default; 'opus' only if the ticket changes localStorage storage schema/migration code or is an architectural change.
- risky: true if ANY of: localStorage schema/shape change, Swedish verb-data correctness change (verbData.ts / swedish_verbs.csv content), dependency major version bump, cross-owner change. Otherwise false.
- needsTests: true if the ticket changes testable behavior (logic, data handling, component behavior); false for pure config, formatting or docs work.
- files: best-effort list of repo-relative production file paths the fix will likely touch (grep the repo if unsure). Used to serialize tickets that would collide — err on the side of listing a file.
- fixtureBreakExpected: true if the change removes/renames something (a settings field, an export, a prop) that existing test fixtures likely hardcode.
- acceptance: distill concrete acceptance criteria from the issue body.
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

function parkNoPr(n, r, reason) {
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
    owner: r && r.triage && r.triage.owner,
    status: 'parked',
    detail: (s && s.detail) || reason,
  }));
}

async function runTicket(n, t, serializedAfter) {
  if (!t) return parkNoPr(n, null, 'triage agent returned nothing');

  // ---- Implement
  const serialNote = serializedAfter
    ? `\nNOTE: this ticket was serialized behind #${serializedAfter} because both touch the same files. That ticket's PR may have JUST merged — you MUST branch from a freshly fetched origin/main, not from the worktree's possibly stale local main.`
    : '';
  const fixtureNote = t.fixtureBreakExpected
    ? `\nEXPECTED FIXTURE BREAKAGE: triage predicts your change breaks existing test fixtures that hardcode what you remove/rename. That is fine and does NOT mean needs-help: if npm test fails ONLY in qa-owned test files whose fixtures reference the thing you intentionally changed (and every other suite is green), open the PR as DRAFT anyway (gh pr create --draft), set fixtureFailures=true, list the failing tests in evidence, and return 'pr-opened'. The QA stage runs next on your branch and repairs the fixtures — do not edit test files yourself and do not wait for help.`
    : '';
  let r = await withLock('owner:' + t.owner, () =>
    agent(
      `You are implementing GitHub issue #${n} in ${REPO}: "${t.title}".
Acceptance criteria:
${t.acceptance}
${serialNote}${fixtureNote}

You are already in an isolated git worktree. Steps:
1. git fetch origin, then create the branch FROM origin/main: git checkout -b ticket/${n}-<short-slug> origin/main
2. Read the issue for full context: gh issue view ${n} --repo ${REPO} --json title,body
3. Implement following the rules below. Stay strictly inside your role's file ownership (CLAUDE.md table). Keep the diff minimal — do not reformat untouched lines.
4. Run all four verification commands; capture real output AND the commit SHA (git rev-parse HEAD) after committing.
5. Commit with a conventional message referencing the issue, push with: git push -u origin HEAD
6. Open the PR: gh pr create --repo ${REPO} --title "<type>: <title> (#${n})" --body "Closes #${n}\n\n<what changed, why>\n\n<verification evidence incl. SHA>"
7. Verify CI actually started: gh pr checks <number> --repo ${REPO}. If after ~2 minutes it still reports no checks at all, trigger it once with an empty commit (git commit --allow-empty -m "ci: trigger" && git push) and re-check. Mention the outcome in evidence.
8. Return status 'pr-opened' with branch, prNumber (from gh pr view --json number), prUrl, evidence.

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
  );
  r = r
    ? { ...r, triage: t }
    : { status: 'blocked', blockReason: 'implement agent returned nothing', triage: t };

  // ---- Assist: on needs-help, helper role agent contributes its own files
  if (r.status === 'needs-help') {
    const h = await withLock('owner:' + r.helpRole, () =>
      agent(
        `You are the ${r.helpRole} on the Ordböj team. The ${r.triage.owner} implementing issue #${n} ("${r.triage.title}") on branch ${r.branch} needs your help:
${r.helpRequest}

You are in an isolated git worktree.
${BRANCH_CHECKOUT_PROCEDURE(r.branch, `assist-${n}-work`)}
Steps:
1. Check out the branch with the procedure above (never plain 'git checkout ${r.branch}').
2. Make ONLY the requested change, strictly inside files your role owns (CLAUDE.md table).
3. Run all four verification commands (lint, typecheck, test, build); all must pass. Capture output + commit SHA.
4. Commit and push to the same branch (git push origin HEAD:${r.branch}).
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
    );
    r = h
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
        };
  }

  // ---- QA: qa agent repairs fixtures if needed and adds fail-first-proven tests
  if (r.status === 'pr-opened') {
    if (!r.triage.needsTests && !r.fixtureFailures) {
      r = { ...r, qa: { status: 'not-needed' } };
    } else {
      const fixtureRepairNote = r.fixtureFailures
        ? `\nFIXTURE REPAIR FIRST: the branch currently has failing tests — existing qa-owned fixtures reference something the change intentionally removed/renamed. Update those fixtures to the new intended shape (never weaken a real behavioral assertion — only adjust fixture data/shape), make the suite green, and if the PR is a draft mark it ready (gh pr ready ${r.prNumber}).`
        : '';
      const qa = await agent(
        `You are the qa engineer. PR #${r.prNumber} in ${REPO} (branch ${r.branch}) implements issue #${n}: "${r.triage.title}".
Acceptance criteria:
${r.triage.acceptance}
${fixtureRepairNote}

You are in an isolated git worktree.
${BRANCH_CHECKOUT_PROCEDURE(r.branch, `qa-${n}-work`)}
Steps:
1. Check out the branch with the procedure above (never plain 'git checkout ${r.branch}').
2. Read the PR diff (gh pr diff ${r.prNumber} --repo ${REPO}) and write deterministic Vitest tests that pin the new behavior to the acceptance criteria. Regression tests for any bug the ticket fixes.
3. You may ONLY edit qa-owned files: *.test.ts, *.test.tsx, src/test/**, vitest.config.ts. Never change production code — if the change is untestable without a production edit, report blocked with the defect instead.
4. FAIL-FIRST PROOF (mandatory for every NEW test): temporarily revert the production files the PR changed to their merge-base versions (git checkout $(git merge-base HEAD origin/main) -- <files>), run your new tests, and confirm they FAIL for the predicted reason. Then restore the branch versions byte-for-byte (git checkout HEAD -- <files>, verify git diff is clean of production changes) and confirm green. A new test that passes against pre-fix code is vacuous: rewrite it or drop it. Include both outputs (fail + green) in evidence.
5. Run npm test and npm run typecheck; both must pass. Capture real output + commit SHA as evidence.
6. Commit ("test: ...") and push to the same branch (git push origin HEAD:${r.branch}).
Return status 'tests-added' with evidence, or 'blocked' with blockReason. If the PR already has adequate tests somehow, return 'not-needed'.`,
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

  // ---- Review: adversarial review of the PR diff
  if (r.status === 'pr-opened') {
    const rev = await agent(
      `Adversarially review PR #${r.prNumber} in ${REPO} (fix for issue #${n}: "${r.triage.title}").
Get the diff: gh pr diff ${r.prNumber} --repo ${REPO}
Get the issue: gh issue view ${n} --repo ${REPO} --json title,body
Get PR state: gh pr view ${r.prNumber} --repo ${REPO} --json mergeable,headRefOid

Check, trying to REFUTE the claim that this PR is correct and complete:
- Does the diff actually satisfy every acceptance criterion? ${r.triage.acceptance}
- Correctness bugs, edge cases, broken tests, weakened tests.
- If the ticket changes testable behavior: does the branch actually contain meaningful tests pinning it (needsTests=${r.triage.needsTests})? Does QA evidence include fail-first proof (new tests shown failing against pre-fix code)? A test never proven to fail is a finding.
- DIFF HYGIENE (blocker-grade): formatting-only rewrites of lines unrelated to the fix (Prettier sweeps, quote-style conversion, JSX re-wrapping). This churn causes merge conflicts with parallel work — reject it.
- MERGEABILITY (blocker-grade): if gh pr view reports mergeable=CONFLICTING, that is an automatic approved=false.
- EVIDENCE FRESHNESS: does the PR body's verification evidence match the current head SHA? Stale evidence (captured on an earlier commit) is a finding; CI on the head is the real gate, but a body that misdescribes the merged code is not acceptable.
- File-ownership violations (CLAUDE.md table) or edits to src/components/ui/**.
- Any localStorage shape change without version+migration.
- Any Swedish string change that could be wrong (conjugation, spelling).
Return approved=true only if nothing material is wrong. List every finding either way.`,
      // review pinned to opus: strongest affordable tier (session model too expensive)
      { label: `review:#${n}`, phase: 'Review', schema: REVIEW_SCHEMA, model: 'opus' },
    );
    r = { ...r, review: rev };
  }

  // ---- Ship: CI watch, conflict handling, merge + board update, or park
  if (r.status !== 'pr-opened') {
    return parkNoPr(
      n,
      r,
      'blocked before merge (' + r.status + '): ' + (r.blockReason || 'unknown'),
    );
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
   If it reports NO checks at all on the branch: trigger CI once with an empty commit (checkout the branch via a fresh 'git worktree add' + 'git checkout -b tmp origin/<branch>', git commit --allow-empty -m "ci: trigger", git push origin HEAD:<branch>), then poll again. If checks still never appear, do NOT merge on faith: comment, add needs-human to the PR and issue, return parked.
2. CI red: read the failing job log (gh run view --log-failed). You do not edit code, even for trivial failures. Comment the failing lines on the PR, add needs-human to the PR and the issue, return parked.
3. CI green: confirm the concluded checks ran on the CURRENT head (gh pr view ${r.prNumber} --repo ${REPO} --json headRefOid, compare with the commit the checks report). Checks from an older head do not count — poll until the head's own checks conclude.
   Then, risky=${risky}:
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
  `ticket-pilot done: ${summary.filter((s) => s.status === 'merged').length} merged, ${summary.filter((s) => s.status === 'parked').length} parked, ${summary.filter((s) => s.status === 'failed').length} failed`,
);
return summary;
