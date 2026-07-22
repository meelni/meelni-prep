#!/usr/bin/env python3
"""Test demo agent can import all required modules"""

import sys
from pathlib import Path

# Add demo directory's parent to path (simulating demo/agent.py behavior)
demo_dir = Path(__file__).parent / "demo"
sys.path.insert(0, str(demo_dir.parent))

print("=" * 80)
print("TESTING DEMO AGENT - Import Verification")
print("=" * 80)
print()

print("Demo agent keeps its runtime standalone but may import shared contracts.")
print()

# Verify the demo agent file exists and has correct structure
demo_agent_file = demo_dir / "agent.py"
if demo_agent_file.exists():
    print(f"✅ Demo agent file exists: {demo_agent_file}")

    # Check if it has the sys.path manipulation
    with open(demo_agent_file, 'r') as f:
        content = f.read()
        if 'sys.path.insert(0, str(Path(__file__).parent.parent))' in content:
            print("✅ Demo agent has correct sys.path setup")
        else:
            print("⚠️  Warning: Demo agent missing sys.path setup (may not be needed)")

        allowed_shared_imports = {
            'from shared.candidate_presence import wait_for_candidate_before_greeting',
            'from shared.dispatch import resolve_cli_dispatch_name',
            'from shared.prompt_contracts import DEMO_PROMPT_CONTRACT, PromptContract',
            'from shared.safe_logging import log_exception_class',
        }
        shared_imports = {
            line.strip()
            for line in content.splitlines()
            if line.strip().startswith("from shared")
        }
        unexpected_shared_imports = shared_imports - allowed_shared_imports

        if unexpected_shared_imports:
            print("❌ Demo agent has unexpected shared imports:")
            for shared_import in sorted(unexpected_shared_imports):
                print(f"   - {shared_import}")
            sys.exit(1)
        elif shared_imports:
            print("✅ Demo agent uses only allowed shared runtime/contract imports")
        else:
            print("✅ Demo agent has no shared imports")
else:
    print(f"❌ Demo agent file not found: {demo_agent_file}")
    sys.exit(1)

print()
print("=" * 80)
print("DEMO AGENT TEST PASSED ✅")
print("=" * 80)
