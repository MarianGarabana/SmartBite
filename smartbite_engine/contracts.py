"""Validate model replies and engine output against docs/contracts (JSON Schema subset, no extra dependency).

Supported keywords: type, required, properties, additionalProperties (false), items, enum, minimum,
exclusiveMinimum, maximum, minItems, maxItems, maxLength, $ref (same file or another contract file).
"""
import json
import re
from pathlib import Path

CONTRACTS = Path(__file__).resolve().parents[1] / "docs" / "contracts"
TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}


def parse_reply(text):
    """The reply must be one JSON object, optionally in a single ```json fence, with nothing else around it."""
    body = text.strip()
    fence = re.fullmatch(r"```(?:json)?\s*\n(.*)\n\s*```", body, re.S)
    if fence:
        body = fence.group(1).strip()
    try:
        data, end = json.JSONDecoder().raw_decode(body)
    except json.JSONDecodeError as e:
        return None, [f"reply is not valid JSON ({e.msg} at character {e.pos}). Reply with ONLY the JSON object."]
    if body[end:].strip():
        return None, ["reply has extra text after the JSON. Reply with ONLY the JSON object, no notes or analysis."]
    return data, []


def _load(file_name):
    return json.loads((CONTRACTS / file_name).read_text(encoding="utf-8"))


def _resolve(ref, current_file):
    file_name, _, pointer = ref.partition("#")
    doc = _load(file_name or current_file)
    for part in pointer.strip("/").split("/"):
        doc = doc[part]
    return doc, file_name or current_file


def _is_type(value, kind):
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    return isinstance(value, TYPES[kind])


def validate(value, schema, file_name, path="reply"):
    if "$ref" in schema:
        target, target_file = _resolve(schema["$ref"], file_name)
        return validate(value, target, target_file, path)
    errors = []
    kinds = schema.get("type")
    if kinds:
        kinds = kinds if isinstance(kinds, list) else [kinds]
        if not any(_is_type(value, k) for k in kinds):
            return [f"{path}: must be {' or '.join(kinds)}, got {type(value).__name__}"]
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: must be one of {schema['enum']}, got {value!r}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: must be >= {schema['minimum']}")
        if "exclusiveMinimum" in schema and value <= schema["exclusiveMinimum"]:
            errors.append(f"{path}: must be > {schema['exclusiveMinimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: must be <= {schema['maximum']}")
    if isinstance(value, str) and "maxLength" in schema and len(value) > schema["maxLength"]:
        errors.append(f"{path}: at most {schema['maxLength']} characters, got {len(value)}")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: needs at least {schema['minItems']} items, got {len(value)}")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: at most {schema['maxItems']} items, got {len(value)}")
        if "items" in schema:
            for i, item in enumerate(value):
                errors += validate(item, schema["items"], file_name, f"{path}[{i}]")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: missing required field {key}")
        props = schema.get("properties", {})
        for key, item in value.items():
            if key in props:
                errors += validate(item, props[key], file_name, f"{path}.{key}" if path != "reply" else key)
            elif schema.get("additionalProperties") is False:
                errors.append(f"{path}: unexpected field {key}")
    return errors


def validate_output(data, contract_file, definition="Output"):
    """Errors for data against one $defs entry of a contract file (Output by default). Empty list = valid."""
    return validate(data, _load(contract_file)["$defs"][definition], contract_file)
