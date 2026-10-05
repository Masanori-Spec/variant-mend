# Research and practical difference

Research checked 2026-10-05. All included USDA fixtures are original synthetic test data.

## Existing tools

- [OpenUSD NamespaceEditor](https://openusd.org/release/user_guides/namespace_editing.html) supports much broader namespace edits and composition than this app. Its documented dependency-discovery limits include unselected variants. Use it for broad USD work.
- [Houdini Restructure Scene Graph](https://www.sidefx.com/docs/houdini/nodes/lop/restructurescenegraph.html) provides scene restructuring through Sdf APIs; the documentation describes layer flattening and restrictions around reference/payload content. It is an integrated DCC workflow rather than this small single-layer review surface.
- A custom Sdf script can implement a team's exact pipeline needs. This app offers an auditable narrow UI and independent checks instead of claiming to replace that option.

## Verified gap, limited claim

The original fixture contains `/Product/Old`, its child `Cap`, literal `weight = 2`, and sibling `/Product/OldSpare` with weight 99. The string and comment mentioning `/Product/Old` are inert. `finish` has default A and variants A/B, each with a relationship and attribute connection.

With official usd-core 26.8, native NamespaceEditor reports the move from Old to Handle as applicable and applies it, but its variant-authored paths retain the old prefix. Our negative control records native warnings and four dangling references. This observation is version- and fixture-specific; a future OpenUSD version may fix it, and the test should then be reviewed rather than preserving a stale claim.

The independently expected repair and the application export both open through the native USD engine. In A and B, expected relationship objects exist, connections resolve to the source attribute with value 2, the sibling remains 99, and the hierarchy, variant names, default A, comment and string remain intact.

This is native composition-engine verification, not viewport or rendered-image verification. The app's browser runtime never contains the USD SDK.

## Decision

A useful portfolio-sized deliverable is a bounded all-variant path audit plus exact source repair and evidence, not a general namespace-editing invention. The grammar and coverage caps are product boundaries. Unknown composition/path-bearing syntax must stop export.

## Package and licensing source

The [official usd-core 26.8 package](https://pypi.org/project/usd-core/26.8/) supplies native USD core libraries without imaging. Its pinned upstream [TOST-1.0 license](https://github.com/PixarAnimationStudios/OpenUSD/blob/v26.08/LICENSE.txt) is a modified Apache-style license with different trademark terms. No SDK code, binaries, headers, wheels, upstream examples, or license text are copied into this repository or app.
