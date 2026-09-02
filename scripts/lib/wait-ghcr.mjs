#!/usr/bin/env node
/**
 * Wait until ghcr.io/<owner>/<app>:<chart-version> is anonymously pullable.
 * GitHub requires the owner to make a new package public in its settings.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectGithubFork } from "./github.mjs";
import { resolveRuntime } from "./runtime-config.mjs";
import { repoRoot } from "./dsh-config.mjs";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ghApi(path) {
  return spawnSync("gh", ["api", path], {
    encoding: "utf8",
    cwd: repoRoot(),
    timeout: 20_000,
  });
}

async function publicManifest(repo, tag) {
  const name = repo.replace(/^ghcr\.io\//, "");
  try {
    const auth = await fetch(
      `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(`repository:${name}:pull`)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!auth.ok) return false;
    const token = String((await auth.json())?.token || "");
    if (!token) return false;
    const res = await fetch(`https://ghcr.io/v2/${name}/manifests/${encodeURIComponent(tag)}`, {
      headers: {
        Accept:
          "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function currentRef() {
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
    cwd: repoRoot(),
    timeout: 10_000,
  });
  const name = String(branch.stdout || "").trim();
  if (name && name !== "HEAD") return name;
  const sha = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    cwd: repoRoot(),
    timeout: 10_000,
  });
  return String(sha.stdout || "").trim();
}

function triggerWorkflow() {
  const ref = currentRef();
  const args = ["workflow", "run", "image"];
  if (ref) args.push("--ref", ref);
  const run = spawnSync("gh", args, {
    encoding: "utf8",
    cwd: repoRoot(),
    timeout: 30_000,
  });
  const err = `${run.stderr || ""}${run.stdout || ""}`.trim();
  return { ok: run.status === 0, error: err, ref };
}

function headSha() {
  const run = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    cwd: repoRoot(),
    timeout: 10_000,
  });
  return String(run.stdout || "").trim();
}

/**
 * GitHub only runs a workflow that exists in the remote repository, at the ref
 * being built. A local-only .github/workflows/image.yml builds nothing.
 */
export function assertWorkflowPushed(owner, repo) {
  const ref = currentRef();
  const path = `repos/${owner}/${repo}/contents/.github/workflows/image.yml?ref=${encodeURIComponent(ref)}`;
  if (ghApi(path).status !== 0) {
    throw new Error(
      `.github/workflows/image.yml is not on ${owner}/${repo}@${ref} — commit and push it, otherwise GitHub has no image build to run`,
    );
  }
  const remote = ghApi(`repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
  if (remote.status !== 0) return;
  try {
    const sha = JSON.parse(remote.stdout || "{}")?.sha || "";
    if (sha && headSha() && sha !== headSha()) {
      throw new Error(
        `local HEAD is not pushed to ${owner}/${repo}@${ref} — push first so CI builds the code you are deploying`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("local HEAD")) throw err;
  }
}

function latestWorkflowRun(owner, repo, version) {
  const sha = headSha();
  const run = spawnSync(
    "gh",
    [
      "run",
      "list",
      "--repo",
      `${owner}/${repo}`,
      "--workflow",
      "image",
      "--limit",
      "20",
      "--json",
      "status,conclusion,url,headBranch,headSha",
    ],
    {
      encoding: "utf8",
      cwd: repoRoot(),
      timeout: 20_000,
    },
  );
  if (run.status !== 0) return null;
  try {
    return (
      JSON.parse(run.stdout || "[]").find(
        (row) => row.headSha === sha || row.headBranch === `v${version}`,
      ) || null
    );
  } catch {
    return null;
  }
}

export async function waitGhcr({ timeoutMs = 20 * 60 * 1000, trigger = true } = {}) {
  const fork = inspectGithubFork();
  if (!fork.ok) {
    throw new Error(fork.errorKey || "github_fork_required");
  }
  const bound = resolveRuntime();
  if (!bound.version) throw new Error("chart version missing");
  assertWorkflowPushed(bound.owner, bound.repo);
  const image = `${bound.image_repo}:${bound.version}`;
  const started = Date.now();
  let triggered = false;
  while (Date.now() - started < timeoutMs) {
    if (await publicManifest(bound.image_repo, bound.version)) {
      return { ok: true, image, public: true };
    }
    const run = latestWorkflowRun(bound.owner, bound.repo, bound.version);
    if (run?.status === "completed") {
      if (run.conclusion !== "success") {
        throw new Error(`image workflow failed: ${run.url || run.conclusion}`);
      }
      throw new Error(
        `${image} was built but is not public — open https://github.com/users/${bound.owner}/packages/container/${bound.appName}/settings and change visibility to Public`,
      );
    }
    if (trigger && !triggered) {
      const startedRun = triggerWorkflow();
      triggered = true;
      if (!startedRun.ok && !run) {
        throw new Error(
          `could not start workflow image on ${startedRun.ref || "HEAD"}: ${startedRun.error || "gh workflow run failed"}. ` +
            `Enable Actions on the fork, put .github/workflows/image.yml on the default branch, ` +
            `or push tag v${bound.version}. Manual dispatch also needs: gh auth refresh -s workflow`,
        );
      }
    }
    await sleep(15_000);
  }
  throw new Error(`timed out waiting for ${image}`);
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  const trigger = !process.argv.includes("--no-trigger");
  waitGhcr({ trigger })
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
