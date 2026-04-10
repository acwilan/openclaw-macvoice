# Contributing to openclaw-macvoice

Thanks for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/acwilan/openclaw-macvoice.git`
3. Install dependencies: `npm install`
4. Build the project: `npm run build`

## Development

### Requirements

- macOS 13.0+
- Node.js 18+
- [voicecli](https://github.com/acwilan/voicecli) installed

### Project Structure

```
openclaw-macvoice/
├── src/
│   └── index.ts          # Main plugin source
├── dist/                 # Compiled output
├── package.json          # Package manifest
├── tsconfig.json         # TypeScript config
└── README.md             # Documentation
```

### Building

```bash
# Development build with watch
npm run dev

# Production build
npm run build
```

## Commit Message Format

This project uses **Conventional Commits**. All commit messages must follow this format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `style:` — Code style (formatting, semicolons, etc.)
- `refactor:` — Code refactoring
- `test:` — Adding or updating tests
- `chore:` — Build, CI, tooling changes
- `ci:` — CI/CD changes

### Examples

```
feat: add support for custom temp directories
fix: handle voicecli not found error gracefully
docs: update README with new configuration options
refactor: extract shell escaping to utility function
chore: update dependencies
ci: add release workflow for ClawHub publishing
```

## Submitting Changes

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes following conventional commits
3. Run tests: `npm test`
4. Push to your fork
5. Open a Pull Request

## Code Style

- Use TypeScript strict mode
- Prefer async/await over callbacks
- Add JSDoc comments for public APIs
- Keep functions focused and small

## Reporting Issues

When filing an issue, please include:

- macOS version
- Node.js version
- Steps to reproduce
- Expected vs actual behavior
- Error messages or stack traces

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
