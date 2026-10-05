# Verification status

## Completed hosted verification

The [complete verification run](https://github.com/Masanori-Spec/variant-mend/actions/runs/37293595284) passed all three jobs for commit `173ccc510725f9cdc0dc331e933371f2d91b65de` on 2026-10-05:

- `core-oracle`: all **112** core, CLI, test-runner and standalone-build tests; independent byte oracle; rebuilt offline app
- `native-consumer`: actual CLI export opened and checked by pinned official usd-core 26.8
- `browser-download-consumer`: **34** sandboxed Chrome checks, followed by independent byte and native USD checks on the actual browser-downloaded files

Hosted environment: Ubuntu 22.04, Chrome 154.0.8037.57, Node 22.23.3, Python 3.12. The browser sandbox and app Content Security Policy remain enabled. Ubuntu Noto CJK fonts are installed only as a test dependency; no fonts are distributed with the app.

### Actual browser and offline results

- Japanese/English workbench, source import, review, reset, blocked cases and language switching passed
- Keyboard-operated source and receipt pickers and visible focus passed
- Edited-source invalidation, rapid request changes, stale/repeated receipts, invalid UTF-8/BOM and binary-file rejection passed
- The browser downloaded `repaired.usda`, `rename-receipt.json` and `variant-coverage.json`; the downstream oracle verified exact expected bytes, hashes and edit positions
- The downloaded USDA opened through native USD for variants A and B. Relationships and connections resolved to the expected objects, connection source value remained 2, and OldSpare remained 99
- True `file://` startup of the self-contained app passed. Its offline download was byte-identical to the HTTP-served app's download; no network access was required
- Receipt replay and keyboard-driven receipt replay produced the same repaired bytes
- Japanese and English 320-pixel diagnostics each reported document width 320 and no overflowing elements; 390-pixel mobile and desktop checks also passed
- The browser reported zero JavaScript runtime errors

SHA-256 of the browser download, offline download, receipt replay and keyboard replay:

`64f046d0109a8bad6cdb902d3d0937517f54043b4547908fa2f932b3b4eb5f78`

Japanese/English desktop, 390-pixel and 320-pixel screenshots, blocked-state evidence and the rendered two-page print report were reviewed. Japanese glyphs render correctly, content is not clipped or overlapping, and print output has white paper with 12 mm margins. The second print page deliberately contains scope and verification limits.

This is browser UI, exact-byte and native composition-engine verification of the supported fixtures. No rendered USD scene, general USD composition, shader/dataflow evaluation, or arbitrary-scene equivalence is claimed. Custom exports should still be checked in the consumer used by the recipient.

## Local and independent checks

- 112 behavior/rejection/build tests: `artifacts/unit-test.log`
- Independent oracle: 12 exact-edit cases plus 9 deliberate corruption rejections; `artifacts/oracle-report.json`
- Official usd-core 26.8: `Usd.GetVersion() == (0, 26, 8)`
- Native-valid independent matrix: 24 source/expected texts across 56 composed selections
- Actual CLI export: expected A/B targets and connections; preserved source value 2, OldSpare 99, variant/default metadata, inert string/comment and hierarchy
- Native NamespaceEditor negative control: four dangling references and captured warnings, limited to this pinned version and original fixture
- Standalone module syntax, literal-dollar preservation, script-terminator escaping, Content Security Policy retention and deterministic packaging

Local environment: Debian 13, Node 24 and Python 3.12. Local results are command-line/native checks; the browser results above came from the authorized hosted Ubuntu runner.

## Findings repaired before the successful run

The initial upload omitted the core test suite and the first browser run failed at 320-pixel width. Required-suite preflight now rejects missing or empty test files, all source files were restored and parity-checked, and export buttons stack on narrow screens. Hosted Japanese glyphs required a test-only CJK font installation. Print margins/background and receipt-status relocalization were corrected and visually rechecked.

A subsequent run exposed invalid standalone JavaScript: replacement-string interpretation changed the selector helper `$$` into `$`. Literal replacement callbacks now preserve the embedded source, and the exact generated module is syntax-checked before writing. Dedicated regressions cover dollar sequences, closing script text, missing placeholders, malformed modules and the actual app bundle. The successful run then exercised real `file://` startup and its actual download.

## Oracle independence

`tests/oracle.py` does not import the app tokenizer or transform. Expected product spans are handwritten literals, with independently controlled line-ending, Unicode, comment, whitespace and multiple-set variations. Every unchanged UTF-8 byte range is compared. Expected receipt hashes, kinds, contexts, offsets and substitutions are checked. Deliberate corruptions demonstrate that altered evidence is rejected.

The native verifier separately opens source and output through pxr. Variant selection is authored only in the session layer, so verification cannot silently change the original default or input file. Negative-control warnings are captured from a subprocess. Native behavior is version-specific and must be rechecked when the pinned SDK changes.
