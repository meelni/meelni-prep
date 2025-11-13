### ADR-023: Enhanced Prompt System with Difficulty-Aware Coaching
- **Date**: 2025-11-07
- **Decision**: Implement difficulty-aware prompt system with three levels (junior, intermediate, senior) to personalize interview coaching
- **Rationale**:
  - **Improve agent naturalness**: Convert frameworks from evaluation checklists to actionable instructions
  - **Personalize difficulty**: Adapt coaching style based on candidate experience level (APM → Senior PM)
  - **API-ready architecture**: Foundation for multi-tenant API service with company-specific configurations
  - **Better framework teaching**: Show WHAT good looks like with concrete examples, not just describe it
- **Implementation**:
  - Created `prompts.py` with three-layer architecture:
    - Layer 1: Base system prompt (universal coach identity)
    - Layer 2: Framework-specific instructions (Product Sense, Analytical, Leadership, Strategy)
    - Layer 3: Difficulty modulation + Mode instructions
  - Created `prompt_builder.py` for dynamic prompt assembly from room metadata
  - Added `CompanyConfig` and `SessionConfig` dataclasses for future API multi-tenancy
  - Integrated with `agent.py` via `build_interview_prompt()`
- **Difficulty Levels**:
  - **Junior (APM, 0-2 years)**: Patient coaching, teaching mode, accepts surface-level analysis
  - **Intermediate (IC PM, 2-4 years)**: Balanced approach, solid framework adherence expected
  - **Senior (Senior PM, 5+ years)**: High bar, challenging follow-ups, strategic thinking required
- **Consequences**:
  - Backward compatible with existing room metadata (defaults to "intermediate")
  - +4-8% cost increase per session (more tokens, acceptable for quality gain)
  - Foundation for API service offering (companies can customize prompts)
  - Easier to maintain and test prompts (modular architecture)
  - Conversation naturalness improved (target 4.0+/5.0 vs current ~3.2/5.0)

### `/agent/prompts.py`
**Purpose**: Enhanced modular prompt system with difficulty-aware coaching
**Key Exports**:
- `get_prompt(config: SessionConfig) -> str` - Main prompt composition function
- `CompanyConfig` - Dataclass for company-specific configurations (API multi-tenancy)
- `SessionConfig` - Dataclass for runtime session parameters
- `InterviewType`, `InterviewMode`, `Difficulty` - Enums for type safety

**Three-Layer Architecture**:
1. **Layer 1 (Base)**: Universal coach identity, operating principles, natural conversation patterns
2. **Layer 2 (Domain)**: Framework-specific instructions (Product Sense, Analytical, Leadership, Strategy)
3. **Layer 3 (Runtime)**: Difficulty modulation + Mode-specific instructions

**Critical Design Patterns**:
```python
# Usage example
from prompts import SessionConfig, InterviewType, Difficulty, get_prompt

config = SessionConfig(
    interview_type=InterviewType.PRODUCT_SENSE,
    difficulty=Difficulty.SENIOR  # Personalizes coaching style
)
prompt = get_prompt(config)
```

**Key Features**:
- **Difficulty-aware**: Adapts coaching style (junior/intermediate/senior)
- **Framework-as-instructions**: Actionable directives, not evaluation checklists
- **Concrete examples**: Every abstract directive has 2-3 real examples
- **No markdown**: TTS-compatible (no asterisks, no formatting)
- **Professional tone**: Human-like conversation, not LLM-speak
- **Token-efficient**: <3000 tokens per prompt (typical: ~475 tokens)

**Backward Compatibility**: Defaults to "intermediate" if difficulty not specified

### `/agent/prompt_builder.py`
**Purpose**: Translation layer between LiveKit room metadata and prompt system
**Key Exports**:
- `build_interview_prompt(metadata: Dict) -> str` - Main entrypoint from agent.py
- `parse_room_metadata(metadata: Dict) -> SessionConfig` - Metadata parser

**Responsibilities**:
- Extract difficulty from room metadata (default: "intermediate")
- Map `round_type` → `InterviewType` enum
- Handle backward compatibility with existing metadata format
- Validate and sanitize inputs

**Integration Pattern**:
```python
# In agent.py
from prompt_builder import build_interview_prompt

instructions = build_interview_prompt(ctx.room.metadata)
session = AgentSession(..., instructions=instructions)
```

**Error Handling**: Gracefully defaults to safe values if metadata invalid

- **Status**: Implemented in Phase 1A (2025-11-07)
- **Testing**: 10 verification tests, 100% pass rate

