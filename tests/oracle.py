#!/usr/bin/env python3
"""Independent exact-text oracle. No application modules or tokenizers are imported.

Run the fixture batch: python tests/oracle.py
Check a browser/CLI export:
  python tests/oracle.py --source fixtures/product.usda --output artifacts/repaired.usda \
      --receipt artifacts/receipt.json

All expected changes are independently authored Python literals. UTF-16 coordinates
are translated to Python indices only after validating that they are not inside a
surrogate pair. Exact UTF-8 byte equality also protects comments and line endings.
"""
from __future__ import annotations

import argparse
import copy
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE = '''#usda 1.0
(defaultPrim = "Product")
def Xform "Product" (
 prepend variantSets = "finish"
 variants = { string finish = "A" }
) {
 custom string note = "/Product/Old"
 # Keep this note: /Product/Old
 def Scope "Old" {
  custom double weight = 2
  def Scope "Cap" {}
 }
 def Scope "OldSpare" {
  custom double weight = 99
 }
 variantSet "finish" = {
  "A" {
   rel accessory = </Product/Old>
   custom double signal.connect = </Product/Old.weight>
  }
  "B" {
   rel accessory = [</Product/Old/Cap>, </Product/OldSpare>]
   custom double signal.connect = </Product/Old.weight>
  }
 }
}
'''


@dataclass(frozen=True)
class Edit:
    start: int  # Python scalar-value indices, independent of the JS implementation
    end: int
    before: str
    after: str


# Literal expected spans in SOURCE. Delimiters are deliberately excluded.
PRODUCT_EDITS = (
    Edit(211, 214, "Old", "Handle"),
    Edit(377, 389, "/Product/Old", "/Product/Handle"),
    Edit(426, 445, "/Product/Old.weight", "/Product/Handle.weight"),
    Edit(480, 496, "/Product/Old/Cap", "/Product/Handle/Cap"),
    Edit(555, 574, "/Product/Old.weight", "/Product/Handle.weight"),
)


@dataclass(frozen=True)
class Case:
    name: str
    source: str
    edits: tuple[Edit, ...]
    old_path: str = "/Product/Old"
    new_name: str = "Handle"
    # Expected kinds and branch memberships are literals, not discovered by parsing.
    metadata: tuple = (
        ("declaration", ()),
        ("relationship", (("/Product:finish", "A"),)),
        ("connection", (("/Product:finish", "A"),)),
        ("relationship", (("/Product:finish", "B"),)),
        ("connection", (("/Product:finish", "B"),)),
    )

    @property
    def expected(self) -> str:
        return apply_expected(self.source, self.edits)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def apply_expected(source: str, edits: tuple[Edit, ...]) -> str:
    parts: list[str] = []
    cursor = 0
    for edit in edits:
        assert cursor <= edit.start < edit.end <= len(source)
        assert source[edit.start:edit.end] == edit.before, (edit, source[edit.start:edit.end])
        parts.extend((source[cursor:edit.start], edit.after))
        cursor = edit.end
    parts.append(source[cursor:])
    return "".join(parts)


def utf16_len(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def scalar_index(text: str, offset: int) -> int:
    assert type(offset) is int and offset >= 0, "Receipt offsets must be nonnegative integers"
    consumed = 0
    for index, char in enumerate(text):
        if consumed == offset:
            return index
        consumed += 2 if ord(char) > 0xFFFF else 1
        assert consumed <= offset, "Receipt offset splits a UTF-16 surrogate pair"
    assert consumed == offset, "Receipt offset is outside the source"
    return len(text)


def verify_receipt(case: Case, output_bytes: bytes, receipt: dict[str, Any]) -> dict[str, Any]:
    """Verify a receipt against literal expectations, not against app predictions."""
    source = case.source
    source_bytes = source.encode("utf-8")
    expected_bytes = case.expected.encode("utf-8")
    assert output_bytes == expected_bytes, f"{case.name}: exported bytes differ from the literal oracle"
    assert receipt["schema"] == "variant-mend/1", "Unexpected receipt schema"
    assert receipt["sourceHash"] == digest(source_bytes), "Receipt source hash is wrong"
    assert receipt["outputHash"] == digest(output_bytes), "Receipt output hash is wrong"
    assert receipt["oldPath"] == case.old_path
    new_path = case.old_path.rsplit("/", 1)[0] + "/" + case.new_name
    assert receipt["newPath"] == new_path
    actual = receipt["edits"]
    assert isinstance(actual, list) and len(actual) == len(case.edits), "Unexpected edit count"
    assert len(case.metadata) == len(case.edits), "Oracle metadata fixture is incomplete"
    cursor = 0
    rebuilt: list[str] = []
    unchanged_bytes = 0
    for index, (actual_edit, expected) in enumerate(zip(actual, case.edits)):
        assert isinstance(actual_edit, dict), f"Edit {index} is not an object"
        start = scalar_index(source, actual_edit["start"])
        end = scalar_index(source, actual_edit["end"])
        assert (start, end) == (expected.start, expected.end), f"Edit {index} does not match literal span"
        assert cursor <= start < end, "Overlapping, empty, or unordered edits"
        assert actual_edit["before"] == expected.before == source[start:end]
        assert actual_edit["after"] == expected.after
        expected_kind, expected_context = case.metadata[index]
        assert actual_edit.get("kind") == expected_kind, f"Edit {index} has wrong kind"
        assert actual_edit.get("context") == dict(expected_context), f"Edit {index} has wrong branch context"
        untouched = source[cursor:start]
        rebuilt.extend((untouched, actual_edit["after"]))
        unchanged_bytes += len(untouched.encode("utf-8"))
        cursor = end
    tail = source[cursor:]
    rebuilt.append(tail)
    unchanged_bytes += len(tail.encode("utf-8"))
    assert "".join(rebuilt).encode("utf-8") == output_bytes, "Receipt cannot reconstruct output"
    # Compare each untouched interval at its shifted destination byte offset.
    source_cursor = output_cursor = 0
    for edit in case.edits:
        untouched = source[source_cursor:edit.start].encode("utf-8")
        assert output_bytes[output_cursor:output_cursor + len(untouched)] == untouched
        output_cursor += len(untouched) + len(edit.after.encode("utf-8"))
        source_cursor = edit.end
    assert output_bytes[output_cursor:] == source[source_cursor:].encode("utf-8")
    return {
        "name": case.name,
        "status": "passed",
        "editCount": len(actual),
        "unchangedBytes": unchanged_bytes,
        "sourceHash": digest(source_bytes),
        "outputHash": digest(output_bytes),
        "exactOutputBytes": True,
        "literalSpans": True,
        "utf16Offsets": True,
        "kindsAndContexts": True,
    }


def marked_case(name: str, parts: list[str | tuple[str, str]], **kwargs: Any) -> Case:
    """Assemble independently marked literals, never locate changes with app logic."""
    chunks: list[str] = []
    edits: list[Edit] = []
    cursor = 0
    for part in parts:
        if isinstance(part, tuple):
            before, after = part
            edits.append(Edit(cursor, cursor + len(before), before, after))
            chunks.append(before)
            cursor += len(before)
        else:
            chunks.append(part)
            cursor += len(part)
    return Case(name, "".join(chunks), tuple(edits), **kwargs)


def transformed_case(name: str, original: Case, transform) -> Case:
    """Translate existing literal span coordinates for a uniform text transform."""
    source = transform(original.source)
    edits = tuple(Edit(len(transform(original.source[:e.start])),
                       len(transform(original.source[:e.end])),
                       transform(e.before), transform(e.after)) for e in original.edits)
    return Case(name, source, edits, original.old_path, original.new_name, original.metadata)


def cases() -> list[Case]:
    base = Case("product-literal", SOURCE, PRODUCT_EDITS)
    crlf = transformed_case("crlf-preservation", base, lambda s: s.replace("\n", "\r\n"))
    # Emoji consumes two UTF-16 code units; Japanese letters consume one each.
    prefix = '#usda 1.0\n# 😀 日本語 /Product/Old remains inert\n'
    body = SOURCE[len("#usda 1.0\n"):]
    shift = len(prefix) - len("#usda 1.0\n")
    unicode_case = Case("unicode-offsets", prefix + body, tuple(
        Edit(e.start + shift, e.end + shift, e.before, e.after) for e in PRODUCT_EDITS))
    boundaries = marked_case("multiple-sets-escaped-strings-boundaries", [
        '#usda 1.0\n(defaultPrim = "Product")\ndef Xform "Product" (\n'
        ' prepend variantSets = ["finish", "shape"]\n'
        ' variants = {\n  string finish = "A"\n  string shape = "round"\n }\n) {\n'
        ' custom string note = "😀 escaped \\" quote /Product/Old </Product/Old>"\n'
        ' # </Product/Old> must remain in this comment\n'
        ' def Scope "', ("Old", "Handle"), '" {\n  custom double weight = 2\n'
        '  def Scope "Cap" {}\n }\n'
        ' def Scope "OldSpare" {\n  custom double weight = 99\n }\n'
        ' def Scope "Other" {\n  def Scope "Old" {}\n }\n'
        ' variantSet "finish" = {\n  "A" {\n   rel accessory = [<',
        ("/Product/Old", "/Product/Handle"), '>, </Product/OldSpare>, </Product/Other/Old>]\n'
        '   custom double signal.connect = <',
        ("/Product/Old.weight", "/Product/Handle.weight"), '>\n  }\n'
        '  "B" {\n   rel accessory = <', ("/Product/Old/Cap", "/Product/Handle/Cap"), '>\n  }\n }\n'
        ' variantSet "shape" = {\n  "round" {\n   rel second = <',
        ("/Product/Old", "/Product/Handle"), '>\n  }\n'
        '  "square" {\n   custom double value.connect = [<',
        ("/Product/Old.weight", "/Product/Handle.weight"), '>, </Product/OldSpare.weight>]\n'
        '  }\n }\n}\n',
    ], metadata=(
        ("declaration", ()),
        ("relationship", (("/Product:finish", "A"),)),
        ("connection", (("/Product:finish", "A"),)),
        ("relationship", (("/Product:finish", "B"),)),
        ("relationship", (("/Product:shape", "round"),)),
        ("connection", (("/Product:shape", "square"),)),
    ))
    # Deterministic trivia changes exercise preservation without changing USDA meaning.
    # Transforms are prefix-stable, so translated coordinates still refer to the
    # independently marked literal edits rather than a second implementation parser.
    tabs = transformed_case("tab-indentation", base, lambda s: "\n".join(
        "\t" * (len(line) - len(line.lstrip(" "))) + line.lstrip(" ")
        for line in s.split("\n")))
    blank_lines = transformed_case("blank-lines", base, lambda s: s.replace("\n", "\n\n"))
    comments = transformed_case("injected-inert-comments", base, lambda s: s.replace(
        "\n", "\n# invariant /Product/Old <fake path> 😀\n"))
    flush_left = transformed_case("flush-left", base, lambda s: "\n".join(
        line.lstrip(" ") for line in s.split("\n")))
    unicode_crlf = transformed_case("unicode-crlf", unicode_case, lambda s: s.replace("\n", "\r\n"))
    boundaries_crlf = transformed_case("multiple-sets-crlf", boundaries, lambda s: s.replace("\n", "\r\n"))
    short_name = Case("shorter-destination-name", SOURCE, (
        Edit(211, 214, "Old", "H"),
        Edit(377, 389, "/Product/Old", "/Product/H"),
        Edit(426, 445, "/Product/Old.weight", "/Product/H.weight"),
        Edit(480, 496, "/Product/Old/Cap", "/Product/H/Cap"),
        Edit(555, 574, "/Product/Old.weight", "/Product/H.weight"),
    ), new_name="H")
    underscore_name = Case("identifier-destination-name", SOURCE, (
        Edit(211, 214, "Old", "_Handle_2"),
        Edit(377, 389, "/Product/Old", "/Product/_Handle_2"),
        Edit(426, 445, "/Product/Old.weight", "/Product/_Handle_2.weight"),
        Edit(480, 496, "/Product/Old/Cap", "/Product/_Handle_2/Cap"),
        Edit(555, 574, "/Product/Old.weight", "/Product/_Handle_2.weight"),
    ), new_name="_Handle_2")
    return [base, crlf, unicode_case, boundaries, tabs, blank_lines, comments, flush_left,
            unicode_crlf, boundaries_crlf, short_name, underscore_name]


def case_for_source(source: str, old_path: str, new_path: str) -> Case:
    for case in cases():
        expected_new_path = case.old_path.rsplit("/", 1)[0] + "/" + case.new_name
        if case.source == source and case.old_path == old_path and expected_new_path == new_path:
            return case
    raise AssertionError("Source does not match an independently authored oracle fixture")


def verify_files(source: Path, output: Path, receipt: Path) -> dict[str, Any]:
    source_text = source.read_bytes().decode("utf-8")
    receipt_data = json.loads(receipt.read_bytes().decode("utf-8"))
    case = case_for_source(source_text, receipt_data["oldPath"], receipt_data["newPath"])
    return verify_receipt(case, output.read_bytes(), receipt_data)


def mutation_checks(case: Case, output: bytes, receipt: dict[str, Any]) -> list[str]:
    """Prove the independent oracle rejects forged hashes, edits, and inert-byte changes."""
    rejected = []
    mutations = [
        ("source-hash", lambda r: r.__setitem__("sourceHash", "0" * 64)),
        ("output-hash", lambda r: r.__setitem__("outputHash", "0" * 64)),
        ("wrong-context", lambda r: r["edits"][1].__setitem__("context", {"/Product:finish": "B"})),
        ("wrong-kind", lambda r: r["edits"][1].__setitem__("kind", "connection")),
        ("wrong-span", lambda r: r["edits"][1].__setitem__("start", r["edits"][1]["start"] + 1)),
        ("wrong-before", lambda r: r["edits"][1].__setitem__("before", "/Product/OldSpare")),
        ("wrong-after", lambda r: r["edits"][1].__setitem__("after", "/Product/HandleSpare")),
    ]
    for label, mutate in mutations:
        forged = copy.deepcopy(receipt)
        mutate(forged)
        try:
            verify_receipt(case, output, forged)
        except AssertionError:
            rejected.append(label)
        else:
            raise AssertionError("Oracle incorrectly accepted " + label)
    altered_output = output.replace(b"# Keep this note", b"# Altered note!!")
    assert altered_output != output
    try:
        verify_receipt(case, altered_output, receipt)
    except AssertionError:
        rejected.append("modified-untouched-comment")
    else:
        raise AssertionError("Oracle accepted altered comment bytes")
    try:
        scalar_index("a😀b", 2)
    except AssertionError:
        rejected.append("split-surrogate")
    else:
        raise AssertionError("Oracle accepted a split UTF-16 surrogate pair")
    return rejected


def run_batch(cli: Path) -> dict[str, Any]:
    assert (ROOT / "fixtures/product.usda").read_bytes() == SOURCE.encode("utf-8"), \
        "The product fixture changed: review the independent literal oracle, do not regenerate it"
    results = []
    rejected_mutations: list[str] = []
    with tempfile.TemporaryDirectory(prefix="variant-mend-oracle-") as directory:
        work = Path(directory)
        for case in cases():
            source = work / (case.name + ".usda")
            output = work / (case.name + ".repaired.usda")
            receipt = work / (case.name + ".receipt.json")
            source.write_bytes(case.source.encode("utf-8"))
            command = ["node", str(cli), str(source), case.old_path, case.new_name,
                       str(output), str(receipt)]
            proc = subprocess.run(command, text=True, capture_output=True, cwd=ROOT)
            assert proc.returncode == 0, f"{case.name}: CLI failed\n{proc.stdout}\n{proc.stderr}"
            assert source.read_bytes() == case.source.encode("utf-8"), "CLI mutated its input"
            assert output.exists() and receipt.exists(), f"{case.name}: missing CLI output or receipt"
            actual_output = output.read_bytes()
            actual_receipt = json.loads(receipt.read_bytes())
            results.append(verify_receipt(case, actual_output, actual_receipt))
            if case.name == "product-literal":
                rejected_mutations = mutation_checks(case, actual_output, actual_receipt)
    return {"schema": "variant-mend-oracle/1", "status": "passed", "caseCount": len(results),
            "cases": results, "independentOfRuntime": True,
            "oracleMutationChecks": {"count": len(rejected_mutations), "rejected": rejected_mutations}}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--cli", type=Path, default=ROOT / "scripts/cli.mjs")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if any((args.source, args.output, args.receipt)):
        if not all((args.source, args.output, args.receipt)):
            parser.error("--source, --output and --receipt must be supplied together")
        result = verify_files(args.source, args.output, args.receipt)
    else:
        result = run_batch(args.cli.resolve())
    rendered = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, KeyError, ValueError, OSError) as error:
        print(f"Independent oracle failed: {error}", file=sys.stderr)
        sys.exit(1)
