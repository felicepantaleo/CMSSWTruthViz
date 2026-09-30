#!/usr/bin/env python3
"""Add the event that run.sh --dot prepared to a catalogue the server reads.

The server opens an event only from a browser session or from the catalogue. This
script copies data/bundle.json, and data/rechits.json and data/associations.json when
they exist, to local/<id>/ next to the base catalogue, and writes local-catalog.json
there: the local event first, then every sample of the base catalogue.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

LOCAL_ID = "local"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_catalog", type=Path, help="Catalogue that the local event is added to")
    parser.add_argument("data_dir", type=Path, help="Folder with bundle.json, rechits.json and associations.json")
    parser.add_argument("--label", required=True, help="Name of the local event in the catalogue")
    parser.add_argument("--description", default="", help="Description of the local event")
    args = parser.parse_args()

    base_catalog = args.base_catalog.expanduser().resolve()
    samples = []
    if base_catalog.is_file():
        samples = json.loads(base_catalog.read_text(encoding="utf-8")).get("samples", [])
    samples = [sample for sample in samples if sample.get("id") != LOCAL_ID]

    target = base_catalog.parent / "local" / LOCAL_ID
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    artifacts = {}
    for key in ("bundle", "rechits", "associations"):
        source = args.data_dir / f"{key}.json"
        if source.is_file():
            shutil.copyfile(source, target / source.name)
            artifacts[key] = f"local/{LOCAL_ID}/{source.name}"
    if "bundle" not in artifacts:
        raise SystemExit(f"No bundle.json in {args.data_dir}")

    local = {"id": LOCAL_ID, "label": args.label, "description": args.description, "eventIndex": 0,
             "artifacts": artifacts}
    output = base_catalog.parent / "local-catalog.json"
    output.write_text(json.dumps({"schemaVersion": 1, "samples": [local] + samples}, indent=2) + "\n",
                      encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
