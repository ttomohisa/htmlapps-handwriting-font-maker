'use strict';
// This module is loaded only from the immutable trusted workflow revision.
module.exports = async ({ github, context, core }) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { owner, repo } = context.repo;
  const trigger = context.payload.workflow_run;
  if (!trigger || trigger.event !== 'pull_request' || trigger.conclusion !== 'success') return;
  const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: trigger.id });
  if (run.event !== 'pull_request' || run.conclusion !== 'success' ||
      run.repository.full_name !== `${owner}/${repo}` ||
      run.head_repository?.full_name !== `${owner}/${repo}` ||
      run.path !== '.github/workflows/preview.yml' ||
      !/^[a-f0-9]{40}$/.test(run.head_sha)) throw new Error('Unexpected source workflow');
  let prs = run.pull_requests || [];
  if (!prs.length) prs = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, { owner, repo, commit_sha: run.head_sha, per_page: 100 });
  const candidates = [];
  for (const candidate of prs) {
    const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: candidate.number });
    if (pr.state === 'open' && pr.head.repo?.full_name === `${owner}/${repo}` &&
        pr.base.repo.full_name === `${owner}/${repo}` && pr.head.sha === run.head_sha &&
        JSON.parse(process.env.ALLOWED_BASE_BRANCHES).includes(pr.base.ref)) candidates.push(pr);
  }
  if (candidates.length !== 1) { core.notice('Closed, stale, or ambiguous PR: no deployment'); return; }
  const pr = candidates[0];
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, { owner, repo, run_id: run.id, per_page: 100 });
  const sites = artifacts.filter(a => a.name === 'pr-preview-site' && !a.expired);
  if (sites.length !== 1 || sites[0].size_in_bytes > 1024 * 1024 * 1024) throw new Error('Missing, ambiguous, or oversized site artifact');
  if (process.env.DOWNLOAD_SITE === 'true') {
    const archive = await github.rest.actions.downloadArtifact({ owner, repo, artifact_id: sites[0].id, archive_format: 'zip' });
    fs.writeFileSync(path.join(process.env.RUNNER_TEMP, 'preview-site.zip'), Buffer.from(archive.data));
  }
  core.setOutput('number', String(pr.number));
  core.setOutput('sha', pr.head.sha);
  core.setOutput('preview_name', `r${pr.base.repo.id}-pr-${pr.number}`);
  core.setOutput('ready', 'true');
};
