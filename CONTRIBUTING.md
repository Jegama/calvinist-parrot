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

For major, minor, or patch impact, add a short entry under `Unreleased` in the [changelog](./CHANGELOG.md) in the same PR. Describe what the person can do, what was fixed, or what they must change. Link the PR once its number is available. For `none`, the reason in the PR description is sufficient.

#### Cutting a release

1. Open a release PR when the first change with major, minor, or patch impact merges. Group subsequent changes in that PR and review it at the next production rollout. An urgent fix can go out on its own.
2. Choose the highest impact since the last numbered release and apply it once. From `1.0.0`, a batch containing a breaking change becomes `2.0.0`, compatible features become `1.1.0`, and fixes alone become `1.0.1`. Fold related entries together and give breaking changes a migration note.
3. On the release branch, run `npm version <version> --no-git-tag-version` with the chosen number. Verify `package.json` and both root version entries in `package-lock.json` agree. Move the entries to a dated version heading and keep an empty `Unreleased` heading for the next change. The API route namespace, OpenAPI document, sermon worker package, and prompt identifiers have their own versions. For a public contract change, review its API version separately, regenerate the OpenAPI file with `npm run openapi:generate`, and include it in the contract PR.
4. Verify the release PR against CI. Once the maintainer confirms the production rollout, tag the released commit `vX.Y.Z` and publish the matching changelog section as the GitHub Release. Identify any invitation or rollout limits in the release notes.

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
