# InstallCheck initial workspace

The user accepted the component-based direction in the preceding product discussion and requested implementation in this empty repository. Native inline execution; no external workers, no existing changes.

Build a Korean local-first single-user installation workspace. A project holds room dimensions, door dimensions, measured date and tolerance, obstacles, equipment assemblies made from individually dimensioned boxes, directional service spaces, and immutable inspection snapshots. Geometry uses millimetres, vertical Y, horizontal X/Z, yaw-only rotation. Inspection rules must distinguish missing inputs from passes and show stale inspections after edits.

Architecture: TypeScript + Three.js + Vite static app. Data stays in this browser, JSON backup/import with strict validation; no accounts or shared service. This is a runnable initial product, not the complete secure enterprise deployment described in the business plan. No external runtime CDN, analytics, AI or CAD API. Static build can be served locally or from customer infrastructure. Multi-user authorization and server storage remain separate production work.

Implementation order:
1. `src/model.ts`, `src/inspection.ts`, `tests/core.test.ts`: test rotated compound geometry, contact/tolerance, room bounds, clearance, unknown ceiling/door, revision invalidation and untrusted import before implementation. Use Node's built-in test runner.
2. `src/scene.ts`: local Three scene, orbit, plan view, select/focus, drag whole assembly with grid snapping; numeric controls remain available.
3. `src/main.ts`, `src/styles.css`: project, equipment and site editing, component CRUD, result focus, snapshot history, persistence and recovery, JSON transfer and print-to-PDF report. Responsive Korean engineering workspace, readable status labels and keyboard controls.
4. Build and run tests. Browser-verify actual workflows and responsive layout. Review security/trust boundaries and geometry; document limitations and run commands in README.

Acceptance: Change conveyor length and inspect a collision; move/rotate equipment and rerun; save inspection then change geometry and show stale state; reload without data loss; import rejects malformed inputs without replacing work; print shows saved inspection inputs, version and limitations. Missing ceiling cannot become all-clear. No claimed real-world installation guarantee.
