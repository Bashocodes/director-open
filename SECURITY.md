# Security Policy

## Supported versions

Director Open is currently pre-1.0. Security fixes are applied to the current
development branch and the latest published release only.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Latest published release | Yes |
| Earlier releases | No |

## Report a vulnerability privately

**Publication blocker:** replace `[PRIVATE SECURITY CONTACT]` with a monitored
private email address or enable GitHub private vulnerability reporting before
making this repository public.

Until that contact is configured, repository collaborators should report
suspected vulnerabilities directly to the owner through an established
private channel. Do not open a public issue, discussion, or pull request for a
suspected vulnerability.

Please include:

- A description of the vulnerability and its impact
- Reproduction steps or a minimal proof of concept
- Affected versions, browsers, and operating systems
- Whether user media, browser-stored API keys, or exported files are involved
- Any suggested remediation, if known

Do not include real API keys, private media, or other sensitive personal data
in the report. Use synthetic test data.

## Response expectations

After a reporting contact has been configured, maintainers aim to acknowledge
complete reports within five business days. Validation, remediation, and
disclosure timing depend on severity and complexity. Reporters will be kept
informed when practical.

Please allow maintainers a reasonable opportunity to investigate and release a
fix before public disclosure.

## Security boundaries

Director Open is designed so media processing and browser-held provider
credentials remain client-side. Reports involving unintended network transfer,
credential disclosure, unsafe media parsing, local persistence, or exported
file integrity are especially important.
