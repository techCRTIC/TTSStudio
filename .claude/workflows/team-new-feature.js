export const meta = {
  name: 'team-new-feature',
  description: 'Deterministic studio pipeline for a new feature: plan mode (producer -> technical-director -> domain lead) and build mode (specialists -> adversarial QA)',
  whenToUse: 'Invoked by the /team-new-feature skill. args.mode = "plan" returns an approvable plan; args.mode = "build" executes an approved plan.',
  phases: [
    { title: 'Frame', detail: 'producer frames the feature' },
    { title: 'Sign-off', detail: 'technical-director architectural verdict' },
    { title: 'Design', detail: 'domain lead breaks work into specialist tasks' },
    { title: 'Implement', detail: 'specialists build in parallel' },
    { title: 'Verify', detail: 'qa-tester per criterion + adversarial check on failures' },
  ],
}

// ---------- schemas ----------

const PLAN_SCHEMA = {
  type: 'object',
  required: ['framing', 'acceptance_criteria', 'primary_domain', 'risks'],
  properties: {
    framing: { type: 'string', description: 'One-paragraph framing of the feature' },
    acceptance_criteria: { type: 'array', items: { type: 'string' }, minItems: 1 },
    primary_domain: { type: 'string', enum: ['frontend', 'backend', 'mobile', 'design', 'devops'] },
    risks: { type: 'array', items: { type: 'string' } },
  },
}

const SIGNOFF_SCHEMA = {
  type: 'object',
  required: ['architecturally_significant', 'rationale', 'adr_skeleton'],
  properties: {
    architecturally_significant: { type: 'boolean' },
    rationale: { type: 'string', description: 'One-line rationale for the verdict' },
    adr_skeleton: { type: 'string', description: 'Markdown ADR skeleton if significant, else empty string' },
  },
}

const DESIGN_SCHEMA = {
  type: 'object',
  required: ['approach', 'tasks'],
  properties: {
    approach: { type: 'string' },
    tasks: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['specialist', 'scope', 'mutates_files'],
        properties: {
          specialist: {
            type: 'string',
            enum: ['react-specialist', 'web-implementer', 'node-specialist', 'python-specialist', 'db-specialist', 'mobile-implementer'],
          },
          scope: { type: 'string', description: 'Self-contained task description for the specialist' },
          mutates_files: { type: 'boolean' },
        },
      },
    },
  },
}

const IMPL_SCHEMA = {
  type: 'object',
  required: ['files_modified', 'summary', 'blocked', 'blocker'],
  properties: {
    files_modified: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    blocked: { type: 'boolean' },
    blocker: { type: 'string', description: 'Empty string if not blocked' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['met', 'evidence'],
  properties: {
    met: { type: 'boolean' },
    evidence: { type: 'string', description: 'Concrete evidence: file paths, line refs, observed behavior' },
  },
}

const REFUTE_SCHEMA = {
  type: 'object',
  required: ['failure_is_real', 'reason'],
  properties: {
    failure_is_real: { type: 'boolean' },
    reason: { type: 'string' },
  },
}

// ---------- mode dispatch ----------

// Tolerate args arriving as a JSON-encoded string (depends on the caller).
let input = args
if (typeof input === 'string') {
  try { input = JSON.parse(input) } catch (e) { input = null }
}

if (!input || !input.feature || !['plan', 'build'].includes(input.mode)) {
  throw new Error('team-new-feature workflow requires args: {mode: "plan"|"build", feature: string, ...}')
}

const feature = input.feature
const context = input.context || '(no extra project context provided)'

if (input.mode === 'plan') {
  // ---- PLAN: sequential, each output feeds the next ----
  phase('Frame')
  const framing = await agent(
    `You are framing a new feature for the Personal AI Dev Studio.\n\nFeature request: ${feature}\n\nProject context:\n${context}\n\nFrame the feature, list concrete testable acceptance criteria, identify the primary domain, and flag risks.`,
    { agentType: 'producer', label: 'producer:frame', schema: PLAN_SCHEMA },
  )
  if (!framing) throw new Error('producer framing failed')
  log(`producer: domain=${framing.primary_domain}, ${framing.acceptance_criteria.length} acceptance criteria`)

  phase('Sign-off')
  const signoff = await agent(
    `Architectural sign-off for a new feature.\n\nFeature: ${feature}\n\nProducer framing:\n${JSON.stringify(framing, null, 2)}\n\nDecide: is this architecturally significant? If yes, draft an ADR skeleton (markdown). If no, sign off with a one-line rationale and return an empty adr_skeleton.`,
    { agentType: 'technical-director', label: 'tech-director:signoff', schema: SIGNOFF_SCHEMA },
  )
  if (!signoff) throw new Error('technical-director sign-off failed')
  log(`technical-director: ${signoff.architecturally_significant ? 'ADR required' : 'signed off'} — ${signoff.rationale}`)

  phase('Design')
  const design = await agent(
    `You are the ${framing.primary_domain} lead. Design the implementation approach for this feature within your domain and break it into specialist tasks. Each task scope must be self-contained (the specialist will see ONLY the scope text plus the feature description).\n\nFeature: ${feature}\n\nProducer framing:\n${JSON.stringify(framing, null, 2)}\n\nTechnical-director verdict:\n${JSON.stringify(signoff, null, 2)}\n\nProject context:\n${context}`,
    { agentType: `${framing.primary_domain}-lead`, label: `${framing.primary_domain}-lead:design`, schema: DESIGN_SCHEMA },
  )
  if (!design) throw new Error('domain lead design failed')
  log(`${framing.primary_domain}-lead: ${design.tasks.length} task(s) for ${design.tasks.map(t => t.specialist).join(', ')}`)

  return { feature, framing, signoff, design }
}

// ---- BUILD: approved plan in, implemented + verified feature out ----
const plan = input.plan
if (!plan || !plan.design || !plan.framing) {
  throw new Error('build mode requires args.plan = the approved object returned by plan mode')
}

phase('Implement')
// Read-only tasks (reviews, audits) must run AFTER mutating tasks finish —
// otherwise they race against the files they are meant to inspect.
const writers = plan.design.tasks.filter(t => t.mutates_files)
const readers = plan.design.tasks.filter(t => !t.mutates_files)
const useWorktree = writers.length > 1 // isolate only when parallel writers could collide

// plan.design_guidance: distilled brief from the mandatory design skill suite
// (impeccable, ui-ux-pro-max, emil-design-eng, design-taste-frontend) — attached
// by the SKILL before build mode whenever the feature has UI surface.
const designGuidance = plan.design_guidance
  ? `\n\nDesign guidance (MANDATORY — from the studio's design skill suite, follow it):\n${plan.design_guidance}`
  : ''

const implTask = (task, i) =>
  agent(
    `Implement this scoped task as part of the feature "${plan.feature}".\n\nYour scope:\n${task.scope}\n\nLead's overall approach (for context — stay inside your scope):\n${plan.design.approach}${designGuidance}\n\nThe plan was already approved by the user: write the files directly, no need to ask permission. Report every file you create or modify.`,
    {
      agentType: task.specialist,
      label: `impl:${task.specialist}#${i + 1}`,
      phase: 'Implement',
      schema: IMPL_SCHEMA,
      ...(useWorktree && task.mutates_files ? { isolation: 'worktree' } : {}),
    },
  )

const writeResults = await parallel(writers.map((task, i) => () => implTask(task, i)))
const readResults = readers.length
  ? await parallel(readers.map((task, i) => () => implTask(task, writers.length + i)))
  : []
const implementations = [...writeResults, ...readResults]

const done = implementations.filter(Boolean)
const blocked = done.filter(r => r.blocked)
const filesModified = done.flatMap(r => r.files_modified)
if (blocked.length) log(`WARNING: ${blocked.length} task(s) blocked: ${blocked.map(b => b.blocker).join(' | ')}`)
if (useWorktree) log('NOTE: parallel specialists ran in isolated worktrees — consolidate at git checkpoint')
log(`Implementation done: ${filesModified.length} file(s) touched`)

phase('Verify')
// Each criterion verified independently; failures get an adversarial second opinion.
const verdicts = await pipeline(
  plan.framing.acceptance_criteria,
  criterion => agent(
    `Verify this acceptance criterion for the feature "${plan.feature}".\n\nCriterion: ${criterion}\n\nFiles reportedly modified:\n${filesModified.join('\n') || '(none reported)'}\n\nRead the actual files and check concretely. Report met=true/false with evidence.`,
    { agentType: 'qa-tester', phase: 'Verify', schema: VERDICT_SCHEMA },
  ),
  async (verdict, criterion) => {
    if (!verdict) return { criterion, met: false, evidence: 'qa-tester failed to run', confirmed_failure: true }
    if (verdict.met) return { criterion, ...verdict, confirmed_failure: false }
    const second = await agent(
      `A QA check claims this acceptance criterion FAILED. Try to refute that claim — is it actually a false positive?\n\nFeature: ${plan.feature}\nCriterion: ${criterion}\nQA evidence for the failure:\n${verdict.evidence}\n\nRead the relevant files yourself. failure_is_real=true only if the criterion is genuinely unmet.`,
      { agentType: 'qa-tester', phase: 'Verify', label: 'verify:adversarial', schema: REFUTE_SCHEMA },
    )
    return {
      criterion,
      ...verdict,
      confirmed_failure: second ? second.failure_is_real : true,
      adversarial_note: second ? second.reason : 'adversarial check failed to run',
    }
  },
)

const results = verdicts.filter(Boolean)
const confirmedFailures = results.filter(v => v.confirmed_failure)
const falsePositives = results.filter(v => !v.met && !v.confirmed_failure)

let verdict = 'PASS'
if (confirmedFailures.length || blocked.length) verdict = 'FAIL'
else if (falsePositives.length) verdict = 'CONCERNS'

log(`QA verdict: ${verdict} (${results.length} criteria, ${confirmedFailures.length} confirmed failure(s))`)

return {
  feature: plan.feature,
  files_modified: filesModified,
  implementations: done.map(r => r.summary),
  blocked: blocked.map(b => b.blocker),
  used_worktrees: useWorktree,
  qa: { verdict, criteria: results },
}
