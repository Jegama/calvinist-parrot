# Contribute to Calvinist Parrot

## How to set up the project

### Prerequisites

You will need to have the following installed on your machine:

- Node.js 20.9.0 or higher
- npm (comes with Node.js)
- Docker, for the local Postgres database

### Environment Setup

1. **Fork this repository**

- Click the "Fork" button in the top right
- Follow the prompts to create your fork

2. **Clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/calvinist-parrot.git
cd calvinist-parrot
```

3. **Install dependencies**

```bash
npm install
```

4. **Environment variables and database**

* Copy `.env.template` to `.env`
* Fill in required credentials and API keys
* Start the local database and apply migrations:

```bash
npm run db:up
npm run db:migrate
npm run db:seed
```

5. **Run the development server**

```bash
npm run dev
```

## Contributing to the Project

1. **Add the original repository as a remote** to pull future updates:

```bash
git remote add upstream https://github.com/Jegama/calvinist-parrot.git
```

2. **Fetch the latest updates** from the original repository:

```bash
git fetch upstream
```

3. **Create a new branch** for your changes:

```bash
git checkout -b mychange upstream/master
```

### Code quality standards

These standards apply to human and AI contributors.

#### Check for duplication during planning

Before implementing a change, search for overlapping functions, types, modules, and utilities. In the plan, list each relevant match and say how you will reuse or extend it. If the search finds no overlap, say where you looked. Start with the feature you are changing. Shared application logic lives in `lib/`, shared UI and hooks in `components/` and `hooks/`, and existing utilities in `utils/`. For Python worker changes, search `services/sermon-evaluator/`.

#### Simplicity is a requirement

> “Any fool can make something complicated. It takes a genius to make it simple.” — attributed to Woody Guthrie
>
> “If you can't explain it simply, you don't understand it well enough.” — attributed to Albert Einstein

The simplest design that meets the issue’s acceptance criteria is the correct one. Start every plan and PR description with these two sections, before technical details.

1. **Plain-language summary.** In at most three sentences, explain what changes and why it matters in terms a non-engineer could repeat. Leave out file paths, code identifiers, and ticket numbers.
2. **Simpler alternative rejected.** Name the smaller change you considered and the specific acceptance criterion it would miss. If it meets every criterion, use it.

Added complexity must serve a current acceptance criterion. For any of the following, the plan must also name a second consumer that already exists or link the GitHub issue that needs it. Without one, choose the smaller design.

- An abstraction, interface, or base class with one implementation.
- A setting, flag, or option nobody asked to control.
- A registry, plugin system, or event bus serving one case.
- A new dependency for a task an existing module or the standard library already handles.
- A generalization intended only for future use.

### Making Changes

1. Make your changes to the code.

2. **Commit your changes**:

```bash
git add .
git commit -m "Describe your changes here"
```

### Submitting Changes

1. **Push your changes** to your fork:

```bash
git push origin mychange
```

2. Go to your fork on GitHub. You should see a `Compare & pull request` button. Click it to create a pull request.

- When creating the pull request, you can choose to allow maintainers to make edits. This is helpful if they need to make minor adjustments before merging.

### Pull requests and versioning

Open a PR against `master` when a change is intended to land and can be explained, tested, and reviewed as one outcome. This includes documentation, dependency, and tooling changes. Update the existing PR for follow-up fixes to the same work. Open a draft when early feedback on an API, migration, or doctrinal policy would change the implementation. Research that ends in an answer can stay in the discussion.

In the PR description, say who is affected, how you verified the change, and which release impact applies. Choose the highest applicable row and explain it in one sentence.

| Impact | When to choose it | Example from this repository |
| --- | --- | --- |
| **Major** | Existing integrations or supported deployments must change to keep working, or users lose a supported workflow without a compatible path. Describe the replacement and migration. | Retiring Counsel of Three made existing Q&A requests return HTTP 410. Callers must move to the chat API. [#84](https://github.com/Jegama/calvinist-parrot/pull/84) |
| **Minor** | People gain a capability, including an opt-in feature, or an integration gains a compatible operation. Use minor for a material, compatible change in how the app classifies churches or gives pastoral guidance. | Invited users gained private sermon evaluation and report downloads. [#82](https://github.com/Jegama/calvinist-parrot/pull/82) |
| **Patch** | A compatible change restores intended behavior, improves reliability or performance, or fixes a security issue in the running app or worker. | A sermon that finished scoring could fail to produce a report on a read-only worker. The fix lets that evaluation finish. [#90](https://github.com/Jegama/calvinist-parrot/pull/90) |
| **None** | The change affects contributor workflows, tests, formatting, or internals only. Routine dependency updates qualify when the app's behavior, security, and deployment requirements stay the same. | The PR review skill changed how contributors work. [#91](https://github.com/Jegama/calvinist-parrot/pull/91) |

Judge model, prompt, and dependency updates by their effect on this app. A prompt fix that restores a documented rule is a patch. A new evaluation capability is minor. An upstream library's own major version can still mean no app bump. Call out any change to where personal data is sent, who can use a gated feature, or what an operator must configure.

Merging to `master` deploys the app to production. Every PR with major, minor, or patch impact ships its version bump and release notes in that same PR. For `none`, explain the impact in the PR description.

#### Cutting a release

1. Read the app version on the latest `master` and apply the PR's highest impact once. From `2.0.0`, a breaking change becomes `3.0.0`, a compatible feature becomes `2.1.0`, and a fix becomes `2.0.1`.
2. On the feature or fix branch, run `npm version <version> --no-git-tag-version`. Verify that `package.json` and both root version entries in `package-lock.json` agree. Add a dated heading for that version to the [changelog](./CHANGELOG.md). Describe the changes users or operators will see, link the PR, and include migration instructions for breaking changes.
3. Before merging, check the version and changelog against the latest `master`. If another release landed first, recalculate the bump, preserve its release notes, and recheck CI. Use the date of the planned production merge for the heading.
4. After the maintainer confirms the production deployment, tag the deployed commit `vX.Y.Z` and publish its changelog section as the GitHub Release. Include any invitation or rollout limits in the release notes.

The API route namespace, OpenAPI document, sermon worker package, and prompt identifiers have their own versions. For a public contract change, review its API version separately, regenerate the OpenAPI file with `npm run openapi:generate`, and include it in the contract PR.

### Updating Your Branch

If you need to make more changes after your initial commit:

1. Make the changes locally.

2. **Amend your previous commit** if you want to keep it as a single commit (optional):

```bash
git add .
git commit --amend --no-edit
```

3. **Force push** your changes (since you've amended the commit):

```bash
git push -f origin mychange
```

### Keeping Your Fork Updated

To keep your fork up to date with the original repository:

1. **Fetch updates** from the upstream:

```bash
git fetch upstream
```

2. **Merge updates into your master branch**:

```bash
git checkout master
git merge upstream/master
```

3. **Push updates to your fork**:

```bash
git push origin master
```

**Note:** It's important to regularly sync your fork, especially before starting a new change.

### Code Style Guidelines

- Use TypeScript for all new code
- Follow the existing code style
- Use ESLint and Prettier for code formatting
- Write tests for new features
- Update documentation when needed

### Need Help?

If you need help with anything, feel free to:
- Open an issue
- Ask questions in pull requests
- Contact the maintainers

Thank you for contributing!
