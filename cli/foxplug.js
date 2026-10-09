#!/usr/bin/env node
// foxplug: the FoxPlug changelog Action for every other place your code runs (GitLab CI, Bitbucket
// Pipelines, CircleCI, Jenkins, a terminal). One file, no dependencies, Node 18+ built-in fetch.
//
// On a release tag: sends the tag, its name, its notes (the commit subjects since the previous tag
// unless you pass --notes) and its link.
// Otherwise: sends the subject line of each commit in this push (or of today's commits).
// Nothing else leaves the machine: no source code, no secrets, no environment.
//
// FoxPlug turns it into a changelog entry and launch posts in your project, as drafts waiting for
// your approval. Nothing is posted anywhere by this command.

"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");

const VERSION = "1.0.0";
const ENDPOINT = process.env.FOXPLUG_ENDPOINT || "https://fybedvapqhhgctkeqvbs.supabase.co/functions/v1/lcnc-action-ingest";
const USER_AGENT = `foxplug-npm/${VERSION} (+https://www.npmjs.com/package/foxplug)`;
const TOKEN_PAGE = "https://foxplug.com/app/?connect=github-action&utm_source=npm&utm_medium=cli&utm_campaign=foxplug_npm";
const env = process.env;

const HELP = `foxplug ${VERSION}: every release or push becomes a FoxPlug changelog entry and launch posts, as drafts.

Usage: npx foxplug [options]

  FOXPLUG_TOKEN       your project token (environment variable, required)
                      get one: ${TOKEN_PAGE}

  --release <tag>     send this tag as a release (found automatically in GitLab, Bitbucket,
                      CircleCI and GitHub when the build runs for a tag)
  --notes <file>      release notes from a file, instead of the commit subjects since the last tag
  --since <ref>       send the commits after this ref (default: the push's own range in CI,
                      otherwise today's commits)
  --repo <owner/name> the repository name, if it cannot be read from git or CI
  --project <name>    your FoxPlug project name, as a check that the token is the one you meant
  --dry-run           print what would be sent, send nothing
  --version, --help

Only the tag, its name, notes and link, or commit subject lines are sent.`;

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => { const v = argv[++i]; if (v == null || v.startsWith("--")) fail(`${a} needs a value.`); return v; };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--version" || a === "-v") o.version = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--release") o.release = take();
    else if (a === "--notes") o.notes = take();
    else if (a === "--since") o.since = take();
    else if (a === "--repo") o.repo = take();
    else if (a === "--project") o.project = take();
    else fail(`Unknown option ${a}. Run npx foxplug --help.`);
  }
  return o;
}
function fail(msg) { console.error(`foxplug: ${msg}`); process.exit(1); }
function git(args) {
  try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch (_e) { return null; }
}
const subjectOf = (m) => String(m || "").split("\n")[0].trim().slice(0, 300);
const zeroSha = (s) => !s || /^0+$/.test(s);

// owner/name, from the CI's own variable first, then the origin remote. GitLab subgroups keep the
// last two parts, the same way FoxPlug names the repository.
function repoName(o) {
  const lastTwo = (p) => { const parts = String(p || "").replace(/\.git$/, "").split(/[/:]/).filter(Boolean); return parts.length >= 2 ? parts.slice(-2).join("/") : ""; };
  const cands = [
    o.repo, env.FOXPLUG_REPO, env.GITHUB_REPOSITORY, env.CI_PROJECT_PATH, env.BITBUCKET_REPO_FULL_NAME,
    env.CIRCLE_PROJECT_USERNAME && env.CIRCLE_PROJECT_REPONAME ? `${env.CIRCLE_PROJECT_USERNAME}/${env.CIRCLE_PROJECT_REPONAME}` : "",
    git(["remote", "get-url", "origin"]),
  ];
  for (const c of cands) { const r = lastTwo(c); if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r)) return r; }
  return "";
}

function releaseTag(o) {
  if (o.release) return o.release;
  if (env.CI_COMMIT_TAG) return env.CI_COMMIT_TAG;
  if (env.BITBUCKET_TAG) return env.BITBUCKET_TAG;
  if (env.CIRCLE_TAG) return env.CIRCLE_TAG;
  if (env.GITHUB_REF_TYPE === "tag" && env.GITHUB_REF_NAME) return env.GITHUB_REF_NAME;
  return "";
}

// The tag's own page, where the host has one we can name without an API call.
function tagUrl(tag) {
  const enc = encodeURIComponent(tag);
  if (env.CI_PROJECT_URL) return `${env.CI_PROJECT_URL}/-/tags/${enc}`;
  if (env.BITBUCKET_GIT_HTTP_ORIGIN) return `${env.BITBUCKET_GIT_HTTP_ORIGIN}/src/${enc}`;
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY) return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/releases/tag/${enc}`;
  const origin = git(["remote", "get-url", "origin"]) || "";
  const m = origin.match(/^(?:https:\/\/|git@)(github\.com|gitlab\.com|bitbucket\.org)[/:](.+?)(?:\.git)?$/);
  if (!m) return "";
  if (m[1] === "github.com") return `https://github.com/${m[2]}/releases/tag/${enc}`;
  if (m[1] === "gitlab.com") return `https://gitlab.com/${m[2]}/-/tags/${enc}`;
  return `https://bitbucket.org/${m[2]}/src/${enc}`;
}

function logSubjects(range, sinceIso) {
  const args = ["log", "--format=%s", "-n", "200"];
  if (range) args.push(range); else args.push(`--since=${sinceIso}`, "HEAD");
  const out = git(args);
  if (out == null) return null;
  return out.split("\n").map(subjectOf).filter(Boolean).reverse();
}

function buildRelease(tag, o) {
  // Only an annotated tag has a name of its own; a lightweight tag would report its commit's subject.
  const annotated = git(["tag", "-l", "--format=%(objecttype)", tag]) === "tag";
  const name = (annotated && subjectOf(git(["tag", "-l", "--format=%(contents:subject)", tag]))) || tag;
  let notes = "";
  if (o.notes) {
    try { notes = fs.readFileSync(o.notes, "utf8").trim(); } catch (e) { fail(`Could not read ${o.notes}: ${e.message}`); }
  } else {
    const prev = git(["describe", "--tags", "--abbrev=0", `${tag}^`]);
    const subs = logSubjects(prev ? `${prev}..${tag}` : tag, null) || [];
    notes = subs.slice(-60).map((s) => `- ${s}`).join("\n");
  }
  return { event: "release", release: { name: name === tag ? tag : `${tag}: ${name}`, tag, notes: notes.slice(0, 3800), url: tagUrl(tag) } };
}

function buildPush(o) {
  if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") fail("This is not a git repository. Run it from your repository's folder.");
  let range = "";
  const before = o.since || env.CI_COMMIT_BEFORE_SHA || env.FOXPLUG_SINCE || "";
  if (!zeroSha(before)) range = `${before}..HEAD`;
  const today = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  let subjects = logSubjects(range, today);
  if (subjects == null && range) {
    console.log(`foxplug: ${before} is not in this checkout (a shallow clone?), so today's commits are sent instead.`);
    subjects = logSubjects("", today);
  }
  if (subjects == null) fail("git log failed. Is git installed, and does the checkout have history?");
  const branch = env.CI_COMMIT_BRANCH || env.BITBUCKET_BRANCH || env.CIRCLE_BRANCH || env.GITHUB_REF_NAME || git(["rev-parse", "--abbrev-ref", "HEAD"]) || "";
  return { event: "push", branch, commits: [...new Set(subjects)].map((subject) => ({ subject })) };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(HELP); return; }
  if (o.version) { console.log(VERSION); return; }

  const repo = repoName(o);
  if (!repo) fail("Could not tell the repository's name. Pass --repo owner/name.");
  const tag = releaseTag(o);
  const payload = { ...(tag ? buildRelease(tag, o) : buildPush(o)), repo, client: "npm" };
  if (o.project) payload.project = o.project;
  if (payload.event === "push" && !payload.commits.length) {
    console.log("foxplug: no new commits, so nothing is sent."); return;
  }

  if (o.dryRun) { console.log(JSON.stringify(payload, null, 2)); console.log("foxplug: dry run, nothing was sent."); return; }
  const token = String(env.FOXPLUG_TOKEN || "").trim();
  if (!token) fail(`No FOXPLUG_TOKEN. Get your project token at ${TOKEN_PAGE} and set it as a secret variable named FOXPLUG_TOKEN.`);

  let res, body = {};
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
    body = await res.json().catch(() => ({}));
  } catch (e) {
    console.log(`foxplug: FoxPlug could not be reached (${e.message}). Your build is not affected; the next run sends again.`);
    return;
  }
  console.log(`foxplug: ${String(body.message || `FoxPlug answered ${res.status}.`)}`);
  // A wrong or revoked token stops the step so it gets noticed; FoxPlug being down never fails a build.
  if (res.status === 400 || res.status === 401 || res.status === 404) process.exitCode = 1;
}

main();
