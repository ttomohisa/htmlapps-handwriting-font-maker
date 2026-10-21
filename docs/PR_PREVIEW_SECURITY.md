# PR preview security

PR builds run with a read-only token, no Cloudflare secrets, and no persisted checkout credentials. A default-branch workflow validates the source run, repository, open PR, current head SHA, and named artifact before deploying static files on a fresh runner. Artifact code, npm settings, and Wrangler configuration are never executed by the deployment job. The selective MT wrapper, where required, comes from the immutable trusted workflow revision.

Public HTTP and browser checks run against the deployed URL on separate runners with read-only repository access and no Cloudflare credentials. Existing browser checks and their evidence uploads are retained. A separate trusted job reports their result on the PR commit. Preview configuration changes take effect after merge into the default branch. Cleanup uses the trusted base workflow and never checks out PR content. Cloudflare secrets must remain scoped to the least privileges required; repository writers can change workflows, so this separation does not replace branch protection or review.

No Codex Security scan or paid scanning workflow is introduced.
