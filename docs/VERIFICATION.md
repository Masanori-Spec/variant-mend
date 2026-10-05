# Verification status

## Completed locally

- 102 core/CLI behavior and rejection tests: see `artifacts/unit-test.log`
- Independent oracle: 12 exact-edit cases plus 9 deliberate corruption rejections; see `artifacts/oracle-report.json`
- Native USD: official usd-core 26.8, `Usd.GetVersion() == (0, 26, 8)`
- Native-valid independent matrix: 24 source/expected texts across 56 composed selections
- Actual CLI export: both A and B targets and connections resolve, source value 2; preserved OldSpare 99, variant/default metadata, inert string/comment and hierarchy
- Native NamespaceEditor negative control: four dangling references and captured native warning text, pinned to this version and fixture
- Offline single-file build generated deterministically

Local execution environment: Debian 13, Node 24, Python 3.12. These are command-line and native USD checks, not a local browser pass.

## Hosted gate authored, not yet run

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
