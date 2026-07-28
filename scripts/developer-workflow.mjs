import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function summarizePorcelainStatus(output) {
  const entries = output.split(/\r?\n/).filter(Boolean);
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const entry of entries) {
    const indexStatus = entry[0] || " ";
    const worktreeStatus = entry[1] || " ";
    if (indexStatus === "?" && worktreeStatus === "?") {
      untracked += 1;
      continue;
    }
    if (indexStatus !== " ") staged += 1;
    if (worktreeStatus !== " ") unstaged += 1;
  }

  return {
    total: entries.length,
    staged,
    unstaged,
    untracked,
  };
}

export function evaluateHandoffSnapshot(snapshot) {
  const problems = [];

  if (!snapshot.branch) {
    problems.push("HEAD is detached; create or switch to a named branch.");
  }
  if (snapshot.changes.total > 0) {
    problems.push(
      `working tree has ${snapshot.changes.total} uncommitted change(s).`
    );
  }
  if (!snapshot.upstream) {
    problems.push(
      "branch has no upstream; push it with `git push -u origin HEAD`."
    );
  } else {
    if (snapshot.ahead > 0) {
      problems.push(`branch has ${snapshot.ahead} unpushed commit(s).`);
    }
    if (snapshot.behind > 0) {
      problems.push(
        `branch is ${snapshot.behind} commit(s) behind its upstream.`
      );
    }
  }

  return {
    ready: problems.length === 0,
    problems,
  };
}

export function parseWorktreePorcelain(output) {
  const records = [];
  let current;

  for (const line of output.split(/\r?\n/)) {
    if (!line) {
      if (current) records.push(current);
      current = undefined;
      continue;
    }

    const separator = line.indexOf(" ");
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? true : line.slice(separator + 1);
    if (key === "worktree") {
      if (current) records.push(current);
      current = { path: value };
    } else if (current) {
      current[key] = value;
    }
  }

  if (current) records.push(current);
  return records;
}

export function classifyWorktree(snapshot) {
  if (snapshot.missing) return "missing";
  if (snapshot.dirtyCount > 0) return "dirty";
  if (snapshot.mergedIntoDefault) return "merged";
  if (snapshot.upstreamState === "gone") return "gone";
  if (snapshot.detached) return "detached";
  return "active";
}

function runGit(
  args,
  { cwd = repoRoot, allowFailure = false, trim = true } = {}
) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    if (allowFailure) return undefined;
    const diagnostic = (result.stderr || result.stdout || "git command failed")
      .trim()
      .split(/\r?\n/)[0];
    throw new Error(diagnostic);
  }

  return trim ? result.stdout.trim() : result.stdout;
}

function gitSucceeds(args, cwd = repoRoot) {
  return (
    spawnSync("git", args, {
      cwd,
      stdio: "ignore",
    }).status === 0
  );
}

function collectHandoffSnapshot() {
  const branch = runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], {
    allowFailure: true,
  });
  const head = runGit(["rev-parse", "HEAD"]);
  const upstream = runGit(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    { allowFailure: true }
  );
  const changes = summarizePorcelainStatus(
    runGit(["status", "--porcelain=v1", "--untracked-files=all"], {
      trim: false,
    })
  );
  let ahead = 0;
  let behind = 0;

  if (upstream) {
    const counts = runGit([
      "rev-list",
      "--left-right",
      "--count",
      `HEAD...${upstream}`,
    ])
      .split(/\s+/)
      .map(Number);
    [ahead = 0, behind = 0] = counts;
  }

  return {
    branch,
    head,
    upstream,
    ahead,
    behind,
    changes,
  };
}

function defaultRemoteRef() {
  return (
    runGit(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], {
      allowFailure: true,
    }) ||
    (gitSucceeds([
      "show-ref",
      "--verify",
      "--quiet",
      "refs/remotes/origin/main",
    ])
      ? "refs/remotes/origin/main"
      : undefined)
  );
}

function configuredUpstreamState(path, branch) {
  if (!branch) return { label: "none", state: "none" };

  const upstream = runGit(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    { cwd: path, allowFailure: true }
  );
  if (upstream) return { label: upstream, state: "present" };

  const remote = runGit(["config", "--get", `branch.${branch}.remote`], {
    cwd: path,
    allowFailure: true,
  });
  const mergeRef = runGit(["config", "--get", `branch.${branch}.merge`], {
    cwd: path,
    allowFailure: true,
  });

  return remote && mergeRef
    ? {
        label: `${remote}/${mergeRef.replace("refs/heads/", "")}`,
        state: "gone",
      }
    : { label: "none", state: "none" };
}

function collectWorktreeSnapshots() {
  const currentPath = realpathSync(repoRoot);
  const defaultRef = defaultRemoteRef();
  const records = parseWorktreePorcelain(
    runGit(["worktree", "list", "--porcelain"], { trim: false })
  );

  return records.map((record) => {
    const path = record.path;
    const pathExists = existsSync(path);
    const branch = record.branch
      ? String(record.branch).replace("refs/heads/", "")
      : undefined;
    const changes = pathExists
      ? summarizePorcelainStatus(
          runGit(["status", "--porcelain=v1", "--untracked-files=all"], {
            cwd: path,
            trim: false,
          })
        )
      : summarizePorcelainStatus("");
    const upstream = configuredUpstreamState(
      pathExists ? path : repoRoot,
      branch
    );
    const snapshot = {
      current: pathExists && realpathSync(path) === currentPath,
      path,
      head: record.HEAD,
      branch,
      detached: Boolean(record.detached),
      missing: !pathExists,
      dirtyCount: changes.total,
      upstream: upstream.label,
      upstreamState: upstream.state,
      mergedIntoDefault: Boolean(
        defaultRef &&
          record.HEAD &&
          gitSucceeds(["merge-base", "--is-ancestor", record.HEAD, defaultRef])
      ),
      lastCommitDate:
        runGit(["show", "-s", "--format=%cs", record.HEAD], {
          cwd: pathExists ? path : repoRoot,
          allowFailure: true,
        }) || "unknown",
    };

    return { ...snapshot, state: classifyWorktree(snapshot) };
  });
}

function printHandoff(json) {
  const snapshot = collectHandoffSnapshot();
  const evaluation = evaluateHandoffSnapshot(snapshot);

  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ...snapshot, ...evaluation }, null, 2)}\n`
    );
  } else {
    console.log("Run `git fetch --prune` first when remote freshness matters.");
    console.log(`Branch: ${snapshot.branch || "detached"}`);
    console.log(`Commit: ${snapshot.head}`);
    console.log(`Upstream: ${snapshot.upstream || "none"}`);
    console.log(
      `Working tree: ${snapshot.changes.total === 0 ? "clean" : `${snapshot.changes.total} change(s)`}`
    );
    console.log(`Sync: ${snapshot.ahead} ahead, ${snapshot.behind} behind`);
    console.log("");
    if (evaluation.ready) {
      console.log("Handoff ready: committed, clean, and pushed.");
    } else {
      console.log("Handoff blocked:");
      for (const problem of evaluation.problems) console.log(`- ${problem}`);
    }
  }

  if (!evaluation.ready) process.exitCode = 1;
}

function printWorktrees(json) {
  const snapshots = collectWorktreeSnapshots();
  if (json) {
    process.stdout.write(`${JSON.stringify(snapshots, null, 2)}\n`);
    return;
  }

  console.log("Run `git fetch --prune` first when remote freshness matters.");
  console.log("MARK\tSTATE\tDIRTY\tMERGED\tUPSTREAM\tBRANCH\tLAST\tPATH");
  for (const item of snapshots) {
    console.log(
      [
        item.current ? "*" : "",
        item.state,
        item.dirtyCount,
        item.mergedIntoDefault ? "yes" : "no",
        item.upstream,
        item.branch || "detached",
        item.lastCommitDate,
        item.path,
      ].join("\t")
    );
  }
}

function main() {
  const command = process.argv[2];
  const json = process.argv.includes("--json");
  if (command === "handoff") {
    printHandoff(json);
    return;
  }
  if (command === "worktrees") {
    printWorktrees(json);
    return;
  }

  console.error(
    "Usage: node scripts/developer-workflow.mjs <handoff|worktrees> [--json]"
  );
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
