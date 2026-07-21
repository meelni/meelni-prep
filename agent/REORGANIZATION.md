# Agent Folder Reorganization

**Date**: 2025-11-18
**Purpose**: Improve clarity and organization of agent codebase

## Summary of Changes

The agent folder has been reorganized from a flat structure with mixed files for both agents into a clear, modular structure that separates concerns.

## Before (Old Structure)

```
agent/
├── agent.py                    # Main interview agent (confusing name)
├── demo_agent.py               # Demo agent
├── config.py                   # Shared config
├── prompts.py                  # Shared prompts
├── utils/                      # Shared utilities
├── Dockerfile                  # Which agent?
├── Dockerfile.demo             # Demo Dockerfile
├── Dockerfile.main             # Main Dockerfile
├── Dockerfile.backup           # ???
├── .dockerignore               # Which agent?
├── .dockerignore.demo          # Demo ignore
├── .dockerignore.main          # Main ignore
├── deploy-demo.sh              # Demo deployment
├── deploy-main.sh              # Main deployment
├── livekit.toml                # Main agent config
├── livekit.demo.toml           # Demo agent config
├── DEPLOYMENT.md               # Docs mixed in
├── DEPLOYMENT_SUMMARY.md       # More docs
├── DEPLOY_DEMO.md              # Even more docs
├── QUESTION_BANK_INTEGRATION.md
├── test_greeting.py            # Scripts mixed in
├── test_prompts.py
├── show_sample_prompt.py
├── requirements.txt
└── venv/
```

**Problems**:

- ❌ Confusing: Which Dockerfile for which agent?
- ❌ Hard to deploy: Multiple `.dockerignore` files, need to copy before deploying
- ❌ Cluttered: Documentation, scripts, and code all mixed together
- ❌ No clear boundaries: Agent-specific vs shared code unclear
- ❌ Difficult to navigate: 20+ files in one directory

## After (New Structure)

```
agent/
├── demo/                       # Bounded voice-preview agent
│   ├── agent.py                # Demo entrypoint
│   ├── Dockerfile              # Demo Docker config
│   ├── .dockerignore           # Demo ignore rules
│   ├── livekit.toml            # Demo LiveKit config
│   ├── deploy.sh               # Demo deployment script
│   └── README.md               # Demo documentation
├── interview/                  # Full interview agent
│   ├── agent.py                # Interview entrypoint
│   ├── Dockerfile              # Interview Docker config
│   ├── .dockerignore           # Interview ignore rules
│   ├── livekit.toml            # Interview LiveKit config
│   ├── deploy.sh               # Interview deployment script
│   └── README.md               # Interview documentation
├── shared/                     # Shared code
│   ├── config.py               # Configuration parsing
│   ├── prompts.py              # Interview prompts
│   └── utils/
│       └── prompt_builder.py  # Dynamic prompt generation
├── docs/                       # Documentation
│   ├── DEPLOYMENT.md
│   ├── DEPLOYMENT_SUMMARY.md
│   ├── DEPLOY_DEMO.md
│   └── QUESTION_BANK_INTEGRATION.md
├── scripts/                    # Development scripts
│   ├── test_greeting.py
│   ├── test_prompts.py
│   └── show_sample_prompt.py
├── README.md                   # Main agent documentation
├── requirements.txt            # Shared dependencies
└── venv/                       # Virtual environment
```

**Benefits**:

- ✅ **Clear separation**: Each agent has its own directory
- ✅ **Easy deployment**: Just `cd demo && ./deploy.sh` or `cd interview && ./deploy.sh`
- ✅ **Self-contained**: Each agent folder has everything it needs
- ✅ **Organized**: Docs in `docs/`, scripts in `scripts/`, shared code in `shared/`
- ✅ **Discoverable**: Each agent has its own README with specific instructions
- ✅ **Maintainable**: Clear boundaries between agent-specific and shared code

## File Changes

### New Files Created

- `demo/README.md` - Demo agent documentation
- `interview/README.md` - Interview agent documentation
- `shared/` - Shared code directory structure
- `docs/` - Documentation directory
- `scripts/` - Scripts directory

### Files Moved

- `demo_agent.py` → `demo/agent.py`
- `agent.py` → `interview/agent.py`
- `Dockerfile.demo` → `demo/Dockerfile`
- `Dockerfile.main` → `interview/Dockerfile`
- `config.py` → `shared/config.py`
- `prompts.py` → `shared/prompts.py`
- `utils/` → `shared/utils/`
- Documentation → `docs/`
- Test scripts → `scripts/`

### Files Deleted

- `Dockerfile` (root, ambiguous)
- `Dockerfile.backup`
- `.dockerignore.demo` (now in `demo/.dockerignore`)
- `.dockerignore.main` (now in `interview/.dockerignore`)
- `deploy-demo.sh` (now `demo/deploy.sh`)
- `deploy-main.sh` (now `interview/deploy.sh`)
- `livekit.demo.toml` (now `demo/livekit.toml`)

### Files Updated

- All agent files: Updated imports to reference `shared/` modules
- All Dockerfiles: Updated to copy from `../shared/`
- All scripts: Updated import paths
- Main README: Restructured to explain new organization

## Migration Notes

### For Local Development

**Before**:

```bash
python agent.py dev              # Which agent?
python demo_agent.py dev         # Demo agent
```

**After**:

```bash
cd demo
python agent.py dev              # Clear: demo agent

cd interview
python agent.py dev              # Clear: interview agent
```

### For Deployment

**Before**:

```bash
# Confusing process with file copying
./demo/deploy.sh preview
```

**After**:

```bash
# Clear and simple
cd demo
./deploy.sh

# Or
cd interview
./deploy.sh
```

### For Documentation

**Before**: Search through root `agent/` directory for scattered docs

**After**:

- Agent-specific docs: Check `demo/README.md` or `interview/README.md`
- Deployment docs: Check `docs/`
- General overview: Check root `README.md`

## Code Changes Summary

### Import Path Changes

All Python files updated to reference `shared/` modules:

**Before**:

```python
from config import parse_room_metadata
from utils.prompt_builder import build_agent_prompt
```

**After**:

```python
import sys
from pathlib import Path

# Add parent directory to path for shared module imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.config import parse_room_metadata
from shared.utils.prompt_builder import build_agent_prompt
```

### Dockerfile Changes

Dockerfiles now reference shared modules:

**Before**:

```dockerfile
COPY agent.py .
COPY prompts.py .
COPY config.py .
COPY utils/ ./utils/
```

**After**:

```dockerfile
# Copy requirements from parent directory
COPY ../requirements.txt .

# Copy shared modules
COPY ../shared/ ./shared/

# Copy agent code
COPY agent.py .
```

## Testing

### To Test Locally

1. **Demo Agent**:

   ```bash
   cd demo
   source ../venv/bin/activate
   python agent.py dev
   ```

2. **Interview Agent**:

   ```bash
   cd interview
   source ../venv/bin/activate
   python agent.py dev
   ```

3. **Test Scripts**:
   ```bash
   cd scripts
   source ../venv/bin/activate
   python test_prompts.py
   python test_greeting.py
   ```

### To Test Deployment

1. Deploy demo agent:

   ```bash
   cd demo
   ./deploy.sh
   ```

2. Deploy interview agent:
   ```bash
   cd interview
   ./deploy.sh
   ```

## Rollback Instructions

If needed, the old structure can be restored from git history:

```bash
git checkout <previous-commit> -- agent/
```

However, the new structure is recommended for long-term maintainability.

## Related Documentation

- Main README: `README.md`
- Demo agent: `demo/README.md`
- Interview agent: `interview/README.md`
- Deployment guide: `docs/DEPLOYMENT.md`
