# VariantMend

**名前を変えても、参照をつなぐ。** A deliberately bounded USDA rename workbench.

Rename one non-root prim within its parent, review relationship targets and attribute connections across every supported flat-variant combination, and export the repaired text with a hash-bound receipt. Original JavaScript runtime; no USD SDK, server, account, uploads, fonts, or network calls in the app.

## Why this exists

A composed-stage edit can miss dependencies hidden in variants. OpenUSD documents this limitation in its [namespace-editing guide](https://openusd.org/release/user_guides/namespace_editing.html). On our own single-file fixture with pinned usd-core 26.8, NamespaceEditor successfully renamed the prim while leaving four dangling variant-authored targets/connections. VariantMend's exact-span export passes native checks for both fixture variants.

This is a narrow handoff aid, not a replacement for OpenUSD NamespaceEditor, Houdini, or a custom Sdf script. General prim renaming is not new. The useful difference is a reviewable inventory of all supported branches, untouched-byte preservation, and reproducible consumer checks. See [research and alternatives](docs/RESEARCH.md).

## Open it

Open `dist/variant-mend.html` in a current desktop browser. This single file works offline. Or serve the repository with `python -m http.server 4173` and open `http://localhost:4173`.

1. Open one UTF-8 `.usda` file, or use the original synthetic sample
2. Select an existing non-root base prim path and a new sibling name
3. Review the exact edits, variant coverage, lookalike paths and inert text
4. Download `repaired.usda`, `rename-receipt.json`, and `variant-coverage.json`

Receipt offsets are half-open UTF-16 source code-unit spans; hashes cover the exact UTF-8 bytes. Editing the source or request invalidates the review. A saved receipt can only be replayed against the identical original bytes; stale, tampered, and already-applied receipts are rejected. Receipt import does not overwrite the source editor.

日本語 / English can be switched without losing the current review. File content remains on the device. This is a source/path workbench; it does not render a 3D scene.

## Supported profile

- One UTF-8 text layer, no BOM, beginning `#usda 1.0`; input and repaired output each up to 1 MiB; receipts up to 2 MiB
- `def` prim declarations using ordinary ASCII identifier names (an optional type begins with an uppercase ASCII letter); target declared exactly once outside variants; same-parent, non-root rename; names up to 64 ASCII characters
- Flat variant sets with explicit declarations and default selections; up to 8 sets, 16 branches each, 32 Cartesian combinations total
- Scalar and array `double`, `float` (finite float32), `int` (32-bit), `bool`, `string`, `token` attributes with literal values
- Explicit absolute relationship targets and attribute `.connect` paths, either one path or a list; ordinary namespaced property names supported
- Prim metadata only `variantSets` and `variants`; layer metadata only `defaultPrim`
- Double-quoted single-line strings with `\"`, `\\`, `\n`, `\r`, `\t` escapes; comments; ASCII space/tab and LF/CRLF/CR line endings
- Required native-style statement newlines; declaration words and assignments stay on one line with horizontal whitespace (multiline list contents are allowed); maximum 24 prim nesting levels, 2,048 prim specs, 60,000 tokens

Property kind, type, array shape and variability must be consistent across all opinions, even mutually exclusive variants. Explicit `varying` and relationship qualifiers are rejected.

The checker is conservative: every authored path active in each selection must resolve to a declared active prim or literal-value attribute in this profile. Even a weaker authored path that would be overridden later must pass. This is structural coverage, not a general USD composition engine or schema validator. Validate custom exports in the native consumer you use.

## Fail-closed exclusions

USDC/USDZ; external references, payloads, sublayers, relocates, inherits/specializes; assets and variable expressions; `over`/`class`; instances/prototypes; nested variants; relative/variant-qualified/unknown path syntax; reparenting, root rename, deletion; unknown metadata, property types, time samples, list operations; triple-quoted strings, semicolon statement syntax, non-ASCII identifiers. A valid USD file outside this profile is intentionally rejected.

## Reproducible checks

Node 22+ and Python 3.12 are used in CI. Runtime has no dependencies. Playwright is test-only.

```sh
npm ci --ignore-scripts
npm test
python tests/oracle.py --report artifacts/oracle-report.json
npm run build
node scripts/cli.mjs fixtures/product.usda /Product/Old Handle artifacts/repaired.usda artifacts/rename-receipt.json
python -m pip install usd-core==26.8
python tests/native_verify.py --report artifacts/native-report.json
```

The native SDK is fetched only for tests; it is not shipped. Its license is TOST-1.0, not unmodified Apache-2.0. See [dependency/distribution boundaries](docs/DISTRIBUTION.md).

The authored Ubuntu 22.04 browser job runs sandboxed Chrome, downloads the actual three exported artifacts, applies the independent Python oracle and native USD verifier to those downloaded bytes, captures Japanese/English desktop/mobile screenshots and a print PDF, and checks interrupted, repeated, rejected and offline flows. A configured job is not evidence that it ran; see the precise status in [verification](docs/VERIFICATION.md).

## Files

- `src/core.mjs`: scoped tokenizer, structural parser, span plan, hashes and receipt replay
- `src/app.mjs`, `src/style.css`: JA/EN workbench
- `fixtures/product.usda`: original synthetic input
- `tests/core.test.mjs`: behavior and rejection tests
- `tests/oracle.py`: independently authored literal edit expectations and unchanged-byte oracle
- `tests/native_verify.py`: pinned native baseline, actual export and NamespaceEditor negative control
- `tests/browser.mjs`: actual UI download, responsive, offline and interruption checks
- `scripts/freeze.py`: explicit distribution allowlist, deterministic ZIP and SHA-256 manifest

No visual-render, general scene-equivalence, broad USD support, novelty or production-readiness claim is made.
