## Outcome

<!-- What user or contributor outcome does this pull request deliver? -->

## Scope

<!-- Summarize the implementation and explicitly note what is out of scope. -->

## Validation

- [ ] `pnpm verify` passes locally
- [ ] Tests cover changed behavior, or the reason tests are unnecessary is below
- [ ] Documentation is updated for public contracts or workflows

Validation details:

<!-- Add focused commands, fixtures, or manual checks. -->

## Local-first and compatibility review

- [ ] User media remains in the browser
- [ ] Browser-held provider credentials are not logged, put in URLs, or sent to the Director Open Worker
- [ ] Existing persisted project IDs and behavior remain compatible, or migration details are below
- [ ] No secrets, account IDs, personal paths, private URLs, build output, or generated artifacts are committed
- [ ] AI-proposed edits still require validation and explicit human Apply

Compatibility or privacy notes:

<!-- Explain any relevant persistence, network, export, or rendering impact. -->

## Plugin checklist

<!-- Delete this section when the pull request is not a plugin contribution. -->

- [ ] The plugin ID is unique and stable
- [ ] Parameters include defaults and UI hints
- [ ] Rendering is deterministic
- [ ] A golden-frame fingerprint test is included
- [ ] Core picker/rendering files were not changed unnecessarily

Closes #
