### ADR-008: GPT-4o-mini for Dialogue LLM

- **Date**: 2025-11-05
- **Decision**: Use GPT-4o-mini instead of GPT-4 or Claude 3.5 Sonnet for dialogue
- **Rationale**:
  - Cost-effective for MVP ($0.15/1M input tokens vs $10/1M for GPT-4 Turbo)
  - Works with LiveKit's OpenAI gateway provider
  - Sufficient quality for natural interview conversation
  - Can upgrade to GPT-4 Turbo or Claude later if needed
  - Model name format: `"openai/gpt-4o-mini"` (not `"openai/gpt-4"`)
- **Consequences**:
  - Lower cost per interview session (~20 min = ~$0.05 in LLM costs)
  - May need to tune prompts for interview quality
  - Easy to swap models later via string config in `AgentSession`
