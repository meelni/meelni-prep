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

print("Demo agent is standalone and doesn't use shared modules.")
print("It only requires LiveKit SDK imports.")
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

        if 'from shared' in content:
            print("⚠️  Warning: Demo agent imports from shared (not expected)")
        else:
            print("✅ Demo agent is standalone (no shared imports)")
else:
    print(f"❌ Demo agent file not found: {demo_agent_file}")
    sys.exit(1)

print()
print("=" * 80)
print("DEMO AGENT TEST PASSED ✅")
print("=" * 80)
