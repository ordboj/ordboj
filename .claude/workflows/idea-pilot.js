export const meta = {
  name: 'idea-pilot',
  description:
    'Idea intake pipeline: intake → blind value review by the three business owners + ui-ux-expert → adversarial debate (design-critic) with one bounded rebuttal round → Fable product verdict → staff-engineer feasibility + parallel-safe ticket breakdown → epic + sub-tickets on the GitHub board → handoff where the LEAD asks the human whether to run ticket-pilot on the new tickets',
  whenToUse:
    'Turn raw feature ideas / intentions ("should we add X?", "what if Y worked like Z?") into a settled verdict and, when worth it, a ticketed epic on the Ordböj board. args: { ideas: ["free-form note", ...] } — any language, one note per idea, or one string that mixes several ideas (intake splits them). Value comes FIRST: the three business owners (srs-engine, swedish-linguist, learning-designer) plus the ui-ux-expert judge whether the idea adds learner and experience value before anyone discusses requirements. design-critic attacks weak reasoning; owners get one rebuttal round when contested. Fable gives the verdict per idea: pursue, reject, or needs-human with one precise question. Pursued ideas get a staff-engineer feasibility pass that splits work into tickets with disjoint owners/files so ticket-pilot can run them in parallel; dependent tickets get explicit dependsOn ordering. The workflow creates the epic and sub-issues on the board (Todo) and STOPS there — it never implements. The lead then asks the human whether to launch ticket-pilot with the returned runPlan batches. Roughly 8–12 agents per idea; pass many ideas knowingly.',
  phases: [
    {
      title: 'Intake',
      detail:
        'split raw notes into distinct idea candidates, dedupe against existing open issues on the board',
    },
    {
      title: 'Value',
      detail:
        'three business owners + ui-ux-expert judge learner and experience value blind and in parallel — value first, no solution detail yet',
    },
    {
      title: 'Debate',
      detail:
        'design-critic attacks the three assessments; when contested, challenged owners get one bounded rebuttal round',
      model: 'opus',
    },
    {
      title: 'Verdict',
      detail:
        'Fable, acting as product owner, rules pursue / reject / needs-human with a refined scope statement',
      model: 'fable',
    },
    {
      title: 'Feasibility',
      detail:
        'staff-engineer checks architecture fit and splits the scope into tickets with disjoint owners/files, dependsOn edges and parallel groups',
      model: 'opus',
    },
    {
      title: 'Ticketize',
      detail:
        'one board scribe per idea, serialized: epic issue + sub-issues created, linked, added to project 1 in Todo',
    },
  ],
};

const REPO = 'ordboj/ordboj';
const PROJECT = { number: 1, owner: 'ordboj' };

// ---------------------------------------------------------------- args

let parsedArgs = args;
if (typeof parsedArgs === 'string') {
  try {
    parsedArgs = JSON.parse(parsedArgs);
  } catch {
    parsedArgs = { ideas: [parsedArgs] };
  }
}
const rawNotes = Array.isArray(parsedArgs) ? parsedArgs : (parsedArgs && parsedArgs.ideas) || [];
if (!rawNotes.length || rawNotes.some((n) => typeof n !== 'string' || !n.trim()))
  throw new Error(
    'args.ideas required: array of non-empty free-form idea notes, e.g. { ideas: ["daily streak freeze?", "verb audio on the card"] }',
  );

// Board writes are serialized so two ideas never race gh project item-add.
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

const STYLE = `
GitHub text style (mandatory for every issue title and body you write):
- Title: imperative, one line.
- Write in ASD-STE100 style: active voice, simple tenses, one fact per sentence, at most 20 words per sentence.
- No filler, no praise, no marketing language.
`;

// ---------------------------------------------------------------- schemas

const INTAKE_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'short working title, imperative' },
          summary: {
            type: 'string',
            description: 'the idea restated in 2-4 plain English sentences',
          },
          original: {
            type: 'string',
            description: 'the exact wording from the human note that this idea came from',
          },
          existingIssue: {
            type: 'number',
            description:
              'number of an OPEN issue already covering this idea (0 if none) — that idea is reported as already-tracked, not re-processed',
          },
        },
        required: ['title', 'summary', 'original', 'existingIssue'],
      },
    },
  },
  required: ['ideas'],
};

const VALUE_SCHEMA = {
  type: 'object',
  properties: {
    worth: {
      type: 'string',
      enum: ['high', 'medium', 'low', 'none'],
      description: "learner value from THIS role's domain; none = do not build",
    },
    rationale: { type: 'string', description: '2-4 sentences: why this worth level' },
    concerns: {
      type: 'array',
      items: { type: 'string' },
      description:
        'risks or costs this role sees (pedagogy, data correctness, scheduling, usability)',
    },
    requirements: {
      type: 'array',
      items: { type: 'string' },
      description:
        'ONLY when worth is high or medium: what this domain needs from the feature to deliver that value — outcomes, not implementation',
    },
    openQuestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'facts this role would need from the human before committing',
    },
  },
  required: ['worth', 'rationale', 'concerns'],
};

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    contested: {
      type: 'boolean',
      description:
        'true when the critique materially disagrees with the owners: inflated worth, missed cost, scope creep, or a concern the owners waved away',
    },
    challenges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            enum: ['srs-engine', 'swedish-linguist', 'learning-designer', 'ui-ux-expert'],
          },
          point: { type: 'string', description: "one concrete attack on that role's reasoning" },
        },
        required: ['role', 'point'],
      },
    },
    recommendation: {
      type: 'string',
      enum: ['pursue', 'narrow', 'reject'],
      description: 'narrow = worth building but only a smaller slice of the stated idea',
    },
    narrowedScope: {
      type: 'string',
      description: 'only with recommendation narrow: the smaller slice worth building',
    },
  },
  required: ['contested', 'challenges', 'recommendation'],
};

const REBUTTAL_SCHEMA = {
  type: 'object',
  properties: {
    position: {
      type: 'string',
      enum: ['concede', 'revise', 'hold'],
      description: 'concede = critic is right; revise = adjust worth; hold = defend original',
    },
    worth: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
    response: { type: 'string', description: '1-3 sentences answering the challenge' },
  },
  required: ['position', 'worth', 'response'],
};

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['pursue', 'reject', 'needs-human'] },
    rationale: { type: 'string', description: '2-4 sentences: why this call' },
    question: {
      type: 'string',
      description:
        'only with decision needs-human: the single precise question the human must answer',
    },
    scope: {
      type: 'string',
      description:
        'only with decision pursue: the settled scope statement — what ships, what is explicitly cut',
    },
    valueStatement: {
      type: 'string',
      description: 'only with decision pursue: one sentence on the learner value that justifies it',
    },
  },
  required: ['decision', 'rationale'],
};

const FEASIBILITY_SCHEMA = {
  type: 'object',
  properties: {
    feasible: { type: 'boolean' },
    blockReason: { type: 'string', description: 'only when feasible=false: why not' },
    architectureNotes: {
      type: 'string',
      description: 'how the feature fits the current app shell, storage and data flow',
    },
    storageMigration: {
      type: 'boolean',
      description:
        'true when any ticket changes a localStorage shape — those tickets need a version bump + forward migration and human approval before merge',
    },
    risks: { type: 'array', items: { type: 'string' } },
    tickets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'imperative, one line' },
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
          },
          acceptance: { type: 'string', description: 'concrete acceptance criteria' },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'repo-relative production files this ticket will touch',
          },
          dependsOn: {
            type: 'array',
            items: { type: 'number' },
            description:
              'zero-based indices of tickets in THIS array that must merge first; empty = no dependency',
          },
          parallelGroup: {
            type: 'number',
            description:
              'batch number starting at 1; tickets in one batch have disjoint owners AND disjoint files and can run in parallel; batch N+1 runs after batch N',
          },
          risky: {
            type: 'boolean',
            description: 'true for localStorage schema, verb-data content, or cross-owner changes',
          },
        },
        required: ['title', 'owner', 'acceptance', 'files', 'dependsOn', 'parallelGroup', 'risky'],
      },
    },
  },
  required: ['feasible', 'architectureNotes', 'storageMigration', 'risks', 'tickets'],
};

const TICKETIZE_SCHEMA = {
  type: 'object',
  properties: {
    epicNumber: { type: 'number' },
    epicUrl: { type: 'string' },
    tickets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'number' },
          url: { type: 'string' },
          title: { type: 'string' },
          owner: { type: 'string' },
          parallelGroup: { type: 'number' },
        },
        required: ['number', 'url', 'title', 'owner', 'parallelGroup'],
      },
    },
  },
  required: ['epicNumber', 'epicUrl', 'tickets'],
};

// ---------------------------------------------------------------- intake
// One agent splits the raw notes into distinct idea candidates and dedupes
// against the live board, so the pipeline never re-litigates a tracked idea.

const intake = await agent(
  `You receive raw product idea notes for Ordböj (Swedish verb conjugation trainer). The notes can be in any language and one note can contain several distinct ideas.

Notes:
${rawNotes.map((n, i) => `--- note ${i + 1} ---\n${n}`).join('\n')}

Steps:
1. Read CLAUDE.md in the repo root and skim src/pages and src/lib to understand what the app does today.
2. Split the notes into distinct idea candidates. One idea = one independently shippable intention. Do not merge unrelated ideas; do not split one idea into fragments.
3. For each idea write an imperative working title and a 2-4 sentence plain-English summary. Keep the human's exact original wording in 'original' (verbatim, original language).
4. Dedupe against the board. Run: gh issue list --repo ${REPO} --state open --limit 100 --json number,title,labels
   When an open issue already covers the idea, set existingIssue to its number. Otherwise 0.
Return only the structured result.`,
  { label: 'intake', phase: 'Intake', schema: INTAKE_SCHEMA, effort: 'low', model: 'sonnet' },
);
if (!intake || !intake.ideas || !intake.ideas.length)
  throw new Error('intake produced no idea candidates');

const tracked = intake.ideas.filter((i) => i.existingIssue);
const fresh = intake.ideas.filter((i) => !i.existingIssue);
tracked.forEach((i) => log(`already tracked: "${i.title}" → open issue #${i.existingIssue}`));
log(`intake: ${fresh.length} fresh idea(s), ${tracked.length} already tracked`);

// ---------------------------------------------------------------- per-idea pipeline

const ASSESSORS = ['srs-engine', 'swedish-linguist', 'learning-designer', 'ui-ux-expert'];

function ideaBlock(idea) {
  return `Idea: "${idea.title}"
Summary: ${idea.summary}
Human's original wording (verbatim): ${idea.original}`;
}

// Stage 1 — blind value review. The three business owners plus the ui-ux
// expert never see each other's assessment; independent positions make the
// debate honest.
function runValue(idea) {
  return parallel(
    ASSESSORS.map(
      (role) => () =>
        agent(
          `You are the ${role} on the Ordböj team, one of the four value assessors (the three business owners plus the UI/UX expert). A feature idea arrived. Judge its VALUE from your domain before anyone discusses implementation.

${ideaBlock(idea)}

Ground rules:
- Value first. The only question that matters now: does this make the app teach Swedish verbs better, for real learners, from YOUR domain's point of view? Implementation cost is a concern to list, not the verdict.
- Read the app before judging: CLAUDE.md, then the parts of the app your role covers — business owners read the source files they own; the UI/UX expert reads the practice-flow pages and components and judges the experience impact (flow, mobile ergonomics, cognitive load). Base the judgement on how the app works today.
- Be willing to say 'none'. A confidently useless feature wastes the team; do not inflate worth to be agreeable.
- List requirements ONLY when worth is high or medium, and state them as outcomes ("the learner must ..."), never as implementation ("add a field to ...").
- openQuestions: only facts you genuinely cannot decide yourself.
Return only the structured result.`,
          {
            label: `value:${role}`,
            phase: 'Value',
            schema: VALUE_SCHEMA,
            agentType: role,
            model: 'sonnet',
          },
        ).then((v) => ({ role, v })),
    ),
  ).then((xs) => xs.filter((x) => x && x.v));
}

// Stage 2 — adversarial debate. design-critic attacks; when contested, each
// challenged owner gets exactly one rebuttal. Bounded by construction: one
// critique, at most one rebuttal per owner, no second round.
async function runDebate(idea, assessments) {
  const critique = await agent(
    `You are the adversarial design critic for Ordböj. Four assessors (the three business owners and the UI/UX expert) assessed a feature idea. Attack their reasoning before the product verdict.

${ideaBlock(idea)}

Assessments:
${assessments
  .map(
    (a) =>
      `--- ${a.role} ---\nworth: ${a.v.worth}\nrationale: ${a.v.rationale}\nconcerns: ${JSON.stringify(a.v.concerns)}\nrequirements: ${JSON.stringify(a.v.requirements || [])}\nopenQuestions: ${JSON.stringify(a.v.openQuestions || [])}`,
  )
  .join('\n')}

Your job:
- Hunt inflated worth, hand-waved costs, scope creep, and pedagogy claims without evidence. Check claims against the codebase where possible.
- Also attack in the other direction: an owner who dismissed real learner value too cheaply gets challenged too.
- Each challenge names one role and one concrete point. No vague "consider whether...".
- recommendation 'narrow' when a smaller slice carries most of the value at a fraction of the cost — then state that slice in narrowedScope.
- Set contested=true only when a challenge would change the verdict if it stands. Style nits are not contests.
Return only the structured result.`,
    { label: 'critique', phase: 'Debate', schema: CRITIQUE_SCHEMA, model: 'opus' },
  );
  if (!critique) return { assessments, critique: null, rebuttals: [] };

  let rebuttals = [];
  if (critique.contested && critique.challenges.length) {
    const challenged = [...new Set(critique.challenges.map((c) => c.role))];
    rebuttals = (
      await parallel(
        challenged.map((role) => () => {
          const own = assessments.find((a) => a.role === role);
          const points = critique.challenges
            .filter((c) => c.role === role)
            .map((c) => '- ' + c.point)
            .join('\n');
          return agent(
            `You are the ${role} on the Ordböj team. The design critic challenged your value assessment of a feature idea. This is your ONE rebuttal; after it the product owner rules.

${ideaBlock(idea)}

Your assessment was: worth=${own ? own.v.worth : 'unknown'} — ${own ? own.v.rationale : ''}

The critic's challenges to you:
${points}

Answer honestly. 'concede' when the critic is right. 'revise' with a new worth when the challenge shifts your judgement partly. 'hold' only with a concrete counter-argument, checked against the codebase where possible. Defending a wrong position wastes the team.
Return only the structured result.`,
            {
              label: `rebuttal:${role}`,
              phase: 'Debate',
              schema: REBUTTAL_SCHEMA,
              agentType: role,
              model: 'sonnet',
            },
          ).then((r) => (r ? { role, r } : null));
        }),
      )
    ).filter(Boolean);
  }
  return { assessments, critique, rebuttals };
}

// Stage 3 — verdict. Fable acts as the product owner the human delegated to:
// pursue with a settled scope, reject with a reason, or needs-human with one
// precise question. Never a vague "maybe".
function runVerdict(idea, debate) {
  return agent(
    `You are the product owner's delegate for Ordböj. Rule on this feature idea. The whole debate is below; you speak last.

${ideaBlock(idea)}

Blind value assessments:
${debate.assessments
  .map(
    (a) =>
      `- ${a.role}: worth=${a.v.worth} — ${a.v.rationale} | concerns: ${JSON.stringify(a.v.concerns)} | requirements: ${JSON.stringify(a.v.requirements || [])} | openQuestions: ${JSON.stringify(a.v.openQuestions || [])}`,
  )
  .join('\n')}

Critic:
${debate.critique ? `recommendation=${debate.critique.recommendation}${debate.critique.narrowedScope ? ' | narrowed scope: ' + debate.critique.narrowedScope : ''} | challenges: ${JSON.stringify(debate.critique.challenges)}` : '(critic returned nothing)'}

Rebuttals:
${debate.rebuttals.length ? debate.rebuttals.map((x) => `- ${x.role}: ${x.r.position}, worth now ${x.r.worth} — ${x.r.response}`).join('\n') : '(none — not contested)'}

Rules for your ruling:
- Value decides. Pursue only when the surviving arguments show real learner value. Weight rebuttal-revised worth over the original numbers, and the critic's 'narrow' slice over the full idea when it carries the value.
- Reject is a fine outcome. State plainly why the idea does not earn its cost. Rejection with a clear reason is more useful to the human than a reluctant pursue.
- needs-human ONLY when the ruling truly hinges on a fact or preference only the human has — then ask exactly one precise question. Unresolved taste disagreements between agents are yours to settle, not the human's.
- On pursue: write 'scope' as the settled statement — what ships, what is explicitly cut (including cuts the critic won) — and requirements the owners set that survived the debate. An engineer must know what "done" means from it. Write 'valueStatement' as the one sentence that justifies building it.
Return only the structured result.`,
    { label: 'verdict', phase: 'Verdict', schema: VERDICT_SCHEMA, model: 'fable' },
  );
}

// Stage 4 — feasibility + breakdown. staff-engineer splits the scope so
// ticket-pilot can parallelize: disjoint owners AND files inside a batch,
// dependsOn edges across batches.
function runFeasibility(idea, verdict) {
  return agent(
    `You are the staff engineer for Ordböj. The product verdict approved a feature. Check feasibility and split the work into tickets.

${ideaBlock(idea)}

Settled scope (build exactly this, nothing more):
${verdict.scope}

Value statement: ${verdict.valueStatement || '(none)'}

Steps:
1. Read CLAUDE.md (especially the file-ownership table and the localStorage rules), then the source files the scope touches. Base every call on the code as it is today.
2. Judge feasibility. feasible=false only when the scope cannot be built without breaking a hard rule (irreplaceable user progress, Swedish correctness) — then state blockReason and return without tickets.
3. Split the scope into tickets. Rules:
   - One ticket = one owner. Every file in a ticket belongs to that owner per the CLAUDE.md table. A change that genuinely spans owners becomes multiple tickets with dependsOn edges, not one cross-owner ticket.
   - Slice for parallelism first: prefer vertical slices with disjoint files. Use dependsOn only for real build-order constraints (schema before UI that reads it), never for convenience.
   - parallelGroup: batch 1 = every ticket with no dependencies; batch N+1 = tickets whose dependencies all sit in batches ≤ N. Tickets inside one batch must have disjoint owners AND disjoint files.
   - Any ticket that changes a localStorage shape needs the version bump + forward migration stated IN its acceptance criteria, and risky=true. Same for verb-data content changes.
   - Acceptance criteria are testable statements. A qa engineer must be able to write a failing test from them.
   - When the scope needs a pedagogy or product ruling that the verdict did not settle, make that a 'decision' ticket (owner learning-designer or product-manager) in batch 1 and let implementation tickets depend on it.
4. storageMigration=true when any ticket touches a localStorage shape.
Return only the structured result. Do not edit any file; this stage is read-only.`,
    {
      label: 'feasibility',
      phase: 'Feasibility',
      schema: FEASIBILITY_SCHEMA,
      agentType: 'staff-engineer',
      model: 'opus',
    },
  );
}

// Stage 5 — ticketize. One board scribe per idea, serialized under a global
// lock. The scribe acts for the lead (CLAUDE.md board recipes); this workflow
// run is the lead's dispatch.
function runTicketize(idea, verdict, feas) {
  const ticketList = feas.tickets
    .map(
      (t, i) =>
        `${i}. [batch ${t.parallelGroup}] (${t.owner}${t.risky ? ', RISKY' : ''}) ${t.title}
   acceptance: ${t.acceptance}
   files: ${t.files.join(', ') || '(docs only)'}
   dependsOn: ${t.dependsOn.length ? t.dependsOn.map((d) => 'ticket ' + d).join(', ') : 'none'}`,
    )
    .join('\n');
  return withLock('board', () =>
    agent(
      `You are the board scribe for Ordböj, acting on the lead's dispatch. Create an epic and its sub-tickets on GitHub for an approved feature. Use the Bash tool with gh.

Epic: "${idea.title}"
Value statement: ${verdict.valueStatement || verdict.rationale}
Settled scope:
${verdict.scope}
Architecture notes: ${feas.architectureNotes}
Risks: ${JSON.stringify(feas.risks)}
Storage migration involved: ${feas.storageMigration}

Tickets to create (exact content, do not add or drop any):
${ticketList}

Steps:
1. Make sure the epic label exists (never errors):
   gh label create epic --repo ${REPO} --color 3E4B9E --description "umbrella issue with sub-tickets" --force
2. Create the epic issue first: gh issue create --repo ${REPO} --title "Epic: ${idea.title}" --label epic --body "..."
   Epic body: the value statement, the settled scope, the risks, then a task list with one line per sub-ticket title (fill the numbers in step 4). When storage migration is involved, state: "localStorage schema changes need a migration and the human's approval before merge."
3. Create each sub-ticket in the listed order: gh issue create --repo ${REPO} --title "..." --body "..."
   Sub-ticket body, exactly these sections: "Part of #<epic>", Owner: <role>, Acceptance criteria (verbatim from the list), Files: <list>, Depends on: #<numbers of the created dependency tickets, resolved from the dependsOn indices> or "none", Batch: <parallelGroup>. Add "RISKY" plus the reason line when the ticket is marked RISKY.
4. Edit the epic body so the task list references the real numbers: "- [ ] #<n> <title>" per sub-ticket. Use gh issue edit <epic-number> --repo ${REPO} --body "...".
5. Add the epic and every sub-ticket to the project: gh project item-add ${PROJECT.number} --owner ${PROJECT.owner} --url <issue-url>
   New project items land in Todo by default; do not move statuses.
6. Return epicNumber, epicUrl and the created tickets with number, url, title, owner, parallelGroup.
${STYLE}`,
      {
        label: `ticketize:${idea.title.slice(0, 30)}`,
        phase: 'Ticketize',
        schema: TICKETIZE_SCHEMA,
        model: 'sonnet',
      },
    ),
  );
}

// ---------------------------------------------------------------- run
// Ideas flow through the pipeline independently — idea A can be in
// Feasibility while idea B still debates. Only board writes serialize.

const results = await pipeline(
  fresh,
  async (idea) => {
    const assessments = await runValue(idea);
    if (assessments.length < ASSESSORS.length)
      log(
        `"${idea.title}": only ${assessments.length}/${ASSESSORS.length} value assessments returned`,
      );
    if (!assessments.length)
      return { idea, status: 'failed', detail: 'no value assessment returned' };
    const debate = await runDebate(idea, assessments);
    const verdict = await runVerdict(idea, debate);
    if (!verdict) return { idea, status: 'failed', detail: 'verdict agent returned nothing' };
    return { idea, debate, verdict };
  },
  async (r) => {
    if (!r || r.status === 'failed') return r;
    const { idea, verdict } = r;
    if (verdict.decision === 'reject')
      return { idea, status: 'rejected', rationale: verdict.rationale };
    if (verdict.decision === 'needs-human')
      return {
        idea,
        status: 'needs-human',
        rationale: verdict.rationale,
        question: verdict.question || '(verdict gave no question)',
      };
    const feas = await runFeasibility(idea, verdict);
    if (!feas)
      return { idea, verdict, status: 'failed', detail: 'feasibility agent returned nothing' };
    if (!feas.feasible)
      return {
        idea,
        verdict,
        status: 'infeasible',
        rationale: feas.blockReason || 'staff-engineer found the scope infeasible',
      };
    if (!feas.tickets.length)
      return { idea, verdict, status: 'failed', detail: 'feasibility returned no tickets' };
    return { idea, verdict, feas };
  },
  async (r) => {
    if (!r || r.status) return r;
    const { idea, verdict, feas } = r;
    const board = await runTicketize(idea, verdict, feas);
    if (!board)
      return { idea, verdict, status: 'failed', detail: 'ticketize agent returned nothing' };
    // Batches for ticket-pilot: one array per parallelGroup, ascending.
    const byGroup = new Map();
    board.tickets.forEach((t) => {
      if (!byGroup.has(t.parallelGroup)) byGroup.set(t.parallelGroup, []);
      byGroup.get(t.parallelGroup).push(t.number);
    });
    const runPlan = [...byGroup.entries()].sort((a, b) => a[0] - b[0]).map(([, nums]) => nums);
    log(
      `"${idea.title}": epic #${board.epicNumber}, ${board.tickets.length} tickets, run plan ${runPlan.map((b) => '[' + b.join(', ') + ']').join(' then ')}`,
    );
    return {
      idea,
      status: 'ticketed',
      valueStatement: verdict.valueStatement,
      epicNumber: board.epicNumber,
      epicUrl: board.epicUrl,
      tickets: board.tickets,
      storageMigration: feas.storageMigration,
      risks: feas.risks,
      runPlan,
    };
  },
);

const summary = {
  alreadyTracked: tracked.map((i) => ({ title: i.title, issue: i.existingIssue })),
  ideas: results.filter(Boolean).map((r) => ({
    title: r.idea.title,
    status: r.status,
    ...(r.rationale ? { rationale: r.rationale } : {}),
    ...(r.question ? { questionForHuman: r.question } : {}),
    ...(r.detail ? { detail: r.detail } : {}),
    ...(r.epicNumber
      ? {
          epic: r.epicNumber,
          epicUrl: r.epicUrl,
          tickets: r.tickets,
          runPlan: r.runPlan,
          storageMigration: r.storageMigration,
          risks: r.risks,
          valueStatement: r.valueStatement,
        }
      : {}),
  })),
};
log(
  `idea-pilot done: ${summary.ideas.filter((i) => i.status === 'ticketed').length} ticketed, ${summary.ideas.filter((i) => i.status === 'rejected').length} rejected, ${summary.ideas.filter((i) => i.status === 'needs-human').length} needs-human, ${summary.alreadyTracked.length} already tracked`,
);
// LEAD, after this workflow returns:
// 1. Report every verdict to the human: rejected ideas with their rationale,
//    needs-human ideas with their exact question, ticketed ideas with epic +
//    ticket list + run plan.
// 2. For each ticketed idea, ask the human via AskUserQuestion whether to
//    launch ticket-pilot now. On yes, run ticket-pilot per runPlan: one
//    invocation per batch, in order — args { tickets: [...batch] } — and wait
//    for the batch's merges before starting the next batch. Do NOT launch
//    ticket-pilot without the human's explicit yes.
// 3. Storage-migration epics: remind the human that those merges also need
//    their explicit schema approval (CLAUDE.md rule).
return summary;
