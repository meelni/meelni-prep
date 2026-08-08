#!/usr/bin/env python3
"""Retired split-deployment Preview bootstrap.

Preview now runs the demo and interview workers in one Meelni-owned hosted
deployment. Keep this tombstone so old operator commands fail before making a
provider call instead of recreating the personal-account topology.
"""

from __future__ import annotations

import sys


RETIRED_MESSAGE = (
    "livekit_preview_demo_bootstrap_retired: use agent/preview/deploy.sh for "
    "the single-deployment Preview topology"
)


def main() -> int:
    print(RETIRED_MESSAGE, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
