# Contributing to @drawline/core

Thank you for your interest in contributing to Drawline Core! We welcome contributions from the community.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/Solvaratech/drawline-core.git
    cd drawline-core
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```

## Development

-   **Run tests**: `npm test` (or `npm run test:ui` for the browser interface)
-   **Run tests with coverage**: `npm run test:ci`
-   **Build the package**: `npm run build`
-   **Type check**: `npm run type-check`

## Pull Requests

1.  Create a new branch for your feature or bug fix:
    ```bash
    git checkout -b feature/amazing-feature
    ```
2.  Make your changes and commit them with descriptive commit messages. Please include tests for any new features or bug fixes.
3.  Push your changes to your fork:
    ```bash
    git push origin feature/amazing-feature
    ```
4.  Open a Pull Request on the main repository.
5.  **Verify CI Actions**: Ensure that your Pull Request passes the automated GitHub Actions CI. This pipeline verifies type-safety (`npm run type-check`) and executes the test suite (`npm run test:ci`).

## Code Style

Please ensure your code follows the existing style and conventions. We use Prettier for formatting.

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
