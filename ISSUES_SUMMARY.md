# GitHub Issues Summary
**Created**: 2025-11-07
**Branch**: saviii/bug-fixes-and-improvements

## Overview
Created 8 GitHub issues tracking bugs, features, and improvements for Meelni.

## Issues Created

### 1. Demo Agent Time Limit
- **Issue**: [#69](https://github.com/saviii/meelni-prep/issues/69)
- **Title**: Demo agent should have 5-minute time limit
- **Priority**: Medium
- **Type**: Enhancement
- **Summary**: Limit demo sessions to 5 minutes with clear upfront communication and graceful timeout handling.

### 2. UX Review - Setup Flow
- **Issue**: [#70](https://github.com/saviii/meelni-prep/issues/70)
- **Title**: UX Review: Simplify interview setup flow
- **Priority**: High
- **Type**: UX/Product
- **Stakeholders**: Product Manager, UI Designer, Architect
- **Summary**: Cross-functional review needed to streamline interview setup page and reduce user friction.

### 3. Voice Preview Button Bug
- **Issue**: [#71](https://github.com/saviii/meelni-prep/issues/71)
- **Title**: Bug: Voice preview button not working on setup page
- **Priority**: Medium
- **Type**: Bug
- **Summary**: Play button for voice preview on setup page has no effect. Need to implement audio playback.

### 4. Agent Introduction Missing
- **Issue**: [#72](https://github.com/saviii/meelni-prep/issues/72)
- **Title**: Agent should introduce itself at interview start
- **Priority**: High
- **Type**: Enhancement
- **Summary**: Agent should greet user and explain interview format instead of waiting in silence.

### 5. Transcript Not Working
- **Issue**: [#73](https://github.com/saviii/meelni-prep/issues/73)
- **Title**: Bug: Transcript not working during interviews
- **Priority**: **Critical**
- **Type**: Bug
- **Summary**: Transcripts not being captured during interviews. Blocks feedback generation.
- **Blocks**: #75

### 6. Timer Not Working
- **Issue**: [#74](https://github.com/saviii/meelni-prep/issues/74)
- **Title**: Bug: Interview timer not working
- **Priority**: Medium
- **Type**: Bug
- **Summary**: Timer on interview page not functioning. Users can't track interview duration.

### 7. Feedback Generation Feature
- **Issue**: [#75](https://github.com/saviii/meelni-prep/issues/75)
- **Title**: Feature: Implement AI-powered feedback generation
- **Priority**: **Critical**
- **Type**: Feature
- **Summary**: Core feature - need to implement post-interview feedback with GPT-4 Turbo. Includes scoring, constructive feedback, and handling incomplete interviews.
- **Blocked by**: #73
- **Product Decisions Needed**:
  - How to handle incomplete interviews?
  - Resume functionality priority?
  - Minimum duration for scoring?

### 8. Deploy New Prompt System
- **Issue**: [#76](https://github.com/saviii/meelni-prep/issues/76)
- **Title**: Deploy: Update LiveKit Cloud agents with new prompt system
- **Priority**: High
- **Type**: Deployment
- **Summary**: Redeploy both LiveKit Cloud agents (main + demo) with new difficulty-aware prompt system from PR #67.
- **Impact**: Better conversation quality, personalized coaching
- **Risk**: Low (backward compatible, can rollback)

## Priority Matrix

### Critical (Must Fix Immediately)
1. **#73** - Transcript not working (blocks feedback)
2. **#75** - Feedback generation (core feature)

### High Priority (This Sprint)
1. **#70** - UX review for setup flow
2. **#72** - Agent introduction
3. **#76** - Deploy new prompts

### Medium Priority (Next Sprint)
1. **#69** - Demo time limit
2. **#71** - Voice preview bug
3. **#74** - Timer bug

## Dependencies
```
#73 (Transcript) → #75 (Feedback)
```

## Linear Integration
**Note**: Linear integration not yet set up. To integrate:
1. Install Linear app in GitHub repository settings
2. Configure Linear workspace connection
3. Issues will auto-sync with Linear
4. Can create Linear tickets from GitHub issues

Alternative: Manually create Linear tickets and reference GitHub issue numbers.

## Next Steps
1. **Immediate**: Fix transcript capture (#73)
2. **Then**: Implement feedback generation (#75)
3. **Then**: Deploy new prompt system (#76)
4. **Product Review**: Setup flow UX (#70) + incomplete interview handling (#75)
5. **Polish**: Agent greeting (#72), timer (#74), voice preview (#71), demo limit (#69)

## Testing Checklist
After fixes:
- [ ] Transcript captures during interview
- [ ] Feedback generates after interview
- [ ] Agent greets user on join
- [ ] Timer counts up during interview
- [ ] Voice preview plays audio sample
- [ ] Demo ends at 5 minutes
- [ ] New prompts deployed to Cloud agents

---
**Created by**: Claude Code
**Date**: 2025-11-07
