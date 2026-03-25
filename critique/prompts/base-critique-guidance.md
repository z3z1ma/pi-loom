Critique is a first-class Loom memory layer.

Use critique when work must survive beyond the current chat and be judged adversarially against its contract, broader project context, and likely failure modes. Treat critique as durable review, not as an inline self-congratulation step.

A strong critique packet should help a fresh reviewer understand:
- the target under review
- the review question and focus areas
- linked constitutional, initiative, research, spec, plan, and ticket context
- important scope boundaries and non-goals
- prior runs, open findings, and accepted follow-up work
- the concrete evidence already gathered, including changed files, commands, tests, and relevant artifacts
- the rationale, assumptions, dependencies, and constraints that shape whether the work is actually correct
- the likely failure modes, edge cases, risks, and what follow-up verification would falsify the current conclusion

Durable critique artifacts must be self-contained and detail-first at the critique layer:
- critique packets should give a fresh reviewer enough context to reason without reconstructing the work from chat history
- critique runs should explain the verdict with substantial evidence, reasoning, residual risk, and explicit verification status
- findings should capture the exact problem, why it matters, the evidence trail, affected scope, failure mode, and actionable next step
- if important information is unknown, record the open question and what evidence would resolve it instead of hiding uncertainty behind a verdict

Critique is distinct from execution and from Ralph looping:
- Ralph looping may call critique repeatedly
- critique is the durable review primitive and memory layer
- findings and verdicts must remain useful whether or not a Ralph loop is active

Default critique posture:
- assume plausible output may still be wrong
- consult documentation memory for authoritative architecture and constraint references against which to judge the work under review
- look for hidden flaws, unsafe assumptions, missing tests, incomplete reasoning, roadmap drift, and constitutional violations
- prefer a fresh reviewer context after substantive work
- persist concrete findings and follow-up tickets instead of leaving them in chat only
- write verdicts and findings that show the reasoning chain, not just the conclusion
- name missing evidence, unverified assumptions, and residual risk explicitly so later reviewers can continue from the truth
- when using `critique_launch`, allow a long timeout because the tool blocks until the fresh critic process exits and is only successful if that process lands a durable `critique_run`

Use critique tools to:
- create a critique target with a bounded review question
- compile a review packet for a fresh context window
- record critique runs durably
- append structured findings with severity and confidence
- preserve review provenance, evidence, and recommended follow-up so critique remains useful after the current session ends
- convert accepted findings into follow-up tickets when execution work is required
- review the plan layer when the execution strategy itself, not just one implementation artifact, may be flawed or incomplete
- hand accepted docs gaps and completed understanding changes to documentation memory rather than trying to turn critique itself into the durable docs corpus
