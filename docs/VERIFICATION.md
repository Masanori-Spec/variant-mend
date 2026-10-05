# Verification status

## Completed locally

- 112 core/CLI/test-runner/build behavior and rejection tests: see `artifacts/unit-test.log`
- Independent oracle: 12 exact-edit cases plus 9 deliberate corruption rejections; see `artifacts/oracle-report.json`
- Native USD: official usd-core 26.8, `Usd.GetVersion() == (0, 26, 8)`
- Native-valid independent matrix: 24 source/expected texts across 56 composed selections
- Actual CLI export: both A and B targets and connections resolve, source value 2; preserved OldSpare 99, variant/default metadata, inert string/comment and hierarchy
- Native NamespaceEditor negative control: four dangling references and captured native warning text, pinned to this version and fixture
- Offline single-file build generated deterministically

Local execution environment: Debian 13, Node 24, Python 3.12. These are command-line and native USD checks, not a local browser pass.

## Hosted gate: offline correction pending

The first hosted run passed 28 UI checks, including actual downloads and both 390-pixel mobile layouts, then failed the 320-pixel overflow check. Japanese screenshots also revealed missing CJK fonts on the runner. Narrow-screen stacking, test-only Noto CJK installation, 320-pixel layout diagnostics, receipt-status relocalization, and a deliberate two-page print layout with white paper and 12 mm margins are authored but still require a passing rerun.

The initial remote upload omitted the core suite; the test command now requires all suite files before launching Node tests, preventing a green partial run.

The corrected hosted run passed 106 unit tests and browser checks through both 320-pixel languages, then failed standalone file startup. The root cause was JavaScript replacement-string processing of `$$` during bundling, producing an invalid inline module. The builder now uses literal callback replacement, checks the exact generated module syntax before writing, and regression-tests replacement-dollar sequences, script terminators, CSP retention and real app bundling. Hosted file startup/download verification remains pending.

The Ubuntu 22.04 workflow must run sandboxed Chrome and complete:

1. Japanese and English desktop/mobile layouts and 320-pixel overflow check
2. Actual browser downloads of repaired USDA, receipt and coverage
3. Independent Python byte oracle and native USD checks against those downloaded files
4. Stale receipt, repeated receipt, edited source, rapid request changes, reset, blocked syntax, invalid encoding, offline artifact and repeated downloads
5. Screenshots plus a print PDF and rendered print pages for human pixel review

The app is not browser-verified until the corresponding workflow and visual review have passed. No rendered USD scene or general scene-equivalence claim is made.

## Oracle independence

`tests/oracle.py` does not import the app tokenizer or transform. Expected product spans are handwritten literals, with independently controlled line-ending, Unicode, comment, whitespace and multiple-set variations. Every unchanged UTF-8 byte range is compared. Expected receipt hashes, kinds, contexts, source offsets and substitutions are checked. Deliberate corruptions prove that the oracle rejects altered evidence.

The native test separately opens source and output through pxr. Variant selection is authored only in the session layer, so verification cannot silently change the original default selection or input file. Negative warnings are captured from a subprocess.
