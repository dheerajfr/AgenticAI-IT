"""
cli.py — Command-line interface for plan-schedule (Stage 03).

Usage
-----
    python -m plan_schedule \\
        --estimates  path/to/estimate_1.json [estimate_2.json ...] \\
        --team       path/to/team_config.json \\
        --constraints path/to/sprint_constraints.json \\
        [--deps      path/to/dependencies.json] \\
        [--output    output/]

Each approved / re-baselined estimate produces one PlanRecord JSON file
in the output directory named  <plan_id>.json.

Exit codes
----------
  0  — one or more PlanRecords written successfully
  1  — no plans produced (all estimates gated or invalid inputs)
  2  — unrecoverable error (missing required args, parse failure)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import List, Optional

from plan_schedule.models import (
    DependencyEdge,
    EstimateRecord,
    SprintConstraints,
    TeamConfig,
)
from plan_schedule.planner import generate_plans


def _configure_logging(level_name: str) -> None:
    level = getattr(logging, level_name.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )


def _load_json(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="plan-schedule",
        description="Stage 03 — Convert approved estimates into dated PlanRecords.",
    )
    parser.add_argument(
        "--estimates",
        nargs="+",
        required=True,
        metavar="FILE",
        help="One or more EstimateRecord JSON files",
    )
    parser.add_argument(
        "--team",
        required=True,
        metavar="FILE",
        help="TeamConfig JSON file",
    )
    parser.add_argument(
        "--constraints",
        required=True,
        metavar="FILE",
        help="SprintConstraints JSON file",
    )
    parser.add_argument(
        "--deps",
        default=None,
        metavar="FILE",
        help="(Optional) Cross-plan dependency mapping JSON file",
    )
    parser.add_argument(
        "--output",
        default=os.environ.get("OUTPUT_DIR", "output"),
        metavar="DIR",
        help="Output directory for PlanRecord JSON files (default: output/)",
    )
    parser.add_argument(
        "--log-level",
        default=os.environ.get("LOG_LEVEL", "INFO"),
        metavar="LEVEL",
        help="Logging level: DEBUG | INFO | WARNING | ERROR (default: INFO)",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> None:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    _configure_logging(args.log_level)
    log = logging.getLogger(__name__)

    # --- Parse inputs ---
    try:
        estimates = [
            EstimateRecord(**_load_json(f)) for f in args.estimates
        ]
    except Exception as exc:
        log.error("Failed to parse estimate file(s): %s", exc)
        sys.exit(2)

    try:
        team_config = TeamConfig(**_load_json(args.team))
    except Exception as exc:
        log.error("Failed to parse team config: %s", exc)
        sys.exit(2)

    try:
        constraints = SprintConstraints(**_load_json(args.constraints))
    except Exception as exc:
        log.error("Failed to parse sprint constraints: %s", exc)
        sys.exit(2)

    deps = None
    if args.deps:
        try:
            raw_deps = _load_json(args.deps)
            deps = [DependencyEdge(**d) for d in raw_deps.get("dependencies", raw_deps)]
        except Exception as exc:
            log.error("Failed to parse dependency file: %s", exc)
            sys.exit(2)

    # --- Generate plans ---
    try:
        plans = generate_plans(estimates, team_config, constraints, deps)
    except ValueError as exc:
        log.error("Planning error: %s", exc)
        sys.exit(2)

    if not plans:
        log.warning(
            "No PlanRecords were produced. "
            "All estimates may be in draft/challenged status."
        )
        sys.exit(1)

    # --- Write output ---
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    for plan in plans:
        out_file = out_dir / f"{plan.plan_id}.json"
        with open(out_file, "w", encoding="utf-8") as fh:
            json.dump(plan.model_dump_iso(), fh, indent=2)
        log.info("Written: %s", out_file)

    log.info("Done. %d PlanRecord(s) written to %s/", len(plans), out_dir)
    sys.exit(0)


if __name__ == "__main__":
    main()
