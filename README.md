<p align="center">
  <a href="https://agents-tools.github.io/">
    <img src="sources/standard/profile/assets/icon.png" width="160" alt="agents icon">
  </a>
</p>

<h1 align="center">agents-tools.github.io</h1>

<p align="center">Source for the agents website.</p>

<p align="center">
  <a href="https://github.com/agents-tools/agents-tools.github.io/actions/workflows/ci.yml"><img src="https://github.com/agents-tools/agents-tools.github.io/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="https://agents-tools.github.io/">Website</a> ·
  <a href="#develop">Develop</a> ·
  <a href="#content-sources">Content sources</a> ·
  <a href="#contributing">Contributing</a>
</p>

## Overview

This repository builds the [agents website](https://agents-tools.github.io/) and its
[CLI reference](https://agents-tools.github.io/docs/cli/). It owns layout, navigation and section
headings. All product text and artwork are derived from pinned revisions of the organization catalog
and CLI documentation; Markdown is rendered at build time. The built site serves its fonts and
images locally and requires no JavaScript.

## Develop

Use Node.js 22 (22.22 or later; `.nvmrc` selects the current Node 22 release).

```sh
npm ci
npm run dev
```

Edit layout and rendering in `scripts/render-site.mjs`, Markdown handling in `scripts/markdown.mjs`,
and styles in `src/site.css`. Restart `npm run dev` after edits to regenerate the pages.

Install Chromium once, then run the complete local check:

```sh
npm run test:install
npm run check
```

The check verifies formatting, offline source digests and font reproduction, Markdown rendering,
generated HTML, the production build, internal links and anchors, and Playwright with axe. Browser
coverage includes both pages in light and dark at 1280, 375 and 320 px, image loading, runtime
requests, keyboard order and focus, navigation and horizontal overflow. The CI context is `site`;
the shared source policy produces `policy / policy`.

To capture full-page screenshots of the production build in light and dark at 1280 and 375 px:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
# In another terminal:
npm run screenshots
```

Review `.build/screenshots/{home,cli}-{light,dark}-{1280,375}.png`. Generated HTML, screenshots and
test evidence live in ignored `.build/`; Vite writes the deployable site to ignored `dist/`.

## Content sources

[`sources.json`](sources.json) records each file's owning repository, full revision, upstream path,
local path, SHA-256 and any transform. `sources/` holds the input files and derived assets. The font
license strips trailing spaces and tabs, with its upstream digest recorded as `source_sha256`. Never
edit these files by hand.

```sh
npm run sources:update
npm run sources:update -- --cli <full-sha> --core <full-sha> --standard <full-sha>
npm run sources:check
```

The updater reads GitHub's API, resolves each repository's `master` once unless a full SHA is
supplied, and fetches all files at those immutable revisions. An optional `GH_TOKEN` provides
authenticated API access. Unspecified repositories use their current `master`. Downloads are staged
in `.build/sources/` and removed when the update finishes. Review and commit `sources/` and
`sources.json` together.

The organization catalog supplies the promise, secondary line, description, mark, repository groups
and outcomes, footer links and maintainer line. Its images are raw GitHub URLs; the site serves only
their vendored copies, so each must be listed in `sources.json` (the CLI and core logos are vendored
from their repositories). The CLI README supplies Install, Usage and the demo's alternative text;
its demo SVGs supply Quick look. The CLI reference supplies `/docs/cli/`. Source-relative Markdown
links point to the owning revision on GitHub, except links to the CLI reference, which resolve
locally. Headings use GitHub-compatible anchors.

The organization supplies the social image, font files and licenses. Fonts are converted using the
lockfile-pinned `wawoff2` WebAssembly encoder; `sources:check` reproduces them and verifies all
input and output bytes without network access. The updater does not change the policy workflow pin.
Changes to that pin follow the organization's
[workflow integration guide](https://github.com/agents-tools/.github/blob/master/Documentation/Reference/WorkflowIntegration.md).

## Deployment

[Pages](.github/workflows/pages.yml) builds and deploys pushes to `master`, or manual runs on
`master`, to https://agents-tools.github.io/. Only the deployment job receives Pages and
identity-token write permissions. Its `pages` concurrency group does not cancel a running
deployment. CI and policy run on branch pushes, pull requests and manual dispatch; policy also runs
on pull-request title edits.

## Contributing

Read the organization's
[contributing guide](https://github.com/agents-tools/.github/blob/master/CONTRIBUTING.md) and
[maintenance change flow](https://github.com/agents-tools/.github/blob/master/MAINTENANCE.md#change-flow).
Run `npm run check` and review screenshots before proposing a website change. Product copy changes
belong in the owning repository, followed by a reviewed source update here.

## License

Available under the [MIT License](LICENSE). Vendored content retains its owning
[organization](sources/standard/LICENSE) and [CLI](sources/cli/LICENSE) notices. Google Sans Code is
licensed under the [SIL Open Font License 1.1](sources/standard/Brand/Fonts/OFL.txt).
