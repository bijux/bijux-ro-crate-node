# Changelog

Repository changes are recorded by pull request, newest merge first.

### [#274](https://github.com/bijux/bijux-ro-crate-node/pull/274) — Local recovery downloads

- Download a selected browser recovery copy without replacing the current document, and verify recovery during a simulated BSS outage.

### [#273](https://github.com/bijux/bijux-ro-crate-node/pull/273) — Local create-submission design

- Add a development-only create form preview without enabling BSS creation.

### [#272](https://github.com/bijux/bijux-ro-crate-node/pull/272) — Local submission-list design

- Add a development-only searchable submission-list preview with labelled sample data.

### [#271](https://github.com/bijux/bijux-ro-crate-node/pull/271) — Local sign-in design preview

- Add a development-only sign-in design preview and share the institutional header with the authoring app.

### [#270](https://github.com/bijux/bijux-ro-crate-node/pull/270) — BIA authoring shell

- Align the local authoring header with BioImage Archive navigation and correct breadcrumb styling.

### [#269](https://github.com/bijux/bijux-ro-crate-node/pull/269) — Local documentation website

- Build and serve tracked repository guides as a local, linked documentation site.

### [#268](https://github.com/bijux/bijux-ro-crate-node/pull/268) — Local authoring commands

- Add independent Make commands to build, run, check, test and stop the authoring app.

### [#267](https://github.com/bijux/bijux-ro-crate-node/pull/267) — BSS startup configuration

- Validate BSS settings when the authoring server starts without exposing configuration values.

### [#266](https://github.com/bijux/bijux-ro-crate-node/pull/266) — Local BSS read transport

- Add a bounded server-only submission read with synthetic local contract checks.

### [#265](https://github.com/bijux/bijux-ro-crate-node/pull/265) — Local environment files

- Ignore local environment files while retaining checked-in examples.

### [#264](https://github.com/bijux/bijux-ro-crate-node/pull/264) — Creator release boundary

- Distinguish creator candidate qualification from the current two-package publication configuration.
- Use saved response IDs when local-account browser journeys select drafts.

### [#263](https://github.com/bijux/bijux-ro-crate-node/pull/263) — Authoring handoff guidance

- Clarify validation and manifest limits for local metadata exports.

### [#262](https://github.com/bijux/bijux-ro-crate-node/pull/262) — Authoring breadcrumb

- Expose the current editor section as accessible breadcrumb navigation.

### [#261](https://github.com/bijux/bijux-ro-crate-node/pull/261) — BSS configuration status

- Distinguish invalid BSS connectivity settings from an unreachable service without exposing their values.

### [#260](https://github.com/bijux/bijux-ro-crate-node/pull/260) — Local draft preservation

- Document complete reference and browser recovery preservation before retiring local services.

### [#259](https://github.com/bijux/bijux-ro-crate-node/pull/259) — Astro session storage

- Disable the unused Astro filesystem session driver; the local reference keeps its separate session store.
- Wait for historical revision selection after the draft-list limit in the local reference journey.

### [#258](https://github.com/bijux/bijux-ro-crate-node/pull/258) — BSS interface observations

- Document the observed BSS interface and the evidence needed before enabling remote operations.
- Wait for the submitted revision to load in the local reference browser journey.

### [#257](https://github.com/bijux/bijux-ro-crate-node/pull/257) — Workspace build metadata

- Name package-owned declaration, typecheck and standalone entry configuration `roCrateBuild`.
- Wait for the saved draft in the account conflict journey before selecting it.

### [#256](https://github.com/bijux/bijux-ro-crate-node/pull/256) — Export manifest guidance

- Identify metadata exports that do not include a file list before transfer.
- Label ZIP downloads using the actual materialized file set.

### [#255](https://github.com/bijux/bijux-ro-crate-node/pull/255) — Local authoring deployment

- Run the standalone authoring image in a disposable kind cluster with readiness and liveness checks.

### [#254](https://github.com/bijux/bijux-ro-crate-node/pull/254) — Local reference isolation

- Disable local reference routes when the application runs with `NODE_ENV=production`.

### [#253](https://github.com/bijux/bijux-ro-crate-node/pull/253) — Authoring application container

- Build a non-root runtime image for the standalone study authoring application.
- Exclude local environment files and development artifacts from the image build context.

### [#252](https://github.com/bijux/bijux-ro-crate-node/pull/252) — BSS connectivity configuration

- Configure a server-side BSS health probe while preserving standalone mode.
- Report connectivity without exposing upstream responses or following redirects.

### [#251](https://github.com/bijux/bijux-ro-crate-node/pull/251) — Independent product verification

- Run product build and type checks through Make without loading the shared standards framework.
- Preserve existing standards targets and propagate failures from the product checks.

### [#250](https://github.com/bijux/bijux-ro-crate-node/pull/250) — Local submission outcomes

- List owned local operations and open their exact saved history versions without replacing current work.
- Open submitted revisions beyond the first history page, including drafts outside the recent list.
- Reconcile uncertain outcomes explicitly and retain prior local receipts when the receiver is unavailable.
- Clear displayed outcomes and refresh account identity when a submission or receiver check detects a changed session owner.
- Split installed-package qualification into required snapshot and reference lanes to keep the existing five-minute cap.


### [#249](https://github.com/bijux/bijux-ro-crate-node/pull/249) — Local reference submission

- Send an owned, qualified saved revision to a durable loopback receiver fixture, with idempotent retries and explicit uncertain outcomes.
- Keep local receipts distinct from archive acceptance and retain exact frozen metadata bytes across retries.
- Clear prior-account submission details when the session changes and preserve known receipts on same-account failures.
- Bind each local operation to its original receiver so retries cannot create a second submission elsewhere.
- Show receiver observation freshness when qualification fails and a prior local operation exists.


### [#248](https://github.com/bijux/bijux-ro-crate-node/pull/248) — Local reference qualification

- Qualify frozen saved metadata with bounded, isolated default validation.
- Reject inconsistent worker reports and constrain the worker V8 heap and stack.
- Validate an owned saved version from history against its exact frozen metadata, and keep local results separate from an undecided submission policy.
- Clear saved-version validation results when the current study changes or a restore starts; remove history details when account ownership is lost during validation.
- Keep history frozen-file paging coverage aligned with saved-version detail responses.


### [#247](https://github.com/bijux/bijux-ro-crate-node/pull/247) — Local account history

- Inspect saved revisions and bounded changes, download their original recovery and frozen files, and restore an editable revision as a new immutable head, including unfinished vocabulary input.
- Page large revision histories and file listings while retaining access to older revisions and exact frozen files.
- Keep in-flight revision inspection independent of paging, and clear history when the account changes.
- Preserve server timestamp precision in history responses.
- Keep restore retries bound to the original source and head, and preserve current edits on conflicts.

### [#246](https://github.com/bijux/bijux-ro-crate-node/pull/246) — Local draft conflicts

- Compare a retained save with current work and the confirmed server revision, download complete backups, and explicitly recover or save a copy.
- Keep retained input across conflicts and reject stale comparisons when work, account, or server head changes.
- Preserve recovered work ownership so saving it under another account requires consent.


### [#245](https://github.com/bijux/bijux-ro-crate-node/pull/245) — Local accounts

- Store owner-scoped immutable revisions and conditional saves in the local reference service.
- Provide a loopback-only Keycloak and PostgreSQL reference with two-account
  OIDC qualification for local development.
- Add loopback-only PostgreSQL-backed sessions and conditional local saves using
  the creator recovery envelope and server-derived frozen metadata.
- Sign in, save and reopen local drafts in the editor; retain current work on
  conflicts and session expiry, and retry uncertain saves with the same key.
- Preserve unfinished vocabulary input in local account saves and block frozen output until it is resolved.
- Preserve rejected save attempts for explicit backup or discard, including
  when an older attempt conflicts with a newer server revision.
- Admit account CI job names through the existing dependency-proposal policy.

### [#244](https://github.com/bijux/bijux-ro-crate-node/pull/244) — Vocabulary evidence

- Compare supplied exact vocabulary evidence without changing default validation.
- Assign organism and imaging assertions through creator commands while preserving imports and backups.
- Search and check selected terms through the editor using bounded OLS requests.
- Preserve unfinished vocabulary input in recovery and block validation and export until resolved.
- Reject invalid pending fields and changes that would make unfinished input unrecoverable.
- Check refreshed recovery lists by selected copy identity after a restored copy autosaves.

### [#243](https://github.com/bijux/bijux-ro-crate-node/pull/243) — Local recovery

- Keep separate browser recovery copies with explicit restore, editable backups, and preserving metadata import.
- Retain unfinished file listings without retaining image payloads or validation approval.
- Export reopened editable metadata with its original bytes.
- Keep recovered drafts with pending listings blocked from metadata qualification.
- List recovery-copy metadata without reloading every backup body.

### [#242](https://github.com/bijux/bijux-ro-crate-node/pull/242) — Validation review

- Group current validation findings by severity and make the complete report downloadable.
- Distinguish validator results, payload selection coverage and submission readiness.

### [#241](https://github.com/bijux/bijux-ro-crate-node/pull/241) — Editor validation

- Bind validation to the current draft and selected payload files using the packaged worker.
- Refuse continuation when validation is incomplete or stale; report selected payload coverage separately.

### [#240](https://github.com/bijux/bijux-ro-crate-node/pull/240) — File listings

- List and assign file metadata in bounded pages, and download the JSON-LD and TSV together.
- Inspect exported ZIPs with an independent standard-library reader available in CI.

### [#239](https://github.com/bijux/bijux-ro-crate-node/pull/239) — Scientific associations

- Keep specimen display labels in drafts and backups without adding metadata fields.
- Edit biosamples, specimens, protocols and dataset associations in the local editor.
- Clarify specimen-label exports and support direct dependent-record navigation.
- Distinguish scientific relationship choices when record names or labels match.

### [#238](https://github.com/bijux/bijux-ro-crate-node/pull/238) — Study contributors and funding

- Edit study contributors, shared affiliations, publications and funding references.
- Manage those relationships and author order in the local study editor, with
  section navigation that keeps one current draft.
- Distinguish shared affiliation and funder choices even when names match.

### [#237](https://github.com/bijux/bijux-ro-crate-node/pull/237) — Study authoring workspace

- Verify the authoring browser runtime against its pinned image and Node matrix.

- Add a private local study editor with metadata export, built-browser checks
  and locally served Visual Framework styles.
- Document the private app's temporary vendor declaration-checking exception.

### [#236](https://github.com/bijux/bijux-ro-crate-node/pull/236) — Creator editing history

- Apply atomic batches and retain bounded undo and redo history.

### [#235](https://github.com/bijux/bijux-ro-crate-node/pull/235) — Creator draft backups

- Encode and validate versioned draft and read-only recovery backups.
- Select coverage artifacts by producer attempt when qualification jobs are rerun.

### [#234](https://github.com/bijux/bijux-ro-crate-node/pull/234) — Creator metadata import

- Preserve admitted metadata and file-list content when editing supported imports.

### [#233](https://github.com/bijux/bijux-ro-crate-node/pull/233) — Creator file manifests

- Add file-list rows and CSVW schema metadata with guarded references.

### [#232](https://github.com/bijux/bijux-ro-crate-node/pull/232) — Creator relationships

- Create typed study entities and preserve their references in metadata exports.

### [#231](https://github.com/bijux/bijux-ro-crate-node/pull/231) — Study metadata creation

- Add an in-memory creator for an editable study and RO-Crate metadata export.

### [#230](https://github.com/bijux/bijux-ro-crate-node/pull/230) — Runtime bundle producer identity

- Bind runtime restores to the selected producer artifact and attempt while
  retaining archive digest, source and provenance verification.

### [#227](https://github.com/bijux/bijux-ro-crate-node/pull/227) — Documentation accuracy

- Correct browser session guidance, package compatibility links and contributor
  navigation for root tests, model diagnostics and RDF namespaces.

### [#229](https://github.com/bijux/bijux-ro-crate-node/pull/229) — Contributor verification guidance

- Describe the current verification lanes and generated-runtime ownership.
- Add focused recipes for validator, tooling and installed-consumer changes.

### [#228](https://github.com/bijux/bijux-ro-crate-node/pull/228) — Reference capture cancellation

- Avoid reporting an expected capture-owner shutdown as an unexpected owner loss.

### [#226](https://github.com/bijux/bijux-ro-crate-node/pull/226) — Installed interaction verification

- Keep source interaction verification while removing duplicate installed lane
  preverification; installed modes continue to verify their prepared consumers.
- Cover mutation between installed interaction checks in the root test matrix.

### [#225](https://github.com/bijux/bijux-ro-crate-node/pull/225) — JavaScript architecture boundaries

- Check JavaScript importers in package sources and shared test support, including
  files that have a similarly named TypeScript counterpart.

### [#224](https://github.com/bijux/bijux-ro-crate-node/pull/224) — TypeScript compiler ownership

- Execute root compiler projects from solution references and reject authored
  TypeScript outside the projects actually checked.
- Keep workspace, browser, worker, Node, and installed consumer checks separate.

### [#223](https://github.com/bijux/bijux-ro-crate-node/pull/223) — Source qualification input identity

- Bind source qualification receipts to a versioned inventory of source, core
  runtime and qualification inputs, and reject changes during qualification.
- Derive the runtime-generation test fixture from the registered entry inventory.
- Partition candidate package and root tests into bounded jobs while retaining
  required report production and archive admission.

### [#222](https://github.com/bijux/bijux-ro-crate-node/pull/222) — Browser command deadlines

- Allow Playwright commands to close their browsers on timeout before bounded
  forced termination, and retain timeout failures after graceful exits.

### [#221](https://github.com/bijux/bijux-ro-crate-node/pull/221) — Reference process ownership

- Bound POSIX reference capture cancellation to an owned process group and
  wait for cleanup before reporting completion.

### [#220](https://github.com/bijux/bijux-ro-crate-node/pull/220) — Browser session subscriber isolation

- Prevent subscriber exceptions from interrupting session operations or hiding
  eligibility changes from other observers.
- Roll back failed initial subscriptions and report later callback failures
  safely, including when the reporting host re-enters the session.

### [#219](https://github.com/bijux/bijux-ro-crate-node/pull/219) — Architecture boundary checks

- Check production and shared test-support imports against workspace ownership,
  declared public exports and resolved paths during workspace validation.
- Document the contributor path and prerequisites for a future creator package.

### [#218](https://github.com/bijux/bijux-ro-crate-node/pull/218) — Validator test ownership

- Group validator metadata and RDF tests with their corresponding domains,
  preserving the discovered test inventory and reference fixtures.

### [#217](https://github.com/bijux/bijux-ro-crate-node/pull/217) — Domain type ownership

- Place crate and validator types with the domains that own them while retaining
  the existing public type exports.
- Cover the distinction between metadata context and file-list parser options.

### [#216](https://github.com/bijux/bijux-ro-crate-node/pull/216) — Qualification boundaries

- Isolate source receipt checks from corpus loading and apply the snapshot
  partition proof to ordinary runs and verified qualification receipts.
- Separate installed validator Node and browser checks and load browser tools
  only for the scenarios that use them.
- Check that workflow Node matrices agree with the qualification version policy.
- Split installed browser guards and workspace integration checks into bounded
  CI lanes while retaining the complete local checks.
- Derive validator runtime fixture entries from the shared generation inventory.

### [#215](https://github.com/bijux/bijux-ro-crate-node/pull/215) — Installed TypeScript consumer fixtures

- Check package consumer fixtures against installed declarations before running
  their emitted Node and browser applications.
- Bind fixture inputs and emitted outputs to the prepared-consumer proof.

### [#214](https://github.com/bijux/bijux-ro-crate-node/pull/214) — Installed consumer harness

- Separate installation, receipt and execution helpers from package-specific
  scenarios, and avoid installation work when importing their planner.

### [#213](https://github.com/bijux/bijux-ro-crate-node/pull/213) — Declaration graph validation

- Give declaration graph validation its own build module and exercise missing,
  escaped and unexported references in both module resolution modes.

### [#212](https://github.com/bijux/bijux-ro-crate-node/pull/212) — Tooling test ownership

- Group tooling tests by their build, workspace, package and TypeScript
  responsibilities while preserving their execution and fixtures.

### [#211](https://github.com/bijux/bijux-ro-crate-node/pull/211) — Test harness ownership

- Place shared selection and coverage helpers with the test harness and keep
  browser-specific bindings in browser support.
- Give the shared TypeScript projects explicit runtime boundaries.

### [#210](https://github.com/bijux/bijux-ro-crate-node/pull/210) — Browser interaction lanes

- Run the source browser interaction guards in three required lanes per
  engine, retaining the installed-consumer lane and all existing checks.
- Limit each interaction job to five minutes in validation and candidate runs.

### [#209](https://github.com/bijux/bijux-ro-crate-node/pull/209) — Upstream reference lanes

- Run independent upstream capture families in four parallel jobs and perform
  the aggregate validator check after all four succeed.
- Keep every capture and verification command while limiting each family job
  to five minutes.

### [#208](https://github.com/bijux/bijux-ro-crate-node/pull/208) — Root test ownership

- Discover root tests and audit their execution owners, rejecting omitted or
  stale selections before qualification.
- Derive the CI root-test lanes from that same inventory without duplicating
  or dropping ordinary test files.

### [#207](https://github.com/bijux/bijux-ro-crate-node/pull/207) — Node 26 compatibility lanes

- Run source and installed-package compatibility checks in independent jobs,
  keeping both checks and limiting each job to five minutes.

### [#206](https://github.com/bijux/bijux-ro-crate-node/pull/206) — Reference qualification planning

- Separate reference qualification plans from execution so selection can be
  inspected without running the reference suite or reading runtime state.
- Include the JSON-LD source contracts in required reference qualification.

### [#205](https://github.com/bijux/bijux-ro-crate-node/pull/205) — Runtime entry ownership

- Derive checked-in runtime output review attributes from the same inventory
  used by the runtime generator, including installed-consumer helpers.
- Reject stale generated-file attributes while keeping admission-only generation
  independent of the repository-wide inventory check.
- Split package and root tests into parallel, independently admitted jobs with
  five-minute limits after Node 22 reached the previous eight-minute limit.
- Partition the complete upstream pytest collection across four required jobs
  after the unpartitioned run exceeded its command deadline.
- Document the shard ownership and measured hosted execution times.

### [#204](https://github.com/bijux/bijux-ro-crate-node/pull/204) — Accepted workflow standards

- Adopt node and common standards from bijux-std GitHub main commit
  `23a7def42bb063cb0dfb4367bbf8866bd125b559`, including the admission
  diagnostic from [GitLab !8](https://gitlab.com/bijux-oss/bijux-std/-/merge_requests/8).
- Preserve the separately pinned documentation authority.

### [#203](https://github.com/bijux/bijux-ro-crate-node/pull/203) — Node 26 compatibility qualification

- Qualify Node 26 source and installed packages in an independent CI lane and
  update the TypeScript loader while preserving the existing release receipts.
- Preserve the required dependency-proposal admission and job naming policy.

### [#202](https://github.com/bijux/bijux-ro-crate-node/pull/202) — Validation critical-path budget

- Record hosted Validation timing and a provisional elapsed-time budget that
  accounts for runner queues, preparation and required aggregation.

- Avoid a duplicate package-job build; `npm test` still runs the build via `pretest`.

### [#201](https://github.com/bijux/bijux-ro-crate-node/pull/201) — CI archive inspection boundary

- Expose the Python runtime archive inspector as an explicit CI tool and test
  hostile archive rejection before extraction.

### [#200](https://github.com/bijux/bijux-ro-crate-node/pull/200) — Package compiler registration

- Discover package-owned TypeScript projects and reject omitted compiler
  projects and authored sources, and require strict compiler settings.
- Reject unregistered runtime sources and orphaned generated launchers.

### [#199](https://github.com/bijux/bijux-ro-crate-node/pull/199) — Installed workspace consumers

- Require an installed behavioral scenario and dependency closure for each
  public workspace, with separately verified package integrity.
- Bind scenario receipts to installed module loads and isolated declaration
  resolution, and reject stale prepared consumer inputs.
- Capture worker-side load evidence and reject preloads before the guard.
- Preserve isolated consumer qualification across supported Node 22 releases.

### [#198](https://github.com/bijux/bijux-ro-crate-node/pull/198) — Workspace CI asset ownership

- Derive prepared distribution roots and workspace links from validated package
  inventory while retaining archive ownership and integrity checks.

### [#197](https://github.com/bijux/bijux-ro-crate-node/pull/197) — Package-owned workspace builds

- Build public workspaces from package-owned compiler projects and include their
  generated declaration dependencies in distribution archives.
- Declare standalone entry bundling per package and validate workspace build
  metadata before building.
- Reject package archives that omit emitted declaration files, and require
  ESM-compatible public workspace metadata and disable the compiler `noCheck` option.
- Require dependencies used by public declarations to be declared for consumers.
- Allow the package test job enough time to run the expanded workspace checks.

### [#196](https://github.com/bijux/bijux-ro-crate-node/pull/196) — Focused parity reproduction

- Select an exact parity case, preserve full qualification safeguards, and
  document the browser repair journey and detailed failure reports.

### [#195](https://github.com/bijux/bijux-ro-crate-node/pull/195) — Contributor guidance and generated-file review

- Document package ownership, checks and generated outputs, and correct the
  declaration workflow and current third-package build limitation.
- Mark checked-in generated runtime entries for GitHub review.

### [#194](https://github.com/bijux/bijux-ro-crate-node/pull/194) — Browser worker contracts

- Preserve the browser session constructor name in the built package.
- Validate detached worker responses and reject sparse or inherited findings while
  retaining cancellation and stale-response behavior.

### [#193](https://github.com/bijux/bijux-ro-crate-node/pull/193) — TypeScript editor project discovery

- Make source, tests, tooling and worker typechecks discoverable to the
  TypeScript language service while preserving their environment boundaries.

### [#192](https://github.com/bijux/bijux-ro-crate-node/pull/192) — Consolidated validator test typechecks

- Consolidate validator test TypeScript projects while retaining the Node-only
  manifest check and separate worker and source environments.

### [#191](https://github.com/bijux/bijux-ro-crate-node/pull/191) — URL authority capture types

- Type URL authority comparisons against their actual captured-report contract.

### [#190](https://github.com/bijux/bijux-ro-crate-node/pull/190) — URL authority fixture guard

- Report a missing contributor explicitly when validating URL authority fixtures.

### [#189](https://github.com/bijux/bijux-ro-crate-node/pull/189) — Typed browser declarations

- Generate browser API declarations from the checked TypeScript source while
  preserving the public session constructor and structural session type.
- Require TypeScript package entry points and check emitted browser declarations.

### [#188](https://github.com/bijux/bijux-ro-crate-node/pull/188) — Typed browser workflow controls

- Strictly type offline read observation, session races, repair journeys,
  workload measurements and browser parity while preserving generated entries.
- Check the read observer with worker-specific types and keep the generator
  fixture aligned with the browser workflows.

### [#187](https://github.com/bijux/bijux-ro-crate-node/pull/187) — Typed browser input and session controls

- Strictly type browser input identity, file value, continuation, picker, editor
  and report display controls while preserving worker and reference checks.

### [#186](https://github.com/bijux/bijux-ro-crate-node/pull/186) — Typed reference contracts and provenance

- Strictly type graph, temporal and collection contract tests, capture verification
  commands, and HTML tree proof and runner while preserving reference evidence.
- Keep generated entries, their fixture and strict compiler projects aligned.

### [#185](https://github.com/bijux/bijux-ro-crate-node/pull/185) — Typed browser reference controls

- Strictly type browser metadata, profile, manifest and upstream reference
  controls while retaining worker isolation and generated plain-Node entries.
- Keep the runtime-generator fixture aligned with the added browser entries.
- Verify a stale browser entry independently of other generator outputs.

### [#184](https://github.com/bijux/bijux-ro-crate-node/pull/184) — Typed installed-package qualification

- Strictly type installed-consumer and native-input controls while retaining
  plain-Node package isolation, browser checks and exact-byte handoff.
- Validate consumed receipt fields and keep generated entries in sync.

### [#183](https://github.com/bijux/bijux-ro-crate-node/pull/183) — Typed reference runners and coverage checks

- Strictly type reference runners, observer verification and browser coverage
  admission while preserving plain-Node entries and independent receipts.
- Keep generated entries and their isolated fixture consistent.

### [#182](https://github.com/bijux/bijux-ro-crate-node/pull/182) — Typed capture and JSON-LD reference controls

- Strictly type inferred-collection capture, reference verifiers and JSON-LD
  tests while preserving independent receipts and generated plain-Node entries.
- Keep the reference workflow and generator fixture aligned with the typed tests.

### [#181](https://github.com/bijux/bijux-ro-crate-node/pull/181) — Typed reference qualification controls

- Strictly type collection diagnostic and literal grammar reference checks and
  source-package qualification while preserving plain-Node entries and receipts.
- Retain generator consistency and qualification negative controls.
- Keep the pinned reference schedule aligned with the typed diagnostic test.

### [#180](https://github.com/bijux/bijux-ro-crate-node/pull/180) — Typed oracle capture and comparison tests

- Strictly type profile literal capture and parity comparator tests while retaining
  plain-Node execution, oracle provenance checks and negative controls.
- Keep the generated runtime entry and isolated generator fixture in sync.

### [#179](https://github.com/bijux/bijux-ro-crate-node/pull/179) — Typed metadata reference tests

- Strictly type the remaining metadata tests and their reference controls while
  retaining input receipts, diagnostic assertions and generated Node entries.
- Keep the isolated runtime-generator fixture aligned with those entries.

### [#178](https://github.com/bijux/bijux-ro-crate-node/pull/178) — Typed profile reference tests

- Strictly type the remaining profile tests, the manifest inference test and their
  reference checks, retaining the pinned captures and generated Node entries.
- Keep the isolated generator fixture aligned with the added runtime entries.

### [#177](https://github.com/bijux/bijux-ro-crate-node/pull/177) — Typed manifest reference tests

- Strictly type manifest validation tests and the reference checks they use,
  preserving receipt validation and generated plain Node entry points.
- Keep the isolated generator test fixture aligned with those runtime entries.

### [#176](https://github.com/bijux/bijux-ro-crate-node/pull/176) — Typed validator reference tests

- Strictly type profile, metadata and root identity reference tests while retaining
  existing input receipts, diagnostic assertions and negative controls.

### [#175](https://github.com/bijux/bijux-ro-crate-node/pull/175) — Typed case selection and runtime bundles

- Strictly type case selection controls and runtime bundle transport while
  preserving archive validation, execution behavior and generated entry points.

### [#174](https://github.com/bijux/bijux-ro-crate-node/pull/174) — Typed key equality reference checks

- Strictly type key equality reference checks and runner while retaining input
  ownership, capture receipts and plain Node entry points.

### [#173](https://github.com/bijux/bijux-ro-crate-node/pull/173) — Typed parity execution controls

- Strictly type the parity runner and snapshot partition controls while preserving
  source and installed execution, receipt provenance and coverage checks.
- Report early oracle pipe failures with the child exit diagnostics.

### [#172](https://github.com/bijux/bijux-ro-crate-node/pull/172) — Typed browser lifecycle harnesses

- Strictly type session completion and termination browser controls while
  preserving worker behavior, generated entry points and assertions.

### [#171](https://github.com/bijux/bijux-ro-crate-node/pull/171) — Typed browser reference session checks

- Strictly type the browser reference session harness while preserving its
  generated Node entry point and worker validation controls.

### [#170](https://github.com/bijux/bijux-ro-crate-node/pull/170) — Typed reference policy checks

- Strictly type model prefix and disabled context reference checks while
  retaining registered inputs, capture receipts and runtime entry points.

### [#169](https://github.com/bijux/bijux-ro-crate-node/pull/169) — Typed browser session harness

- Strictly type browser test host and session module bindings while preserving
  their plain Node entry points and worker behavior.

### [#168](https://github.com/bijux/bijux-ro-crate-node/pull/168) — Typed reference provenance checks

- Strictly type capture provenance, HTML and numeric reference verifiers while
  retaining their plain Node entry points and receipt checks.

### [#167](https://github.com/bijux/bijux-ro-crate-node/pull/167) — Typed metadata outcome tests

- Strictly type metadata, container and JSON reference outcome tests while
  preserving fixture receipts and diagnostic assertions.

### [#166](https://github.com/bijux/bijux-ro-crate-node/pull/166) — Typed reference runtime and capture checks

- Strictly type reference input ownership, public validator contracts and
  capture verification while preserving receipt and source checks.

### [#165](https://github.com/bijux/bijux-ro-crate-node/pull/165) — Typed submission example

- Strictly type the browser submission editor while preserving its JavaScript
  entry point, worker validation and editing behavior.

### [#164](https://github.com/bijux/bijux-ro-crate-node/pull/164) — Typed parity registry and qualification

- Strictly type parity case builders, registry and collection qualification
  while preserving generated runtime entries and capture records.

### [#163](https://github.com/bijux/bijux-ro-crate-node/pull/163) — Typed RDF and graph reference controls

- Strictly type RDF resolution tests and ontology, RDF, JSON-LD and collection
  corpus generators while preserving reference cases and runtime entries.

### [#162](https://github.com/bijux/bijux-ro-crate-node/pull/162) — Typed parity corpus generators

- Strictly type scalar, location and manifest corpus generators while
  preserving plain Node runtime entries and generated cases.

### [#161](https://github.com/bijux/bijux-ro-crate-node/pull/161) — Typed validator test contracts

- Strictly type profile proofs, metadata references and validation ownership
  tests while preserving fixture receipts and existing assertions.

### [#160](https://github.com/bijux/bijux-ro-crate-node/pull/160) — Typed reference parity controls

- Strictly type parity normalization and comparison, and manifest and profile
  reference tests, while preserving fixture receipts and runtime entries.

### [#159](https://github.com/bijux/bijux-ro-crate-node/pull/159) — Typed browser qualification controls

- Strictly type browser session tests, input fixtures and binding checks while
  preserving runtime entries, nullable receipts and existing assertions.

### [#158](https://github.com/bijux/bijux-ro-crate-node/pull/158) — Reference artifact job budgets

- Allow reference qualification jobs additional time for artifact action
  stalls while retaining their existing checks and receipts.

### [#157](https://github.com/bijux/bijux-ro-crate-node/pull/157) — Consistent package test discovery

- Run JavaScript and TypeScript package tests on every supported Node release,
  including Node 22.0, while retaining test selection and subprocess isolation.
- Verify the minimum supported Node release in the package test job.

### [#156](https://github.com/bijux/bijux-ro-crate-node/pull/156) — Artifact-dependent job budgets

- Allow live parity and browser qualification jobs additional time for
  artifact action stalls while retaining their existing checks and receipts.

### [#155](https://github.com/bijux/bijux-ro-crate-node/pull/155) — Typed case selection and coverage

- Strictly type case selection and coverage receipts while preserving shard
  identity, engine selection and existing runtime entry paths.
- Verify generic case metadata and generated runtime entries.

### [#154](https://github.com/bijux/bijux-ro-crate-node/pull/154) — Typed browser completion tests

- Strictly type browser completion and retry controls while preserving thrown
  input, stale result and reentrant worker assertions.

### [#153](https://github.com/bijux/bijux-ro-crate-node/pull/153) — Typed oracle partition tests

- Strictly type oracle partition and capture provenance tests while preserving
  malformed input, asynchronous ordering and failure assertions.

### [#152](https://github.com/bijux/bijux-ro-crate-node/pull/152) — Typed browser worker failure tests

- Strictly type worker failure, stale callback and reentrant session controls
  while preserving their existing cases and assertions.

### [#151](https://github.com/bijux/bijux-ro-crate-node/pull/151) — Typed oracle partition controls

- Strictly type oracle partition scheduling and parity input byte checks while
  preserving capture order, provenance and existing runtime entry paths.
- Check generated entries and merged capture return types.

### [#150](https://github.com/bijux/bijux-ro-crate-node/pull/150) — Typed metadata reference tests

- Strictly type RDF reference and metadata validation controls while preserving
  their captured cases, diagnostics and entity comparisons.

### [#149](https://github.com/bijux/bijux-ro-crate-node/pull/149) — Typed reference execution tests

- Strictly type reference scheduling and subprocess tests while preserving
  concurrency, timeout, stream and failure assertions.

### [#148](https://github.com/bijux/bijux-ro-crate-node/pull/148) — Typed manifest validation tests

- Strictly type file-list validation controls while preserving reference,
  duplicate detection and diagnostic assertions.
- Accept explicitly undefined model types in the validator's input type, as
  already supported by its lookup behavior.

### [#147](https://github.com/bijux/bijux-ro-crate-node/pull/147) — Typed reference registry tests

- Strictly type reference scheduling, key capture and manifest qualification
  tests while preserving command ordering and existing assertions.

### [#146](https://github.com/bijux/bijux-ro-crate-node/pull/146) — Typed offline context tests

- Strictly type imported context keyword and offline resource loader controls
  while preserving reference captures and cache isolation assertions.

### [#145](https://github.com/bijux/bijux-ro-crate-node/pull/145) — Typed reference check registry

- Strictly type reference check groups and scheduling while retaining command
  ordering, capture inputs and execution receipts.
- Include the reference check entry in runtime reproducibility checks.

### [#144](https://github.com/bijux/bijux-ro-crate-node/pull/144) — Typed RDF dataset tests

- Strictly type RDF dataset and markup literal identity controls while
  preserving their reference cases and assertions.

### [#143](https://github.com/bijux/bijux-ro-crate-node/pull/143) — Typed reference execution controls

- Strictly type reference process execution, family scheduling and partition
  controls while preserving subprocess ownership, timeouts and receipts.
- Check redirected reference steps and generated runtime entry reproducibility.

### [#142](https://github.com/bijux/bijux-ro-crate-node/pull/142) — Typed JSON-LD context tests

- Strictly type RDF root and remote JSON-LD context controls while preserving
  reference captures, loader isolation and public validation assertions.

### [#141](https://github.com/bijux/bijux-ro-crate-node/pull/141) — Typed verification entry points

- Strictly type the typecheck and browser verification entry points while
  retaining their command paths and existing project coverage.
- Verify generated entries and reject invalid browser verification inputs.

### [#140](https://github.com/bijux/bijux-ro-crate-node/pull/140) — Typed indexed JSON-LD tests

- Strictly type type-map and scoped type-index controls while preserving their
  reference cases and assertions.
- Type node- and language-indexed graph and reserved type identifier controls
  while retaining their fixture hashes and comparisons.

### [#139](https://github.com/bijux/bijux-ro-crate-node/pull/139) — Example server signal readiness

- Register shutdown handlers before reporting that the example server is ready,
  ensuring immediate signals trigger a clean exit.

### [#138](https://github.com/bijux/bijux-ro-crate-node/pull/138) — Typed HTTP example server

- Strictly type the example HTTP server and launcher while preserving served
  file containment, browser host imports and direct execution.
- Verify server responses and signal handling under supported Node releases.

### [#137](https://github.com/bijux/bijux-ro-crate-node/pull/137) — Example server symlink containment

- Reject example and browser test server requests whose resolved files escape
  the served root while allowing symlinks to files inside that root.

### [#136](https://github.com/bijux/bijux-ro-crate-node/pull/136) — Typed JSON-LD container tests

- Strictly type graph container, language grammar and value construction
  controls while preserving their cases and reference comparisons.

### [#135](https://github.com/bijux/bijux-ro-crate-node/pull/135) — Typed package build orchestration

- Strictly type package build and bundled license processing while preserving
  direct execution on supported Node releases.
- Include the build entry in the shared runtime reproducibility check.

### [#134](https://github.com/bijux/bijux-ro-crate-node/pull/134) — Typed profile diagnostic tests

- Strictly type profile diagnostic identity and inconsistency fact controls
  while preserving their graph and error assertions.
- Type diagnostic collection traversal controls under the strict profile test
  project without changing their cases.

### [#133](https://github.com/bijux/bijux-ro-crate-node/pull/133) — Typed workspace and archive tooling

- Strictly type workspace ordering and package archive creation while preserving
  direct execution and package admission on supported Node releases.
- Check generated runtime entries and exercise workspace dependency ordering.

### [#132](https://github.com/bijux/bijux-ro-crate-node/pull/132) — Package typecheck job budgets

- Run package typechecks in independent required Node matrices for validation
  and package candidate qualification while retaining all package checks.

### [#131](https://github.com/bijux/bijux-ro-crate-node/pull/131) — Typed profile inference tests

- Strictly type profile inference budgets, RDF term identity and pinned OWL
  entailment controls while preserving their reference cases and assertions.
- Type branching collection and member-pair inference controls under a strict
  profile test project.

### [#130](https://github.com/bijux/bijux-ro-crate-node/pull/130) — Typed parity launcher

- Strictly type the parity launcher while preserving direct execution and
  source and installed package selection on supported Node releases.
- Generate parity and admission runtime entries with a shared reproducibility check.

### [#129](https://github.com/bijux/bijux-ro-crate-node/pull/129) — Typed RDF context and prefix tests

- Strictly type RDF prefix identity and root context propagation controls while
  preserving their reference cases and fixture hashes.
- Type relative RDF context controls without changing their assertions or
  captured reference comparisons.

### [#128](https://github.com/bijux/bijux-ro-crate-node/pull/128) — Collection reference job budgets

- Run corrected collection reference capture and its independent controls in
  separate required jobs while preserving all reference checks.

### [#127](https://github.com/bijux/bijux-ro-crate-node/pull/127) — Typed admission controls

- Strictly type required-job admission checks and their tests while preserving
  direct execution on all supported Node releases.
- Verify the checked-in dependency-free gate is generated from its TypeScript source.

### [#126](https://github.com/bijux/bijux-ro-crate-node/pull/126) — Typed RDF and JSON-LD tests

- Strictly type RDF namespace, identifier, physical-base and Unicode controls
  while preserving their reference cases and fixture hashes.
- Type JSON-LD container, member-order and value controls under the existing
  metadata test project without changing their assertions.

### [#125](https://github.com/bijux/bijux-ro-crate-node/pull/125) — Typed CI and browser assurance

- Strictly type CI workflow, process orchestration and browser runtime controls
  while preserving test discovery, subprocess isolation and admission checks.
- Type WebKit file-access regression tests without changing their assertions.

### [#124](https://github.com/bijux/bijux-ro-crate-node/pull/124) — Typed validator test controls

- Strictly type manifest parsing, metadata model and RDF literal tests while
  retaining their reference fixtures and assertions.
- Type validation and worker boundary tests and check all converted tests in
  their dedicated TypeScript projects.

### [#123](https://github.com/bijux/bijux-ro-crate-node/pull/123) — Typed core tests

- Strictly type core path, file ownership, local resource and diagnostic tests
  while preserving test discovery and existing runtime assertions.

### [#122](https://github.com/bijux/bijux-ro-crate-node/pull/122) — Typed worker protocol

- Strictly type worker requests and the worker entry point while preserving
  message correlation, error handling and generated worker behavior.
- Generate worker declarations from source and verify package source inventory
  against strict TypeScript projects.

### [#121](https://github.com/bijux/bijux-ro-crate-node/pull/121) — Typed validator browser and public entry

- Strictly type browser validation sessions and the public validator entry while
  preserving worker cancellation, session ownership and public API behavior.
- Generate validator declarations from source and retain source qualification
  receipts for the TypeScript entry point.

### [#120](https://github.com/bijux/bijux-ro-crate-node/pull/120) — Typed crate validation orchestration

- Strictly type crate validation stages and shared metadata boundaries while
  preserving diagnostics, error handling and connectivity behavior.

### [#119](https://github.com/bijux/bijux-ro-crate-node/pull/119) — Typed metadata validation

- Strictly type JSON-LD context reconstruction and metadata model validation
  while preserving context policy, entity identity and diagnostics.

### [#118](https://github.com/bijux/bijux-ro-crate-node/pull/118) — Typed base profile validation

- Strictly type base profile format checks, inverse-path diagnostics and SHACL
  validation while preserving graph identity and diagnostic behavior.
- Describe the consumed SHACL interfaces and document-loader boundary without
  changing runtime validation or browser-compatible output.

### [#117](https://github.com/bijux/bijux-ro-crate-node/pull/117) — Typed RDF dataset and references

- Strictly type RDF dataset construction and reference preflight while preserving
  graph identity, literal values and reference diagnostics.
- Describe JSON-LD RDF serialization results for both dataset and N-Quads output.

### [#116](https://github.com/bijux/bijux-ro-crate-node/pull/116) — Typed RDF contexts and literal identity

- Strictly type RDF context scopes, node identifiers and namespace bindings
  while preserving context propagation and prefix selection.
- Type literal canonicalization and identity while retaining lexical values
  and existing browser-compatible behavior.

### [#115](https://github.com/bijux/bijux-ro-crate-node/pull/115) — Typed profile inference

- Strictly type profile inference datasets, collection witnesses, ontology
  rules and datatype diagnostics while preserving graph and term identity.
- Type bundled profile inputs and closure execution while retaining existing
  inference budgets, diagnostic ordering and validation behavior.

### [#114](https://github.com/bijux/bijux-ro-crate-node/pull/114) — Typed RDF processing boundaries

- Strictly type JSON-LD context processing, RDF preflight guards and physical
  base tracking while retaining reference-compatible identifier handling.
- Type literal datatype aliases and numeric provenance without changing
  diagnostics, graph identity or generated JavaScript package behavior.

### [#113](https://github.com/bijux/bijux-ro-crate-node/pull/113) — Typed XML literal processing

- Strictly type XML fragment parsing, source validation and serialization while
  preserving RDF lexical identity and existing parser behavior.

### [#112](https://github.com/bijux/bijux-ro-crate-node/pull/112) — Typed worker response validation

- Strictly type worker response checks while preserving validation of
  untrusted messages and existing browser behavior.

### [#111](https://github.com/bijux/bijux-ro-crate-node/pull/111) — Typed validation boundaries

- Strictly type crate identity and connectivity checks while preserving their
  existing diagnostics and graph traversal.

### [#110](https://github.com/bijux/bijux-ro-crate-node/pull/110) — Typed metadata model validation

- Strictly type model validation and its generated registry while retaining
  existing schema coercion, diagnostics and model defaults.
- Direct the pinned registry generator to the TypeScript source path without
  changing generated model or context data.

### [#109](https://github.com/bijux/bijux-ro-crate-node/pull/109) — Typed HTML literal processing

- Strictly type HTML fragment parsing, optional-tag filtering and literal
  serialization while preserving RDF lexical identity and browser behavior.
- Retain existing source, built-package and browser validation controls.

### [#108](https://github.com/bijux/bijux-ro-crate-node/pull/108) — Typed metadata URL validation

- Strictly type model URL parsing and hostname normalization while retaining
  URL validation behavior and reference-compatible diagnostics.
- Keep the browser URL controls bound to the TypeScript source entrypoint.

### [#107](https://github.com/bijux/bijux-ro-crate-node/pull/107) — Typed RDF terms and namespaces

- Strictly type RDF scalar literal normalization, retaining numeric, binary,
  date and duration lexical identity and diagnostic behavior.
- Type namespace formatting and Unicode name classification while preserving
  reference-compatible prefix selection and generated JavaScript output.

### [#106](https://github.com/bijux/bijux-ro-crate-node/pull/106) — Typed metadata values

- Strictly type date and integer model parsing and Unicode diagnostics while
  preserving reference-compatible coercion and validation behavior.
- Type JSON-LD value conversion and literal serialization while retaining
  numeric identity, key ordering and JavaScript package behavior.

### [#105](https://github.com/bijux/bijux-ro-crate-node/pull/105) — Typed manifest parsing and validation

- Strictly type file-list tokenization, value inference, numeric identity and
  validation while preserving existing diagnostics and reference behavior.
- Type the shared Python string representation and retain JavaScript package
  output and source parity controls.

### [#104](https://github.com/bijux/bijux-ro-crate-node/pull/104) — Typed metadata JSON parsing

- Strictly type metadata JSON token parsing, member ordering and numeric
  provenance while preserving reference-compatible numeric and key behavior.
- Load typed source in validation and reference checks while retaining plain
  JavaScript execution for installed-package comparisons.

### [#103](https://github.com/bijux/bijux-ro-crate-node/pull/103) — Strict TypeScript core

- Convert the core implementation to strictly checked TypeScript and generate
  its published declarations from source while preserving public contracts.
- Retain JavaScript distribution and validator/worker build behavior; run core
  source tests with a development-only loader and keep consumer type checks.

### [#101](https://github.com/bijux/bijux-ro-crate-node/pull/101) — RDF base-scheme resolution

- Apply Python's independent scheme tables for relative paths, authorities and
  final-segment parameters, preserving FTP, file and WebSocket identities.
- Preserve opaque-base behavior, context-base lineage, fragments and empty
  parameter inheritance without restoring an unknown physical origin.
- Add 18 complete unchanged-Python captures and 219 focused controls; retain
  standard metadata expansion, URI/blank-node kinds and earlier reference cases.
- Expand the corpus to 1,677 cases: 1,526 exact current-main comparisons and
  151 separately qualified collection cases. Preserve every earlier raw record.

### [#102](https://github.com/bijux/bijux-ro-crate-node/pull/102) — Python and browser qualification budgets

- Distribute all 62 syntax checks and collection proofs/diagnostics across
  independent required jobs while retaining their complete verification.
- Capture all 138 original collection cases in four partitions with two workers;
  verify exact registered inputs, source identity, coverage and full records.
- Isolate byte-identical oracle harnesses and owned output receipts. Cancel and
  drain worker process trees, including verifier descendants, on failure.
- Run validation browser corpus in eight partitions per engine and distribution,
  preserving every case and the existing five-minute limits.

### [#100](https://github.com/bijux/bijux-ro-crate-node/pull/100) — Complete snapshot qualification budgets

- Replay source and installed snapshots in twelve partitions with two workers,
  retaining every case, exact comparison and separately qualified correction.
- Bind each partition to its source, module bytes, Node executable and reference;
  reject missing, duplicated or failed evidence before admitting the aggregate.
- Preserve owned report, stderr and exit receipts. Abort and drain timed-out or
  failed workers before the enclosing deadline, without retaining stale success.
- Split candidate browser corpus into eight partitions for every engine and
  distribution, preserving complete coverage and all five-minute job limits.

### [#99](https://github.com/bijux/bijux-ro-crate-node/pull/99) — Merged Python context correspondence

- Adopt actual merged Python main `c21eb70`, retaining exact source, dependency
  and semantic-input hashes instead of assuming an unmerged collection fix.
  Align packaged compatibility/attribution text and distinguish historical source
  calibration from the active reference.
- Reject unsupported context defaults, scoped/protected/disabled definitions,
  standard-property direction changes and prefix value semantics in Python's
  validation order. Preserve supported containers, coercions and type aliases;
  distinguish namespace prefixes from standard BIA properties.
- Add 128 complete current-main context cases. Preserve untouched Python reports
  and separately label 151 registered collection-defect qualifications, with
  source, role, input-byte and observation guards through Node/browser receipts.
- Recapture active reference contracts, retire context corrections now handled
  upstream, and refresh complete-report counts and compatibility documentation.
- Bind direct JSON-LD and propagation proofs to the active parser source hash,
  catching stale primitive evidence during local contract checks.

### [#98](https://github.com/bijux/bijux-ro-crate-node/pull/98) — RDF reference identities

- Preserve URN namespaces during RDF reference resolution, including relative
  paths, fragments, queries and context-base overrides.
- Retain URI identity for explicit IDs built from blank-looking prefixes, so
  missing references cannot disappear. Preserve actual blank nodes and keep empty
  prefix namespaces from rewriting lexical references.
- Match HTTP node-path joining for repeated slashes, inherited queries, dot
  segments and final-segment parameters, retaining complete reference findings.
- Add 120 direct and complete-report controls; keep ordinary metadata
  and default JSON-LD resolution independent of RDFLib compatibility behavior.

### [#97](https://github.com/bijux/bijux-ro-crate-node/pull/97) — JSON-LD parser exception evidence

- Retain the original PyLD parser exception while recording its message instead
  of replacing it with an instrumentation error.
- Restore thirty-nine exception observations and require their class, code,
  message and processing stage in capture qualification. Preserve all seventy-two
  input receipts, statuses and reports, including thirty-three completed records.

### [#96](https://github.com/bijux/bijux-ro-crate-node/pull/96) — JSON-LD dictionary ownership

- Preserve prototype-named RDF predicates as ordinary data properties so their
  edges and required undefined-reference findings cannot disappear.
- Own subject and graph dictionary entries, preventing hostile relative identities
  from changing shared JavaScript prototypes or disrupting later validation.
- Preserve protected term flags through context cloning and reset checks.
- Add twenty-eight complete unchanged-Python captures and isolated ownership
  controls; retain all earlier reports and expand ordinary qualification to 1,531 cases.

### [#95](https://github.com/bijux/bijux-ro-crate-node/pull/95) — JSON-LD graph context qualification

- Retain six upstream diagnostic corrections and six agreeing controls for
  type-map label order, local nonpropagation and named graph membership.
- Capture original reports and independently corrected reports with source hashes
  and exact input checks at both metadata and profile graph construction.
- Require the same complete reports through source, installed Node and browser
  qualification; keep these differences outside ordinary Python agreement.

### [#94](https://github.com/bijux/bijux-ro-crate-node/pull/94) — Unicode URL credentials

- Iterate URL credentials by code point so supplementary characters cannot
  replace a following character or hide a username/password separator.
- Retain twelve pinned-Python normalization controls for usernames, passwords,
  repeated at-signs, encoded values and special/opaque schemes.

### [#93](https://github.com/bijux/bijux-ro-crate-node/pull/93) — Sibling type-map context isolation

- Reset each RDF type-map index context so one sibling cannot add or suppress
  another sibling's required Dataset or WebSite findings; preserve the separately
  captured metadata processing behavior.
- Add fourteen independent complete Python reports and twenty-eight direct graph
  and expansion controls, including reversed order and explicit-node counterparts.
- Remove the obsolete productive-collection limit and refresh the corpus identity;
  retain physical-parent and numeric-portability boundaries and the provisional
  upstream reference.

### [#92](https://github.com/bijux/bijux-ro-crate-node/pull/92) — Source Node package qualification

- Qualify ordinary source snapshots and complete upstream, reserved-type, JSON-LD
  and model-prefix contracts on pinned Node 22/24 in parallel candidate jobs.
- Admit exactly two current-source receipts with matching modules, case sets and
  completions before retaining the existing producer archives.
- Add the missing source upstream-contract invocation to Validation, preserving
  installed/browser coverage, archive identity and publication restrictions.

### [#91](https://github.com/bijux/bijux-ro-crate-node/pull/91) — Worker error callback ownership

- Fence worker error callbacks before and after reading event properties, so stale
  or reentrant errors cannot fail a replacement draft or cancel its validation.
- Contain thrown getters and preventDefault callbacks as incomplete current results,
  retaining ordinary error messages, continuation refusal and valid recovery.
- Add 24 focused lifecycle controls and ten native worker/ErrorEvent controls,
  checking source and installed Sessions on both Node versions and all three browsers.

### [#90](https://github.com/bijux/bijux-ro-crate-node/pull/90) — Type-index scope ownership

- Prevent default type-index scopes from coercing descendants as JSON, retaining
  distinct integer/JSON cells and the required ambiguous-list rejection.
- Preserve explicit type precedence, propagation overrides, index-IRI ownership
  and standard expansion, with 39 independent primitive controls.
- Add 19 complete untouched-Python reports, retain all 1,470 previous rows, and
  qualify source/installed outcomes and browser continuation.

### [#89](https://github.com/bijux/bijux-ro-crate-node/pull/89) — Explicit model-type prefixes

- Preserve explicit prefix flags so an aliased second BIA class cannot disappear
  before the existing one-model validation.
- Keep raw type-token checks, disabled-prefix behavior and six metadata refusals.
- Retain twenty complete original/corrected reports, independent full-URI graph
  counterparts and source/installed Node and browser handoff controls.

### [#87](https://github.com/bijux/bijux-ro-crate-node/pull/87) — JSON-LD processing contracts

- Reject array-valued literal datatypes after type-map insertion and discard malformed
  RDF language literals using complete RFC 5646 well-formedness.
- Retain 80 complete original/corrected outcomes, exact interruption reasons, 72 direct
  expansions, 325 language boundaries and independently equivalent propagation controls.
- Require source, installed and browser guards plus fresh scoped Python captures; derive
  browser coverage from all six required suites and test complete, missing and extra receipts.

### [#88](https://github.com/bijux/bijux-ro-crate-node/pull/88) — Bounded parallel reference qualification

- Run independent upstream reference families through two concurrent chains while
  preserving each capture, comparison and scope proof in dependency order.
- Retain all 43 commands and require every family to succeed before the final
  111-case Node guard. Keep the existing jobs and five-minute workflow limits.
- Await active children on failure, enforce bounded command deadlines and reject
  stale success receipts. Qualify concurrency, sequencing and failure admission
  with subprocess tests.

### [#86](https://github.com/bijux/bijux-ro-crate-node/pull/86) — JSON-LD map ownership and null node types

- Preserve node ownership inside type, index and identifier maps, including scoped
  contexts and keyword-shaped index names.
- Keep language-map entries in their literal role and preserve their values.
- Omit null-expanded node types before node-map construction while retaining
  non-null types and ordinary graph edges.
- Add 41 completed ordinary cases without altering the 1,429 existing records.
  Qualify six bounded reserved-type observers, including two standards-backed
  corrections and four unchanged controls, through source and installed Node and
  browser Sessions.

### [#85](https://github.com/bijux/bijux-ro-crate-node/pull/85) — Temporal literal conversion contracts

- Record nine complete inputs for three non-XSD time/dateTime spellings, retaining
  original Python reports and six independently corrected rejections.
- Bind the correction to the exact datatype/spelling pairs and both RDFLib converter
  maps, with source hashes, restoration checks and three unchanged controls.
- Require fresh original/corrected captures and all 111 defect guards through source,
  installed packages and browser Sessions, retaining strict ordinary comparisons.

### [#84](https://github.com/bijux/bijux-ro-crate-node/pull/84) — Manifest inference reference contracts

- Qualify signed-minimum/missing-value collisions using nullable integer parsing
  and pandas float promotion for two exact TSV hashes; restore only the genuine
  minimum and retain every unaffected cell, missing mask, dtype and index value.
- Qualify the implicit-index warning-header failure with an in-memory label
  fallback for one exact TSV hash; keep data computation unchanged and confirm
  the intended DtypeWarning is emitted.
- Preserve nine original and corrected Python reports with three explicit
  differences and six unchanged controls; require source/wheel proofs and private
  102-case guards through source, installed packages and browser Sessions.

### [#83](https://github.com/bijux/bijux-ro-crate-node/pull/83) — Complete OWL key comparison

- Require a shared value at every property position of a complete key witness,
  preserving required WebSite name findings when final values are absent or disjoint.
- Retain sixteen original and independently corrected Python reports, the original
  primitive query, and all 138 existing collection records unchanged.
- Extend the required defect guards to 93 cases through source, installed packages
  and browser Sessions, with private input and complete-report comparison authority.

### [#82](https://github.com/bijux/bijux-ro-crate-node/pull/82) — Productive collection witnesses

- Evaluate complete branching and cyclic RDF lists with finite witness relations,
  including additional lengths through described `rdf:nil` cells.
- Require member pairs to coexist on one complete witness, and preserve finite
  inference budgets and the separate diagnostic traversal.
- Qualify 138 complete inputs with original and independently corrected Python
  captures, bounded exception-order proofs, exact CI receipts, and source/installed
  browser handoffs.

### [#81](https://github.com/bijux/bijux-ro-crate-node/pull/81) — Session completion ownership

- Snapshot and validate owned worker results before stopping validation, so transferred result values
  and changing getters cannot leave a Session validating or approve contradictory findings.
- Turn arbitrary callback throws and worker cleanup failures into terminal incomplete results with
  nonempty reasons, preserving revision ownership under reentrant callbacks and valid recovery.
- Qualify native workers, source and installed Sessions, refused continuation and exact-byte recovery
  across all three browser engines, while preserving ignored outer response telemetry.

### [#80](https://github.com/bijux/bijux-ro-crate-node/pull/80) — JSON-LD graph and type containers

- Preserve identifier-only and empty graph-container values until graph wrapping,
  retaining parent edges and the profile constraints inferred from them.
- Resolve RDF type-map indices as node identifiers, including base resolution, and
  ignore actual null indices while preserving completed rejection findings.
- Add 28 complete Python reports, 36 independent graph expansions and 44 type-map
  expansions; retain every existing report and check source/installed continuation.

### [#79](https://github.com/bijux/bijux-ro-crate-node/pull/79) — Numeric literal whitespace

- Trim original decimal padding before removing underscores, preserving conversion
  failures and required profile findings for malformed float/double literals.
- Add 71 complete Python captures and 54 primitive boundaries, retaining all 1,330
  previous reports and the existing 142 primitive records.
- Check complete reports and exact continuation bytes through source, installed
  packages and all three browser engines; record the expanded compatibility evidence.

### [#78](https://github.com/bijux/bijux-ro-crate-node/pull/78) — URL authority compatibility contracts

- Retain standards-correct rejection of empty-userinfo hosts at EOF and backslash
  termination of non-special ports, preserving the original Python approvals.
- Qualify twenty-seven complete inputs against unchanged-Python counterparts and
  agreeing neighbors through source, installed packages and browser Sessions.
- Keep input registrations and expected reports private, reject altered findings and
  inputs, and expand the required defect guards to 77 cases with 33 explicit differences.

### [#76](https://github.com/bijux/bijux-ro-crate-node/pull/76) — Reference comparison authority

- Keep expected reports and policy selectors private while retaining detached public inspection data.
- Require exact registered file bytes, contexts and member order on every comparison.
- Prevent assertion error details from exposing mutable reference authority, with tampering regressions.

### [#77](https://github.com/bijux/bijux-ro-crate-node/pull/77) — Pinned browser runtime provisioning

- Run validation and unpublished package browser jobs in the digest-pinned official Playwright image,
  replacing per-runner system-package and browser downloads.
- Verify the locked client, browser revisions and executable paths, and record a real browser launch
  before the existing source/installed checks.
- Preserve every engine, corpus shard, interaction lane, coverage gate and five-minute job limit.
- Run as the official unprivileged browser user with an owned home directory, and trust only the
  mounted checkout path for Git provenance checks.

### [#74](https://github.com/bijux/bijux-ro-crate-node/pull/74) — Metadata diagnostic precedence

- Reject escaped lone surrogates in date and integer fields before syntax parsing, while preserving
  ordinary errors for valid Unicode and valid surrogate pairs.
- Keep literal at-signs in file-host diagnostics so IPv6 and international-domain
  errors follow the pinned parser’s precedence.
- Add 36 complete Python captures and neighboring date/integer/URL controls, retaining all
  1,294 existing records and exact-byte continuation checks.

### [#75](https://github.com/bijux/bijux-ro-crate-node/pull/75) — Parallel source parity admission

- Run package unit/type checks and source parity on separate Node 22/24 runners,
  retaining every existing snapshot, native-input and literal-grammar check.
- Reuse the same-run verified asset bundle for source parity and require both
  prerequisite groups before either canonical package admission context succeeds.
- Preserve five-minute job limits and fail admission on failed, cancelled or skipped checks.


### [#73](https://github.com/bijux/bijux-ro-crate-node/pull/73) — Manifest inference chunk boundaries

- Share pandas' floored width quotient between TSV storage and column inference so
  wide manifests preserve signed/unsigned path identities and duplicate findings.
- Capture nineteen complete Python reports around adjacent widths and row boundaries,
  retaining implicit indexes, undeclared-column interruptions and all existing captures.
- Require the same cases in source and installed workers and browser Sessions,
  checking complete findings, rejected continuation and exact valid handoff bytes.

### [#72](https://github.com/bijux/bijux-ro-crate-node/pull/72) — Repository history by pull request

- Replace release grouping and the standing publication-status paragraph with linked
  pull-request history in actual merge order.
- Expand substantial implementation, qualification and governance entries while keeping
  small fixes concise.
- Correct historical attribution, record omitted Unicode and archive-safety changes, and
  remove the implication that parallel CI met its timing goal.

### [#71](https://github.com/bijux/bijux-ro-crate-node/pull/71) — Unpublished package candidate qualification

- Build candidate archives once and qualify those exact bytes through Node 22/24
  consumers, four corpus shards per browser engine and separate source/installed
  interaction jobs.
- Require every job, complete browser coverage and archive integrity before uploading
  the qualified archives; retain their commit, tree, lock and qualification receipts
  without rebuilding them.
- Preserve the manual, read-only unpublished artifact contract and add workflow tests
  for required job dependencies and upload ordering.

### [#70](https://github.com/bijux/bijux-ro-crate-node/pull/70) — Complete collection rule semantics

- Require complete OWL list witnesses, retain false-valued literal cells and return
  incomplete for unsupported productive branching or additional witnesses through
  described `rdf:nil`.
- Check every member-position pair, including final and repeated members, for disjoint
  properties and `AllDifferent` contradictions.
- Keep diagnostic traversal separate from OWL operands: preserve partial-list prefixes
  and first-arc order, bound traversal and retain cyclic-focus findings that Python
  loses during rendering and report cloning.
- Qualify 125 collection contracts and fifteen diagnostic contracts through
  source/installed Node and native browser Sessions, including agreeing controls and
  exact-byte continuation.
- Preserve all fourteen migrated inputs and original reports, leaving the other 1,275
  ordinary cases and fifty existing defect guards strict; confine capture-only
  exception-child ordering equivalence to two characterized cases.
- Spread browser corpus checks across four shards, separate source/installed interaction
  runners and isolate the Node 22 collection source gate while retaining complete
  coverage.
- Clarify physical-parent and numeric-input limits as explicit incomplete-input
  boundaries, separate from confirmed upstream defects.

### [#69](https://github.com/bijux/bijux-ro-crate-node/pull/69) — Literal grammar compatibility contracts

- Preserve original Python outcomes and qualify bounded HTML tree-building and XML
  name-edition differences with isolated grammar corrections and unchanged-Python
  counterparts.
- Check HTML trees independently in all three browser engines while preserving the
  Python serializer and the declared XML edition boundary.
- Require 62 complete contracts across source/installed Node and browser Sessions,
  including registered inputs/contexts, complete findings, exact valid handoffs and
  shard coverage.
- Reject mutations of contract inputs, ownership and correction provenance, keeping
  qualified differences outside ordinary strict agreement.

### [#68](https://github.com/bijux/bijux-ro-crate-node/pull/68) — XML source and namespace validation

- Reject malformed XML source and duplicate namespace-expanded attributes before DOM
  construction can repair or discard them.
- Enforce XML name and reserved namespace rules while normalizing valid `xmlns` elements
  and replacement-character attributes with document-local construction fixes.
- Qualify complete collection/profile outcomes and neighboring comments, CDATA,
  processing instructions, references and namespace scopes against unchanged Python.

### [#67](https://github.com/bijux/bijux-ro-crate-node/pull/67) — Strict HTML tree errors

- Preserve literal spelling when nested headings or `nobr` require strict tree-building
  errors, including paragraph closure and reconstructed formatting.
- Retain valid neighboring structures and qualify literal identity and complete
  collection/profile outcomes against unchanged Python.

### [#66](https://github.com/bijux/bijux-ro-crate-node/pull/66) — Unicode file ownership

- Return incomplete for unpaired UTF-16 in selected names and file text before UTF-8
  upload can replace bytes or collapse distinct paths.
- Preserve valid Unicode, escaped JSON text and existing Blob/byte inputs, including
  native File collision and corrected-input recovery controls.
- Keep the rejected current draft private and ineligible across retries and option
  changes instead of reverting to an earlier successful snapshot.
- Reconcile compatibility evidence and pull-request history with the accepted validator
  changes.

### [#64](https://github.com/bijux/bijux-ro-crate-node/pull/64) — Portable numeric file identities

- Return incomplete when platform-dependent decimal inference changes file-list
  findings, interruptions or inbound references.
- Keep agreeing interpretations unchanged and qualify refusal and exact-byte handoff
  controls separately from upstream defects.

### [#65](https://github.com/bijux/bijux-ro-crate-node/pull/65) — Native directory input events

- Register the native file-input listener before sending the selection protocol call, so
  an immediate event cannot be missed.
- Require the event and release its handle after success or failure; retain
  native-selection and WebKit permission checks.

### [#63](https://github.com/bijux/bijux-ro-crate-node/pull/63) — TSV storage capacity

- Track the pinned tokenizer's byte, field and line storage, including BOM reservation,
  padding and low-memory drains.
- Preserve completed records and return incomplete when the reference exhausts its token
  capacity.

### [#62](https://github.com/bijux/bijux-ro-crate-node/pull/62) — HTML and XML literal boundaries

- Keep strict HTML parsing at the reference dispatch boundary, including foreign content
  and malformed-literal fallback.
- Preserve XML lexical identity when reserved namespace bindings prevent
  canonicalization.

### [#61](https://github.com/bijux/bijux-ro-crate-node/pull/61) — Schema reflexivity

- Prevent subclass/subproperty cycles and mutual equivalence rules from manufacturing
  reflexive facts.
- Retain explicit self-equivalence and type-driven property axioms, with complete
  profile findings checked against Python.

### [#60](https://github.com/bijux/bijux-ro-crate-node/pull/60) — Browser interaction scheduling

- Run source interaction guards alongside the ordered installed-guard and consumer-app
  chain, awaiting both groups on failure.
- Isolate native-selection fixtures by distribution so concurrent checks cannot
  overwrite each other's inputs.

### [#59](https://github.com/bijux/bijux-ro-crate-node/pull/59) — Model type diagnostics

- Share the pinned Python string representation between manifest and model diagnostics.
- Preserve quoting, control-character escapes, list order and recognized-type
  counterparts without changing model selection.

### [#58](https://github.com/bijux/bijux-ro-crate-node/pull/58) — Compatibility evidence

- Introduce linked behavioral entries for every accepted pull request.
- Reconcile profile, context, import and Session coverage with the executable corpus and
  explicit root-context correction contracts.

### [#57](https://github.com/bijux/bijux-ro-crate-node/pull/57) — Nonpropagating root contexts

- Preserve the root identity context while keeping child-scope reversion, property
  coercion and later metadata/model processing separate.
- Replace missing-parent crashes with exact independently qualified outcomes for inline,
  remote and imported contexts, backed by RDF/model graph comparisons.
- Expand the required upstream suite to fifty cases; retain original bytes and reports
  for four migrated crate defects and the primitive crashes, alongside strict import and
  cache-order controls.

### [#56](https://github.com/bijux/bijux-ro-crate-node/pull/56) — Disabled JSON-LD terms

- Keep custom null mappings disabled during model expansion while retaining BIA
  field-remapping rejection and valid vocabulary behavior.
- Preserve original parser crashes and exact unchanged-Python counterparts separately
  from ordinary primitive coverage.
- Add twelve defect/control inputs to the required upstream suite and qualify
  source/installed validators and Sessions without changing the ordinary captures.

### [#55](https://github.com/bijux/bijux-ro-crate-node/pull/55) — Confirmed upstream defect guards

- Render recursive diagnostics using RDF equality, deterministic predicate/value
  ordering and a cache scoped to each focus.
- Keep required Dataset and WebSite rejections when Python reporting or decimal/date
  conversion failures approve invalid profile data.
- Add a required 23-case defect suite with original Python captures, exact correction
  contracts and agreeing controls across source, installed packages and Sessions.
- Move one proven diagnostic defect out of ordinary agreement while retaining its
  original input/report; reject extra or altered findings and keep the ordinary
  comparator strict.

### [#54](https://github.com/bijux/bijux-ro-crate-node/pull/54) — Imported context keywords

- Process imported headers before their keyword handlers while retaining separate RDFLib
  and PyLD semantics and local version checks.
- Ignore RDF import-object bases, including local overrides, without changing
  physical-root or unbased provenance; keep cached responses immutable.

### [#53](https://github.com/bijux/bijux-ro-crate-node/pull/53) — Equal-triple source ownership

- Preserve source member order on an owned RDF input copy so equal triples retain the
  reference first constructor value.
- Keep standard metadata/model sorting and cloning separate.

### [#52](https://github.com/bijux/bijux-ro-crate-node/pull/52) — OWL closure boundaries

- Retain blank-predicate facts through their last rule use, then remove them before
  profile validation.
- Seed initial datatype/equality facts and retain self-equivalent class and property
  guards.

### [#51](https://github.com/bijux/bijux-ro-crate-node/pull/51) — Portable metadata URL parsing

- Use pinned IDNA tables and a portable URL parser across Node and browsers, including
  file-drive and opaque-host normalization.
- Reject malformed ACE labels and lone surrogates while preserving query/fragment text
  and mapped IPv4 error precedence.
- Check normalized model values in all three browsers and retain bundled dependency
  license notices.

### [#50](https://github.com/bijux/bijux-ro-crate-node/pull/50) — Relative and scoped RDF contexts

- Keep raw relative predicate/datatype IRIs and resolve node references through the
  active base without relaxing later metadata/model checks.
- Preserve ID-only type-scope reversion, scalar ID coercion, inherited property scopes,
  ignored literal-local contexts and empty node-context resets.
- Retain empty node mappings and disabled-base lineage through relative bases,
  constructor normalization and query/fragment handling.
- Share URI authority checks with OWL datatypes and keep physical-parent-dependent
  identities explicitly incomplete.

### [#49](https://github.com/bijux/bijux-ro-crate-node/pull/49) — XML and strict HTML literal identity

- Preserve XML namespace and line-ending rules, strict HTML parsing, legal optional
  closures and malformed-literal fallback.
- Retain the resulting identities in collection ambiguity checks and OWL value
  restrictions.

### [#48](https://github.com/bijux/bijux-ro-crate-node/pull/48) — Blank focus diagnostics

- Render inverse-path blank focus nodes from graph facts visible before JavaScript-only
  class expansion, with reference namespace and ordering rules.
- Build the diagnostic index only when needed and characterize recursive message
  differences outside ordinary strict cases.

### [#47](https://github.com/bijux/bijux-ro-crate-node/pull/47) — UTF-8 date and clock bounds

- Measure initial date and clock limits in UTF-8 bytes so malformed multibyte values
  retain the reference component diagnostics.

### [#46](https://github.com/bijux/bijux-ro-crate-node/pull/46) — Empty manifest name declarations

- Skip optional name-column lookup for an empty declaration; nonempty declarations still
  require their named column.

### [#45](https://github.com/bijux/bijux-ro-crate-node/pull/45) — RDF namespace labels

- Preserve namespace aliases, conflicts, raw root bindings, ontology prefix restoration,
  pinned Unicode URI splitting and raw-IRI fallback in profile findings.
- Retain JSON member order in inline, serialized and imported contexts; scoped prefixes
  stay local.

### [#42](https://github.com/bijux/bijux-ro-crate-node/pull/42) — Selected-crate and blank-node identities

- Keep caller-provided file addresses distinct from the private validation root and
  rebind only trusted profile targets.
- Preserve explicit blank-node labels, reserve anonymous identifiers and retain bare
  `_:` as a named term.
- Return incomplete and refuse continuation when used RDF identities need an unknown
  physical parent; retain the original characterizations outside ordinary strict
  agreement.

### [#44](https://github.com/bijux/bijux-ro-crate-node/pull/44) — Parallel validation checks

- Run reference groups, live Python fixture shards, browser engine/fixture shards and
  installed Node checks in parallel.
- Prepare package and Python inputs once, verifying archive hashes, source identity and
  dependency pins before reuse.
- Bind shared runtimes to their workflow run and attempt; validate archive paths, entry
  types and link targets against declared ownership before extraction.
- Require complete, unique fixture execution and distribution-specific Worker/Session
  coverage at the existing required gates.
- Preserve command order within each independent browser distribution chain, await both
  on failure and retain the complete default local commands.

### [#43](https://github.com/bijux/bijux-ro-crate-node/pull/43) — Independent Python context captures

- Clear PyLD resolved and inverse context caches before each oracle crate; verify
  repeated and reversed inputs against isolated Python processes without rewriting
  expected records.

### [#41](https://github.com/bijux/bijux-ro-crate-node/pull/41) — OWL literal values and error facts

- Require named RDF vocabulary terms for schema facts so literal strings cannot act as
  class or property constants.
- Compare cardinalities using literal constructor values and activate datatype
  disjointness for the datatypes actually used.
- Match pinned lexical converter boundaries before profile checks, including numeric,
  calendar and URI values.
- Generate pinned Python Unicode word-character ranges for OWL name datatypes instead of
  relying on the JavaScript runtime tables.
- Materialize OWL inconsistency facts and identify only closure-created error nodes;
  retain strict messages, severities, duplicate counts and existing identifiers.
- Characterize upstream decimal/date converter failures separately while retaining the
  other required Node validation checks.
- Extend the live-oracle and Python job budgets for the complete corpus and report
  per-case progress, elapsed time and terminating signals.

### [#40](https://github.com/bijux/bijux-ro-crate-node/pull/40) — Selected colon filenames

- Resolve selected names such as `a:b.tsv` and percent-decoded aliases as local files
  while retaining absolute-path, traversal and collision guards.
- Verify actual source/installed directory selection, complete reports and exact-byte
  continuation in all three browser engines.
- Increase the browser job timeout to cover the complete installed validation matrix
  without dropping checks.

### [#39](https://github.com/bijux/bijux-ro-crate-node/pull/39) — Expanded manifest joins

- Build manifest reference joins after path/name list expansion and preserve Python
  interruptions for list-valued keys.
- Retain singleton-list type diagnostics and discard only pending self-reference
  findings when that scan is interrupted.
- Match pandas signed-zero conversion at extreme exponents.

### [#38](https://github.com/bijux/bijux-ro-crate-node/pull/38) — Scalar and escaped-constant regression coverage

- Add 49 independently captured complete-crate cases for native numeric tokens, scalar
  model coercion and escaped non-finite-marker strings, preserving exact inputs and
  reports without changing production code.

### [#37](https://github.com/bijux/bijux-ro-crate-node/pull/37) — Descriptor bindings and finding identity

- Keep each metadata descriptor paired with its root during profile target selection.
- Preserve datatype and language when coalescing findings so equal text does not erase
  distinct RDF values.
- Document the upstream reporting disagreement separately from strict parity and retain
  the conservative rejection guards.

### [#36](https://github.com/bijux/bijux-ro-crate-node/pull/36) — Conservative literal-target policy

- Add a separate fourteen-case literal-Dataset suite retaining six upstream false
  approvals, two agreeing rejections and six valid counterparts.
- Verify required rejection, continuation refusal and exact valid-byte handoffs through
  source/installed Node validators and browser Sessions; leave production code and
  ordinary comparisons unchanged.

### [#35](https://github.com/bijux/bijux-ro-crate-node/pull/35) — Tokenizer replay and read boundaries

- Match pandas whitespace backtracking, Unicode input buffers and width-derived read
  budgets.
- Capture actual-file records and full-crate outcomes around ordinary and implicit-index
  row boundaries.

### [#34](https://github.com/bijux/bijux-ro-crate-node/pull/34) — JSON literal container precedence

- Preserve RDFLib JSON-literal precedence over container/index handling while retaining
  PyLD model validation and separate caches.
- Distinguish an absent value-object type from an ordinary property named `undefined`.

### [#33](https://github.com/bijux/bijux-ro-crate-node/pull/33) — Escaped non-finite-marker strings

- Require raw JSON token identity before interpreting non-finite constants; preserve
  escaped strings that decode to the same marker text.
- Refuse numeric-marker conversion when the runtime cannot provide token-source
  information.

### [#32](https://github.com/bijux/bijux-ro-crate-node/pull/32) — Native JSON scalar identity

- Preserve native integer and floating-point token identity through RDF expansion,
  context coercion and JSON literal formatting.
- Keep model coercion separate from explicit typed-string conversion.
- Isolate internal datatype markers from user IRIs, including IRIs assembled through
  contexts.
- Retain scoped-context ownership and complete parser diagnostics without changing
  standard metadata context processing.

### [#31](https://github.com/bijux/bijux-ro-crate-node/pull/31) — Worker termination ownership

- Release worker ownership before termination so a callback can replace validation
  without losing the replacement worker, deadline or result.
- Retain revision guards through cancellation, completion, failure, disposal and
  reentrant caller getters or file iterators.
- Bind installed Session tests to their actual installed core dependency and reject
  fallback to source core.

### [#30](https://github.com/bijux/bijux-ro-crate-node/pull/30) — Calendar and markup literal identity

- Match signed calendar-duration carry, decimal scale and scientific month formatting.
- Normalize RDF XML and HTML fragments with pinned serialization and malformed-text
  fallback.
- Retain dependency attribution and independent literal and complete-crate captures.

### [#29](https://github.com/bijux/bijux-ro-crate-node/pull/29) — Infinity and manifest records

- Preserve whitespace-surrounded Infinity tokens as strings during manifest inference.
- Retain delimiter behavior after skipped CR records and independent tokenizer controls.

### [#28](https://github.com/bijux/bijux-ro-crate-node/pull/28) — Opaque URLs and authorities

- Preserve opaque URL paths and allowed host controls.
- Report malformed multi-colon ports without replacing them with a hostname error.

### [#27](https://github.com/bijux/bijux-ro-crate-node/pull/27) — Native file ownership across realms

- Accept native files and buffers from other realms using intrinsic brand checks.
- Preserve owned bytes and Blob storage despite overridden accessors, readers and later
  caller mutations.

### [#26](https://github.com/bijux/bijux-ro-crate-node/pull/26) — Generalized profile facts

- Retain literal-subject facts through profile target selection without weakening
  `sh:class` or plain/typed-string distinctions.
- Generate locked OWL built-in class and annotation facts alongside the profile assets.
- Compare complete inferred collection terms, including datatype and language, rather
  than matching their text alone.
- Qualify source and installed browser Sessions against complete reports, continuation
  refusals, approved input bytes and contexts.

### [#24](https://github.com/bijux/bijux-ro-crate-node/pull/24) — Reentrant worker startup

- Preserve replacement validation when the previous worker factory reenters selection or
  throws during startup.

### [#25](https://github.com/bijux/bijux-ro-crate-node/pull/25) — Verified ontology compiler downloads

- Retry bounded compiler downloads, use the public asset fallback and verify pinned
  bytes before installation.

### [#23](https://github.com/bijux/bijux-ro-crate-node/pull/23) — RDF identity and graph scope

- Preserve context-coerced double text and native binary64 precision before RDF
  serialization.
- Materialize reflexive equality used by OWL value restrictions.
- Confine preflight reference and collection checks to the default graph.

### [#22](https://github.com/bijux/bijux-ro-crate-node/pull/22) — RDF literal normalization

- Normalize recognized numeric, boolean, whitespace, temporal, binary and duration terms
  before collections and inference.
- Preserve datatype, language, decimal scale, local clock identity and failed conversion
  text.
- Use pinned Unicode digit ranges and count integer digits separately from signs and
  separators.

### [#21](https://github.com/bijux/bijux-ro-crate-node/pull/21) — Imported context isolation

- Merge imported contexts privately, preserve own keys and scope resolver caches to one
  immutable loader snapshot.
- Preserve parsed and serialized remote-response completion and local override
  precedence.

### [#19](https://github.com/bijux/bijux-ro-crate-node/pull/19) — Product checks before publication admission

- Require every canonical product check before publication admission, including Python,
  browser and both Node checks missing from effective branch rules.
- Consume accepted shared standards through their generators, refreshing
  component/checksum manifests and the governance receipt while preserving the
  independent documentation pin and disabled npm publication.

### [#20](https://github.com/bijux/bijux-ro-crate-node/pull/20) — WebKit native file access

- Await native file permission before upload; preserve refusal and pending-permission
  controls in the development-only patch.

### [#18](https://github.com/bijux/bijux-ro-crate-node/pull/18) — Context keys and parser completion

- Preserve own JSON-LD keys such as `hasOwnProperty` and `__proto__` through model and
  RDF processing.
- Match ordered root propagation, overrides, resets, imported contexts, scalar-graph
  completion and invalid context-array diagnostics.
- Apply an exact-version parser patch during workspace installation and bundle the
  corrected parser into distributed validators and workers.

### [#17](https://github.com/bijux/bijux-ro-crate-node/pull/17) — Editors and selected files

- Keep pending editor reads tied to the selected files across validation and replacement
  selections.
- Expose `CrateWorkspace.resolveFile` as a confined lookup without content reads; select
  declared manifests with relative aliases or nonstandard extensions.
- Reset native picker values so selecting the same files or folder again restores disk
  content instead of retaining draft overlays.

### [#16](https://github.com/bijux/bijux-ro-crate-node/pull/16) — Session inputs and timer bounds

- Copy native ArrayBuffer bytes and Blob storage without trusting caller-defined
  subclass methods, accessors or readers.
- Reject unsupported debounce and timeout ranges before platform delay overflow,
  retaining the maximum supported boundary.
- Verify exact handoff ownership in installed consumers and observe actual normalized
  Blob reads so offline guards still reject binary and unrelated payload reads.

### [#15](https://github.com/bijux/bijux-ro-crate-node/pull/15) — Ordered pandas inference

- Preserve pandas conversion order, integer overflow fallback, lexical negative zero and
  missing-value behavior in manifest columns.
- Reserve explicit headers before generating blank-column names, retaining the original
  cell positions.
- Capture independent column and header controls, including reordered inputs,
  neighboring bounds and complete-crate duplicate-path outcomes.

### [#14](https://github.com/bijux/bijux-ro-crate-node/pull/14) — Datatype-aware OWL inference

- Preserve plain-string, explicit typed-string and language-tagged RDF identities
  through inference.
- Generate recognized datatype memberships and parent relationships from the locked OWL
  tables so value restrictions select the required profile targets.
- Let generalized literal facts cooperate with class/property rules internally and adapt
  plain strings for SHACL only after inference.

### [#13](https://github.com/bijux/bijux-ro-crate-node/pull/13) — Numeric, date and URL model coercion

- Match floating-to-integer bounds while retaining arbitrary-precision integer JSON
  tokens.
- Preserve numeric date grammar, year-zero diagnostics, timestamp limits and reference
  error precedence.
- Diagnose URL hosts before ports across IPv6, FTP and opaque schemes, including
  explicit authority checks for browser differences.

### [#12](https://github.com/bijux/bijux-ro-crate-node/pull/12) — RDF collections and exact literals

- Preserve partial RDF collection traversal and first-arc insertion order, and reject
  ambiguous collection cells before inference.
- Retain exact integer and decimal RDF term identity without numeric key collisions.
- Adopt the reviewed Python collection correction as a provisional reference, with
  source provenance, attribution and independent regression coverage.

### [#11](https://github.com/bijux/bijux-ro-crate-node/pull/11) — Installed runtime qualification

- Verify installed Python dependency contents against wheel records before reference
  capture.
- Run the complete installed corpus independently on both supported Node versions.

### [#10](https://github.com/bijux/bijux-ro-crate-node/pull/10) — Confined references and ontology entailment

- Resolve manifest references only through selected directories and include the pinned
  ontology/schema entailments in profile validation.
- Distinguish completed parser rejection from interrupted Python validation groups and
  verify exact oracle input bytes before accepting comparisons.
- Identify coercion probes by stable input values and retain their independent reference
  captures.

### [#9](https://github.com/bijux/bijux-ro-crate-node/pull/9) — Parser completion and Python coercion

- Preserve reference parser completion for malformed JSON-LD graph members.
- Materialize cooperating ontology rules before required profile checks, with separate
  class, property and identity rule owners.
- Match Python integer bounds and Unicode coercion, date/timezone diagnostics and
  non-finite metadata constants, retaining independent semantic captures and
  attribution.

### [#8](https://github.com/bijux/bijux-ro-crate-node/pull/8) — Bounded inference and governed qualification

- Bound inferred quads and property paths before allocation, including single-property
  chains; return incomplete when expansion exceeds its budget.
- Record actual runtime and imported-module identities separately in source/live and
  installed/snapshot qualification reports.
- Consume accepted Node governance, canonical workflow projections, shared checksums and
  Make entrypoints while retaining disabled npm publication.
- Admit standards only from the exact accepted source; reject malformed pins, foreign or
  dirty caches and aliased cache paths before executing their checks.

### [#7](https://github.com/bijux/bijux-ro-crate-node/pull/7) — Package integration and qualification

- Document core/validator ownership, immutable inputs, completion outcomes, Worker
  hosting, exact-byte continuation and package extension contracts.
- Serve the accessible local repair example through a shared loopback HTTP host.
- Discover owned package directories and build in dependency order, retaining the public
  package boundaries.
- Add manual archive qualification with source, tree, lock and archive receipts,
  installed consumers and declaration checks; document release prerequisites and
  measured compatibility limits.

### [#6](https://github.com/bijux/bijux-ro-crate-node/pull/6) — Isolated package consumers

- Build dependency-ordered package archives with public export allowlists and
  attribution for bundled dependencies.
- Install archives into isolated core-only and validator consumers; verify actual
  dependency resolution and separate Node-only and DOM-only TypeScript declarations.
- Run complete reference comparisons through installed Node 22/24 validators and
  packaged workers in all three browser engines, including native and bundled consumers.
- Strengthen diagnostic schema validation and exact Unicode multiset comparison,
  preserve concurrent snapshot isolation and retain parser and CLI failure semantics.
- Exercise real worker cancellation, race barriers, edit latency and large-manifest
  workloads with bounded test deadlines.
- Keep behavior tests with their owning packages and pack locked type dependencies so
  clean consumers do not require a warm registry metadata cache.

### [#5](https://github.com/bijux/bijux-ro-crate-node/pull/5) — Live browser validation

- Add Worker validation sessions with immutable revisions, debounced edits, cancellation
  and deadlines; require their exact files and options for continuation.
- Terminate superseded work, reject stale or malformed replies and make revision
  notifications atomic under reentrant subscribers.
- Provide metadata and manifest editors, repair overlays, readable reports and
  revalidation of drafts restored by page events.
- Exercise actual workers in Chromium, Firefox and WebKit, including failure, disposal,
  option changes, keyboard repair and exact-byte handoff.
- Check offline resource loading and lazy payload reads, public declarations and bounded
  browser setup.

### [#4](https://github.com/bijux/bijux-ro-crate-node/pull/4) — Complete crate outcomes

- Compose metadata, profile, manifest and connectivity checks into valid, invalid or
  incomplete crate outcomes.
- Parse quoted TSV records and chunk boundaries, reproduce pandas value inference and
  integer precision, and validate declared schemas and typed references.
- Track cross-file connectivity and preserve tolerant decoding of escaped manifest
  filenames, including malformed escapes, replacement UTF-8 and encoded BOMs.
- Protect validation from caller input mutations and keep public Node input declarations
  independent of browser globals; require complete live Python comparisons in CI.

### [#3](https://github.com/bijux/bijux-ro-crate-node/pull/3) — BIA metadata and profile validation

- Generate model descriptors from the Python registry and reproduce BIA field validation
  while retaining arbitrary-precision JSON integers.
- Validate local contexts, BIA type interpretation and RDF reference identities through
  trusted bundled resources.
- Apply required RO-Crate profile constraints and finite declared property inference
  before reporting findings.
- Keep BIA behavior in the validator package, with separate owners for model validation,
  RDF construction, references, profile format and SHACL orchestration.
- Retain independent model, metadata and reference probes; preserve raw captures
  alongside the demonstrated RDF type-set ordering normalization.

### [#2](https://github.com/bijux/bijux-ro-crate-node/pull/2) — Independent Python oracle

- Prepare an isolated Python checkout with exact locked dependencies, source checks and
  an inventory of upstream fixtures and model probes.
- Capture complete reports, completion status and nested exceptions independently of
  JavaScript.
- Compare complete diagnostic multisets, retaining duplicates and rejecting missing
  cases, malformed reports and meaningful completion drift.
- Confine oracle writes, preserve modified checkouts, verify cold preparation and remove
  only capture-machine paths from committed expectations; require reference checks on
  pull requests.

### [#1](https://github.com/bijux/bijux-ro-crate-node/pull/1) — Reusable crate core

- Establish separate core and validator packages, a private workspace root and
  dependency-ordered builds and checks.
- Own confined crate paths, lazy file access and immutable input snapshots in core; copy
  Buffer bytes and reject unsupported mutable inputs and empty directory-entry names.
- Provide trusted offline resource loading and complete diagnostic report multisets
  through public core exports.
- Record Python source provenance and package adoption boundaries, and check both
  supported Node runtimes in CI.
