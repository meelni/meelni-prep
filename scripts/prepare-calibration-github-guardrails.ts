import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SAV_248_V19_ACTOR_RULESET_NAME,
  SAV_248_V19_GIT_LEDGER_REF,
  SAV_248_V19_GITHUB_ACTIVATION_ACTOR_ID,
  SAV_248_V19_GITHUB_OWNER,
  SAV_248_V19_GITHUB_REPOSITORY,
  SAV_248_V19_IMMUTABLE_RULESET_NAME,
} from "@/lib/evaluation/calibration-run-ledger";

export interface GitHubRulesetPayload {
  readonly name: string;
  readonly target: "branch";
  readonly enforcement: "active";
  readonly conditions: {
    readonly ref_name: {
      readonly include: readonly [typeof SAV_248_V19_GIT_LEDGER_REF];
      readonly exclude: readonly [];
    };
  };
  readonly rules: readonly { readonly type: string }[];
  readonly bypass_actors: readonly {
    readonly actor_id: number;
    readonly actor_type: "User";
    readonly bypass_mode: "always";
  }[];
}

export function buildSAV248V10GitHubGuardrailPayloads(): {
  readonly immutableRuleset: GitHubRulesetPayload;
  readonly activationActorRuleset: GitHubRulesetPayload;
} {
  const conditions = {
    ref_name: {
      include: [SAV_248_V19_GIT_LEDGER_REF],
      exclude: [],
    },
  } as const;

  return {
    immutableRuleset: {
      name: SAV_248_V19_IMMUTABLE_RULESET_NAME,
      target: "branch",
      enforcement: "active",
      conditions,
      rules: [{ type: "deletion" }, { type: "non_fast_forward" }],
      bypass_actors: [],
    },
    activationActorRuleset: {
      name: SAV_248_V19_ACTOR_RULESET_NAME,
      target: "branch",
      enforcement: "active",
      conditions,
      rules: [{ type: "creation" }, { type: "update" }],
      bypass_actors: [
        {
          actor_id: SAV_248_V19_GITHUB_ACTIVATION_ACTOR_ID,
          actor_type: "User",
          bypass_mode: "always",
        },
      ],
    },
  };
}

export function buildSAV248V10GitHubGuardrailReadme(params: {
  readonly outputDir: string;
  readonly sourceCommit: string;
}): string {
  return `# SAV-198 / SAV-248 v19 GitHub guardrail packet

Prepared from source commit \`${params.sourceCommit}\`.

This packet is non-mutating preparation only. Do not apply it without exact
owner authorization for the GitHub repository ruleset mutation. Do not manually
create the ledger ref; the calibration runtime owns the single activation
commit after signed authorization verifies.

The runtime requires exactly two active repository rulesets for:

\`\`\`text
${SAV_248_V19_GIT_LEDGER_REF}
\`\`\`

Payloads:

- \`immutable-ruleset-payload.json\`
- \`activation-actor-ruleset-payload.json\`

Apply only after explicit owner approval:

\`\`\`bash
gh api \\
  --method POST \\
  repos/${SAV_248_V19_GITHUB_OWNER}/${SAV_248_V19_GITHUB_REPOSITORY}/rulesets \\
  --input ${params.outputDir}/immutable-ruleset-payload.json

gh api \\
  --method POST \\
  repos/${SAV_248_V19_GITHUB_OWNER}/${SAV_248_V19_GITHUB_REPOSITORY}/rulesets \\
  --input ${params.outputDir}/activation-actor-ruleset-payload.json
\`\`\`

Verify before calibration:

\`\`\`bash
gh api 'repos/${SAV_248_V19_GITHUB_OWNER}/${SAV_248_V19_GITHUB_REPOSITORY}/rulesets?includes_parents=true&targets=branch&per_page=100' \\
  --jq '[.[] | select(.name|test("SAV-248 v19 calibration";"i")) | {id,name,target,enforcement,bypass_actors,rules,conditions}]'

gh api repos/${SAV_248_V19_GITHUB_OWNER}/${SAV_248_V19_GITHUB_REPOSITORY}/git/ref/heads/meelni-ledger/sav-248-authorized-paid-calibration.v19 \\
  --jq '{ref:.ref, sha:.object.sha, type:.object.type}' || true
\`\`\`

Expected exact ruleset names:

- \`${SAV_248_V19_IMMUTABLE_RULESET_NAME}\`
- \`${SAV_248_V19_ACTOR_RULESET_NAME}\`
`;
}

export async function writeSAV248V10GitHubGuardrailPacket(
  outputDir: string,
  sourceCommit = currentSourceCommit()
): Promise<void> {
  const targetDir = resolve(process.cwd(), outputDir);
  const { immutableRuleset, activationActorRuleset } =
    buildSAV248V10GitHubGuardrailPayloads();

  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  await writeJson(
    `${targetDir}/immutable-ruleset-payload.json`,
    immutableRuleset
  );
  await writeJson(
    `${targetDir}/activation-actor-ruleset-payload.json`,
    activationActorRuleset
  );
  await writeFile(
    `${targetDir}/README.md`,
    buildSAV248V10GitHubGuardrailReadme({
      outputDir: targetDir,
      sourceCommit,
    }),
    { encoding: "utf8", mode: 0o600 }
  );
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function currentSourceCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

async function main(): Promise<void> {
  const outputDir = argumentValue("--output-dir");
  const allowed = new Set(["--output-dir"]);
  if (
    process.argv
      .slice(2)
      .some(
        (argument, index, args) =>
          !allowed.has(argument) && !allowed.has(args[index - 1] ?? "")
      )
  ) {
    throw new Error("Only --output-dir <path> is supported");
  }

  await writeSAV248V10GitHubGuardrailPacket(outputDir);
  process.stdout.write(
    `${JSON.stringify({ result: "github_guardrail_packet_written", outputDir: resolve(process.cwd(), outputDir) }, null, 2)}\n`
  );
}

function argumentValue(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "guardrail_failed");
    process.exitCode = 1;
  });
}
