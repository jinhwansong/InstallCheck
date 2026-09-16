# Verification - initial workspace

## Workflow update — 2026-09-16

- `npm test`: 22 tests passed, including DXF transforms and unsupported geometry, photo references, evidence invalidation, and existing geometry/import behavior.
- `npm run build`: passed; the existing Three.js bundle size warning remains.
- `node tests/browser-smoke.cjs`: passed against the production preview in headless Edge. Covers photo registration, confirmations and invalidation, snapshot differences, report photos, rejected malformed DXF preserving the project, DXF registration, separate 3D candidates, reload, JSON round trip, PDF generation and mobile overflow. No uncaught page errors or external requests observed.
- The preview server had stopped during the interrupted session; it was restarted before the successful final browser run.
- Desktop/mobile screenshots were inspected during implementation. Report DOM was checked and a PDF generated; no claim of independent PDF text/layout verification for this update.
- Manual review covered file limits, worker cancellation/stale reads, HTML escaping, retained image/history references and atomic registration. Unsupported geometry in a block excludes that whole block rather than understating its bounds.
- No independent peer review or real customer-file validation was performed. The sequential-work instruction was followed. Synthetic fixtures do not establish accuracy for arbitrary factory CAD or photographs.

Date: 2026-09-09. Scope: the new local-first TypeScript workspace in this previously empty repository. No existing source, tests, commits, or user changes were present.

## Automated checks

- `npm test`: 10 Node tests passed. Covers snapshot isolation/staleness, compound yaw transforms, SAT false positives and contact, vertical separation/tolerance, collision and room boundaries, missing measurements, supported clear scene, undersized door, strict import limits and duplicate IDs, tampered imported findings, unsupported rule versions, invalid dates and dimensions.
- Tests were initially run before the model existed and failed on the missing module. This was a missing-module observation, not a claim that every individual test had an observed assertion-level red phase.
- `npm run build`: strict TypeScript check and production Vite build passed.
- Dependency installation audit: no vulnerabilities reported at installation time.
- No separate lint tool is configured. Vite reports a >500 kB chunk warning due to the bundled Three.js renderer (about 140 kB gzip); no artificial threshold override was used.

## Actual browser verification

Headless Microsoft Edge via Playwright, production preview at 127.0.0.1:4173, desktop 1512×982 and mobile 390×844:

- WebGL canvas renders the sample compound equipment and site.
- Mouse-dragging equipment changes the numeric placement; undo restores it.
- Save inspection, edit a part, and observe stale inspection state.
- Reload restores changed values and saved inspection history.
- Clearing ceiling height produces an unknown finding.
- Print action generates a multi-page report with saved basis, component/obstacle dimensions, findings and limitations; PDF first page visually inspected.
- JSON export/download and import restore the project.
- Add part and undo work.
- Mobile has no horizontal document overflow; desktop and mobile screenshots inspected.
- A second tab's write locks auto-save in the first tab; subsequent edits do not overwrite the other tab's stored version.
- No uncaught page errors in the main workflow.

The browser harness and captured output are local task evidence, not production application dependencies. Browser tests are separate from `npm test`.

## Review

Intent: provide the component-based initial product discussed with the user, including traceable checks and local data handling; do not represent it as a secure shared SaaS or certified installation engine.

Code review: skipped (ce-code-review unavailable) - the loaded skill's scope stage requires a resolved base and explicitly stops without one. This was an unborn, empty repository with no HEAD, remote default or review base. No independent-review receipt is claimed.

Manual fallback scan covered all authored source files and the plan. Findings addressed: preserve expanded component/obstacle editors after updates, stop recalculating trusted historical snapshots on every local form change, remove unused scene state, increase small result-text contrast/size, and prevent cross-tab overwrite. Import still performs full schema validation and recomputes results; safety checks were preserved. The simplify skill's reuse/quality/efficiency rubrics were applied inline under the active sequential-work instruction.

Actionable Findings: none remaining within the stated prototype scope after these fixes.

Coverage: model, geometry, UI event wiring, persistence/recovery, JSON trust boundary, report escaping, resource disposal, responsive and print rendering. No independent peer review, real-factory comparison, penetration test, secure multi-user service, or complete deployment security verification.

Verdict: ready for local demo with synthetic/approved non-sensitive data. Not approved for installation guarantees or confidential enterprise production use.

## Runtime / future deployment validation

For any future static hosting, the deployer should verify HTTPS, asset loading without external runtime calls, WebGL, local save/reload, JSON recovery, and report output in the target browser. A saved inspection becoming current after changing geometry, cross-tab overwrite, blank WebGL with no fallback, or a failed backup is a stop/rollback signal. Revert to the previous static bundle and preserve exported JSON; do not reset stored data. No public deployment was performed in this implementation.
