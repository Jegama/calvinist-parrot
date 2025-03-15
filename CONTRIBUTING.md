# Contribute to Conversify

## How to set up the project

### Prerequisites

You will need to have the following installed on your machine:

- Node.js 18.18.0 or higher
- npm (comes with Node.js)

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

4. **Environment variables**

* Copy `.env.template` to `.env`
* Fill in required credentials and API keys

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

**Note:** It’s important to regularly sync your fork, especially before starting a new change.

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