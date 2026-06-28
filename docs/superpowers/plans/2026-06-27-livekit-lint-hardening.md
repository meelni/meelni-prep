# LiveKit Integration And Lint Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Extract LiveKit provider behavior into `@meelni/integrations`, clear the repo-wide ESLint baseline, and open a draft PR with validation evidence.

**Architecture:** Keep domain contracts in `@meelni/core`, room metadata contracts in `@meelni/agent`, and provider SDK boundaries in `@meelni/integrations`. The Next.js route should orchestrate auth, quota, question/session persistence, and delegate LiveKit room/dispatch/token behavior to a provider module.

**Tech Stack:** Next.js route handlers, TypeScript, Node test runner through `tsx --test`, `livekit-server-sdk`, ESLint 9, GitHub CLI.

---

### Task 1: LiveKit Provider Boundary

**Files:**
- Create: `packages/integrations/src/livekit.ts`
- Modify: `packages/integrations/src/index.ts`
- Modify: `packages/integrations/src/contracts.test.ts`
- Modify: `app/api/session/start/route.ts`

- [x] **Step 1: Write failing LiveKit provider tests**

Add tests to `packages/integrations/src/contracts.test.ts` that verify:

```ts
import {
  buildInterviewRoomName,
  createLiveKitInterviewProvider,
  getLiveKitEnvironment,
  type LiveKitInterviewProvider,
} from "./index";

test("getLiveKitEnvironment reports missing required LiveKit config", () => {
  const result = getLiveKitEnvironment({});
  assert.equal(result.ok, false);
  assert.equal(result.provider, "livekit");
  assert.equal(result.error.code, "livekit_env_missing");
});

test("getLiveKitEnvironment accepts public or server websocket URL", () => {
  const result = getLiveKitEnvironment({
    LIVEKIT_API_KEY: "key",
    LIVEKIT_API_SECRET: "secret",
    LIVEKIT_URL: "wss://server.livekit.cloud",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.url, "wss://server.livekit.cloud");
  }
});

test("buildInterviewRoomName is stable enough for route use", () => {
  const name = buildInterviewRoomName({ now: 1782600000000, random: () => 0.5 });
  assert.match(name, /^interview-1782600000000-/);
});

test("LiveKit provider creates room, dispatches agent, and mints token", async () => {
  const calls: string[] = [];
  const provider: LiveKitInterviewProvider = createLiveKitInterviewProvider({
    accessTokenFactory: class {
      addGrant() {
        calls.push("grant");
      }
      async toJwt() {
        calls.push("jwt");
        return "token-1";
      }
    },
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        calls.push("dispatch");
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => {
        calls.push("room");
      },
    }),
  });

  const result = await provider.startInterviewRoom({
    agentId: "agent-1",
    identity: "user-1",
    participantName: "user@example.com",
    roomName: "interview-1",
    metadata: { round_type: "product_sense" },
    env: { apiKey: "key", apiSecret: "secret", url: "wss://lk" },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["room", "dispatch", "grant", "jwt"]);
});
```

- [x] **Step 2: Run test and verify it fails**

Run: `npm run test:integrations`

Expected: FAIL because `livekit.ts` exports do not exist.

- [x] **Step 3: Implement LiveKit provider module**

Create `packages/integrations/src/livekit.ts` with:

```ts
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { findMissingRequiredEnv } from "./environment";
import { providerFailure, providerSuccess, type ProviderResult } from "./results";

export interface LiveKitEnvironment {
  apiKey: string;
  apiSecret: string;
  url: string;
}

export interface StartInterviewRoomInput {
  agentId: string;
  identity: string;
  participantName: string;
  roomName: string;
  metadata: unknown;
  env: LiveKitEnvironment;
}

export interface StartedInterviewRoom {
  roomName: string;
  token: string;
  url: string;
}

export interface LiveKitInterviewProvider {
  startInterviewRoom(input: StartInterviewRoomInput): Promise<ProviderResult<StartedInterviewRoom>>;
}
```

Then implement environment parsing, deterministic room-name generation, provider dependency injection for tests, create-room idempotency for “already exists”, dispatch, token grant, and `ProviderResult` wrapping.

- [x] **Step 4: Route uses provider**

Modify `app/api/session/start/route.ts` to remove direct `livekit-server-sdk` imports and use:

```ts
const livekitEnv = getLiveKitEnvironment(process.env);
if (!livekitEnv.ok) {
  console.error("Missing LiveKit environment variables", livekitEnv.error.message);
  return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
}

const roomName = buildInterviewRoomName();
const livekit = createLiveKitInterviewProvider();
const livekitResult = await livekit.startInterviewRoom({
  agentId: INTERVIEW_AGENT_ID,
  identity: user.id,
  participantName: user.email || user.id,
  roomName,
  metadata: roomMetadata,
  env: livekitEnv.data,
});
```

- [x] **Step 5: Verify**

Run:

```bash
npm run test:integrations
npm run typecheck
```

Expected: PASS.

Result: PASS. The lint gate now exits successfully with zero errors. Remaining output is warnings for legacy unused variables, hook dependency guidance, one image optimization warning, and a stale `baseline-browser-mapping` package notice.

### Task 2: ESLint Baseline Cleanup

**Files:** existing app, component, lib, script, test, and type files reported by `npx eslint .`.

- [x] **Step 1: Apply safe autofix**

Run: `npx eslint . --fix`

Expected: mechanical fixes for `prefer-const`, import ordering where supported, and a small number of safe warnings.

- [x] **Step 2: Recount lint issues**

Run:

```bash
npx eslint --format json . > /tmp/meelni-lint.json || true
node scripts or inline node to summarize remaining rules
```

Expected: lower count than baseline `267 errors / 123 warnings`.

- [x] **Step 3: Fix rule families in order**

Address remaining lint by family:

1. `@typescript-eslint/no-unused-vars`: remove unused imports/variables or prefix intentionally unused parameters with `_`.
2. `react/no-unescaped-entities`: use `&apos;` or rewrite copy.
3. `@typescript-eslint/no-require-imports`: replace `require()` with static or dynamic `import`.
4. `@typescript-eslint/no-explicit-any`: replace with route/test-specific narrow aliases, `unknown`, or typed mock helpers.
5. React compiler rules: move random generation, mutation, and state initialization out of render/effect patterns where possible.
6. Miscellaneous Next/a11y rules: replace raw `<a href="/">` with `Link`, align ARIA attributes, and avoid raw `<img>` where required.

- [x] **Step 4: Verify lint passes**

Run: `npm run lint`

Expected: PASS.

### Task 3: Full Validation And PR

**Files:**
- Modify: `docs/superpowers/plans/2026-06-27-livekit-lint-hardening.md`

- [x] **Step 1: Run full focused suite**

Run:

```bash
npm run test:core
npm run test:agent
npm run test:integrations
npm run test:python-agent
npm run test:local
npm run typecheck
npm run lint
npm run doctor
```

Expected: all pass except `doctor` may warn if local secrets or `agent/venv` are missing.

- [x] **Step 2: Commit**

Run:

```bash
git add .
git commit -m "Harden LiveKit integration and lint baseline"
```

- [x] **Step 3: Push and open draft PR**

Run:

```bash
git push -u origin codex/livekit-lint-hardening
gh pr create --draft --base main --head codex/livekit-lint-hardening --title "[codex] Harden LiveKit integration and lint baseline" --body-file /tmp/meelni-pr-body.md
```

Expected: draft PR URL.

### Self-Review

Spec coverage:
- LiveKit extraction: Task 1.
- Lint cleanup: Task 2.
- Robust validation and PR: Task 3.

Placeholder scan:
- No implementation step relies on an undefined “do the right thing” placeholder; rule-family cleanup is intentionally grouped because the exact file set is generated by ESLint after autofix.

Type consistency:
- Provider APIs return `ProviderResult<T>` from `@meelni/integrations`.
- Route continues to own auth, quota, database persistence, and response shaping.
