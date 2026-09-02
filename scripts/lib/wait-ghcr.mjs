#!/usr/bin/env node
/**
 * Wait until ghcr.io/<owner>/<app>:<chart-version> exists, then try to
 * mark the package public so the user's Olares can pull it.
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

function versionsHaveTag(owner, name, tag) {
  const encoded = encodeURIComponent(name);
  const paths = [
    `/orgs/${owner}/packages/container/${encoded}/versions?per_page=50`,
    `/users/${owner}/packages/container/${encoded}/versions?per_page=50`,
    `/user/packages/container/${encoded}/versions?per_page=50`,
  ];
  for (const path of paths) {
    const probe = ghApi(path);
    if (probe.status !== 0) continue;
    try {
      const versions = JSON.parse(probe.stdout || "[]");
      for (const row of versions) {
        const tags = row?.metadata?.container?.tags || [];
        if (tags.includes(tag)) return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

async function publicManifest(repo, tag) {
  const url = `https://ghcr.io/v2/${repo.replace(/^ghcr\.io\//, "")}/manifests/${encodeURIComponent(tag)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept:
          "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
      },
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
  return run.status === 0;
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

function makePublic(owner, name) {
  const encoded = encodeURIComponent(name);
  const body = JSON.stringify({ visibility: "public" });
  const paths = [
    `/orgs/${owner}/packages/container/${encoded}/visibility`,
    `/user/packages/container/${encoded}/visibility`,
  ];
  for (const path of paths) {
    const probe = spawnSync("gh", ["api", "--method", "PUT", path, "--input", "-"], {
      encoding: "utf8",
      input: body,
      timeout: 20_000,
    });
    if (probe.status === 0) return true;
  }
  return false;
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
    const ready =
      versionsHaveTag(bound.owner, bound.appName, bound.version) ||
      (await publicManifest(bound.image_repo, bound.version));
    if (ready) {
      const published = makePublic(bound.owner, bound.appName);
      return { ok: true, image, public: published };
    }
    if (trigger && !triggered) {
      triggered = triggerWorkflow();
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
