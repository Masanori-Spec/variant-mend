# Distribution boundary

Runtime: original HTML, CSS and JavaScript only. No third-party browser runtime dependencies, assets, fonts, images, source snippets or SDKs are bundled.

Test dependencies:
- Playwright 1.62.1, fetched from the official npm registry during CI; browser executable provided by the hosted runner
- usd-core 26.8, fetched from official PyPI during native tests, TOST-1.0
- Node, Python and the runner's Chrome/Poppler are test tools, not redistributed parts of this app

The explicit freeze allowlist includes only app source, built standalone app, original fixtures, original test scripts, documentation, workflow configuration, package metadata and selected generated text evidence. It excludes `node_modules`, `.git`, caches, Python environments, downloaded wheels, `pxr`, `usd_core.libs`, upstream examples, credentials, private files, and arbitrary workspace content.

`package.json` uses `UNLICENSED`: no new public software license is granted by this build. Publishing and choosing licensing are separate from preparation of this private source bundle.

Frozen manifest entries record UTF-8-safe paths, byte counts and SHA-256 of exact files. The freeze script creates a deterministic ZIP using only those entries. Generated screenshots/browser artifacts are workflow evidence and must be reviewed before release; the manifest is not a claim that hosted tests passed.
