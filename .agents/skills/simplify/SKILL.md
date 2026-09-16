---
name: simplify
description: Simplify the task diff without changing behavior. Reduce code, abstractions, call depth, parameters, stored state, and redundant checks.
---

# Simplify

## Scope

Simplify only the task diff by default, not unrelated working-tree changes. Inspect surrounding code and callers to verify assumptions, but report broader redesigns rather than applying them. Follow repository conventions rather than importing personal style preferences. No change is a valid outcome.

Preserve outputs, errors, side effects, ordering, public APIs, and compatibility. Report behavior changes or uncertain removals instead of applying them. Trust boundaries, lifecycle cleanup, validation, and operational safeguards need evidence of redundancy before removal.

## Simplify

- Minimize LoC by deleting unnecessary code, not compressing syntax or sacrificing readability. Each edit should remove a concrete burden, not merely produce a different style.
- Prefer deletion or direct use before adding a helper or abstraction. Reuse existing implementations when their contracts match; do not force superficially similar code into a shared abstraction.
- Minimize abstraction layers. Remove trivial helpers, forwarding wrappers, indirection, and boilerplate that add no meaningful boundary. Preserve feature and integration ownership; call count alone does not justify removing a helper.
- Minimize call depth. Prefer direct logic over chains of shallow functions, without flattening meaningful boundaries into a monolith. Reduce unnecessary nesting when it makes control flow easier to follow.
- Minimize parameters. Remove unused or derivable inputs and unnecessary options. Do not hide dependencies in globals or bundle unrelated arguments into an object merely to reduce the count.
- Prefer simple, concrete code over generic frameworks, speculative flexibility, and configuration for nonexistent use cases.
- Minimize stored state. Derive values instead of maintaining synchronized copies, unless caching or snapshot semantics require otherwise.
- Check whether each defensive branch is reachable and whether earlier validation already handles it. Remove checks only when all relevant paths enforce the necessary invariant; trace callers, input boundaries, and persisted data. Static types alone do not validate external data. Uncommon is not impossible; retain checks when evidence is insufficient.
- Prefer validated inputs and representations that make invalid states impossible over repeated downstream checks. Do not tighten accepted inputs, alter failure behavior, or discard compatibility cases under the guise of simplification; propose those behavior changes separately.

## Verify

Use existing checks and tooling for mechanical issues; do not introduce new tooling for a cleanup pass. Establish a baseline with relevant checks when feasible so pre-existing failures are distinguishable from regressions.

After editing, run the repository's required checks and relevant tests. Re-read the final diff for behavior changes, lost safeguards, and scope creep. Fix regressions introduced by simplification and repeat verification. Summarize changes and report failed or skipped checks and remaining uncertainty.
