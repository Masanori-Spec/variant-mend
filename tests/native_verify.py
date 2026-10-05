#!/usr/bin/env python3
"""Pinned OpenUSD verification of the actual exported Product USDA file.

Install the official test-only dependency with `pip install usd-core==26.8`, then:
  python tests/native_verify.py --output artifacts/repaired.usda \
      --receipt artifacts/rename-receipt.json --report artifacts/native-report.json

The application does not import, redistribute, or depend on this SDK. This is a
separate native integration check, not a claim that the bounded runtime is a full
USD validator. A negative NamespaceEditor control is run in its own subprocess so
native C++ warnings can be captured faithfully without changing process stderr.
"""
from __future__ import annotations

import argparse
import json
from itertools import product as cartesian_product
from pathlib import Path
import subprocess
import sys
from typing import Any

from oracle import ROOT, SOURCE, PRODUCT_EDITS, Case, cases, digest, verify_files

PINNED_VERSION = (0, 26, 8)


def sdk():
    try:
        from pxr import Sdf, Usd
    except ImportError as error:
        raise RuntimeError("The native test requires the official usd-core==26.8 test dependency") from error
    version = tuple(Usd.GetVersion())
    assert version == PINNED_VERSION, f"Expected OpenUSD {PINNED_VERSION}; found {version}"
    return Sdf, Usd


def inspect_variants(stage: Any, renamed: bool) -> list[dict[str, Any]]:
    product = stage.GetPrimAtPath("/Product")
    assert product and product.GetTypeName() == "Xform"
    variant_set = product.GetVariantSet("finish")
    assert variant_set.GetVariantNames() == ["A", "B"]
    assert product.GetVariantSets().GetNames() == ["finish"]
    assert variant_set.GetVariantSelection() == "A", "Authored default variant must stay A"
    layer_before = stage.GetRootLayer().ExportToString()
    # Use only the session layer for verification selections. Never mutate input files.
    stage.SetEditTarget(stage.GetSessionLayer())
    prefix = "/Product/Handle" if renamed else "/Product/Old"
    expected_targets = {
        "A": [prefix],
        "B": [prefix + "/Cap", "/Product/OldSpare"],
    }
    results = []
    for selection in ("A", "B"):
        assert variant_set.SetVariantSelection(selection)
        assert variant_set.GetVariantSelection() == selection
        targets = [str(p) for p in product.GetRelationship("accessory").GetTargets()]
        connections = [str(p) for p in product.GetAttribute("signal").GetConnections()]
        assert targets == expected_targets[selection], (selection, targets)
        assert connections == [prefix + ".weight"], (selection, connections)
        resolved_targets = [bool(stage.GetObjectAtPath(path)) for path in targets]
        connection_attributes = [stage.GetAttributeAtPath(path) for path in connections]
        connection_values = [attribute.Get() if attribute else None for attribute in connection_attributes]
        if renamed:
            assert all(resolved_targets), (selection, "Dangling relationship", targets)
            assert all(connection_attributes), (selection, "Dangling connection", connections)
            assert connection_values == [2.0]
        results.append({
            "selection": selection,
            "relationshipTargets": targets,
            "relationshipTargetsResolve": resolved_targets,
            "connectionPaths": connections,
            "connectionTargetsResolve": [bool(attribute) for attribute in connection_attributes],
            "connectionSourceValues": connection_values,
        })
    assert variant_set.SetVariantSelection("A")
    assert stage.GetRootLayer().ExportToString() == layer_before, "Verification modified the root layer"
    return results


def negative_control(source: Path) -> dict[str, Any]:
    """A fresh unmodified native layer, with no repaired text or receipt involved."""
    Sdf, Usd = sdk()
    source_text = source.read_bytes().decode("utf-8")
    assert source_text == SOURCE, "The negative control must use the fixed original fixture"
    layer = Sdf.Layer.CreateAnonymous("negative-control.usda")
    assert layer.ImportFromString(source_text)
    stage = Usd.Stage.Open(layer)
    assert stage and stage.GetPrimAtPath("/Product/Old")
    assert stage.GetPrimAtPath("/Product").GetVariantSet("finish").GetVariantSelection() == "A"
    editor = Usd.NamespaceEditor(stage)
    assert editor.MovePrimAtPath("/Product/Old", "/Product/Handle")
    applicability = editor.CanApplyEdits()
    assert bool(applicability), str(applicability.whyNot)
    assert editor.ApplyEdits()
    assert stage.GetPrimAtPath("/Product/Handle")
    assert not stage.GetPrimAtPath("/Product/Old")
    variants = inspect_variants(stage, renamed=False)
    missing = []
    for variant in variants:
        for path, resolved in zip(variant["relationshipTargets"], variant["relationshipTargetsResolve"]):
            if not resolved:
                missing.append({"selection": variant["selection"], "kind": "relationship", "path": path})
        for path, resolved in zip(variant["connectionPaths"], variant["connectionTargetsResolve"]):
            if not resolved:
                missing.append({"selection": variant["selection"], "kind": "connection", "path": path})
    # The limitation is asserted only against this pinned version and fixture.
    assert missing == [
        {"selection": "A", "kind": "relationship", "path": "/Product/Old"},
        {"selection": "A", "kind": "connection", "path": "/Product/Old.weight"},
        {"selection": "B", "kind": "relationship", "path": "/Product/Old/Cap"},
        {"selection": "B", "kind": "connection", "path": "/Product/Old.weight"},
    ], missing
    return {
        "version": list(Usd.GetVersion()),
        "canApplyEdits": True,
        "applied": True,
        "renamedPrimExists": True,
        "variants": variants,
        "missingTargets": missing,
        "scope": "Observed only for this fixture and pinned OpenUSD 0.26.8",
    }


def verify_oracle_fixture_syntax(Sdf: Any, Usd: Any) -> dict[str, Any]:
    """Check the independent source/expected literals against the native grammar.

    This supplemental check does not stand in for opening the actual user export.
    It ensures that whitespace and quoting oracle cases are meaningful legal USDA.
    """
    checked = []
    for case in cases():
        selection_count = 0
        for label, text in (("source", case.source), ("expected", case.expected)):
            layer = Sdf.Layer.CreateAnonymous(case.name + ".usda")
            assert layer.ImportFromString(text), (case.name, label)
            stage = Usd.Stage.Open(layer)
            assert stage, (case.name, label)
            product = stage.GetPrimAtPath("/Product")
            sets = [product.GetVariantSet(name) for name in product.GetVariantSets().GetNames()]
            names = [variant_set.GetVariantNames() for variant_set in sets]
            stage.SetEditTarget(stage.GetSessionLayer())
            for selection in cartesian_product(*names):
                for variant_set, branch in zip(sets, selection):
                    assert variant_set.SetVariantSelection(branch)
                for prim in stage.Traverse():
                    for relationship in prim.GetRelationships():
                        assert all(stage.GetObjectAtPath(path) for path in relationship.GetTargets()), (
                            case.name, label, selection, str(relationship.GetPath()))
                    for attribute in prim.GetAttributes():
                        assert all(stage.GetAttributeAtPath(path) for path in attribute.GetConnections()), (
                            case.name, label, selection, str(attribute.GetPath()))
                selection_count += 1
        checked.append({"name": case.name, "sourceAndExpectedNativeValid": True,
                        "composedSelectionsChecked": selection_count})
    return {"status": "passed", "caseCount": len(checked), "textCount": len(checked) * 2,
            "cases": checked,
            "scope": "Independent expected-fixture syntax and resolution; actual export checked separately"}


def verify_export(source: Path, output: Path, receipt: Path) -> dict[str, Any]:
    Sdf, Usd = sdk()
    source_bytes = source.read_bytes()
    output_bytes = output.read_bytes()
    receipt_bytes = receipt.read_bytes()
    assert source_bytes == SOURCE.encode("utf-8"), "Native verifier expects the fixed Product fixture"
    expected = Case("product-literal", SOURCE, PRODUCT_EDITS).expected.encode("utf-8")
    assert output_bytes == expected, "Actual exported file differs from independently expected bytes"
    byte_receipt = verify_files(source, output, receipt)
    # Open the actual exported path, not a string produced by our expected-result oracle.
    stage = Usd.Stage.Open(str(output.resolve()))
    assert stage, "OpenUSD could not open the exported file"
    assert stage.GetRootLayer().realPath == str(output.resolve())
    assert [str(prim.GetPath()) for prim in stage.GetPseudoRoot().GetChildren()] == ["/Product"]
    assert str(stage.GetDefaultPrim().GetPath()) == "/Product"
    product = stage.GetPrimAtPath("/Product")
    assert [prim.GetName() for prim in product.GetChildren()] == ["Handle", "OldSpare"]
    handle = stage.GetPrimAtPath("/Product/Handle")
    assert handle and handle.GetTypeName() == "Scope"
    assert [prim.GetName() for prim in handle.GetChildren()] == ["Cap"]
    assert stage.GetPrimAtPath("/Product/Handle/Cap").GetTypeName() == "Scope"
    assert not stage.GetPrimAtPath("/Product/Old")
    assert handle.GetAttribute("weight").Get() == 2.0
    assert stage.GetPrimAtPath("/Product/OldSpare").GetAttribute("weight").Get() == 99.0
    assert product.GetAttribute("note").Get() == "/Product/Old"
    assert b' custom string note = "/Product/Old"\n' in output_bytes
    assert b' # Keep this note: /Product/Old\n' in output_bytes
    variants = inspect_variants(stage, renamed=True)
    control_process = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), "--control-worker", "--source", str(source.resolve())],
        capture_output=True, text=True, cwd=ROOT,
    )
    assert control_process.returncode == 0, (
        "Native negative control failed\n" + control_process.stdout + "\n" + control_process.stderr)
    control = json.loads(control_process.stdout)
    control["warnings"] = control_process.stderr.strip()
    assert "namespace edit" in control["warnings"].lower(), "Native control did not emit its expected warning"
    assert "targetPaths" in control["warnings"] and "connectionPaths" in control["warnings"]
    assert source.read_bytes() == source_bytes, "Native verifier modified the source file"
    assert output.read_bytes() == output_bytes, "Native verifier modified the exported file"
    assert receipt.read_bytes() == receipt_bytes, "Native verifier modified the receipt"
    return {
        "schema": "variant-mend-native/1",
        "status": "passed",
        "sdk": {"package": "usd-core", "packageVersion": "26.8", "usdVersion": list(Usd.GetVersion()),
                "testOnly": True},
        "inputHash": digest(source_bytes),
        "outputHash": digest(output_bytes),
        "openedActualExport": str(output),
        "independentByteOracle": byte_receipt,
        "oracleFixturesNativeSyntax": verify_oracle_fixture_syntax(Sdf, Usd),
        "defaultPrim": "/Product",
        "authoredDefaultVariant": "A",
        "hierarchyPreserved": True,
        "inertStringAndCommentPreserved": True,
        "oldSpareValue": 99.0,
        "variants": variants,
        "negativeNamespaceEditorControl": control,
        "limitations": [
            "This verifies the supplied bounded single-layer fixture, not arbitrary USDA or all USD composition",
            "Connection source attributes resolve to 2; this is not shader or dataflow evaluation",
            "The negative native result is version- and fixture-specific",
        ],
        "sources": [
            "https://openusd.org/release/user_guides/namespace_editing.html",
            "https://pypi.org/project/usd-core/",
            "https://github.com/PixarAnimationStudios/OpenUSD/blob/v26.08/LICENSE.txt",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "fixtures/product.usda")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/repaired.usda")
    parser.add_argument("--receipt", type=Path, default=ROOT / "artifacts/rename-receipt.json")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--control-worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    result = negative_control(args.source) if args.control_worker else verify_export(
        args.source, args.output, args.receipt)
    rendered = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, RuntimeError, KeyError, ValueError, OSError) as error:
        print(f"Native verification failed: {error}", file=sys.stderr)
        sys.exit(1)
