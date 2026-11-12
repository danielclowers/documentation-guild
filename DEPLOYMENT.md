# Deployment setup

The current Worker configuration targets local D1. CI and the GitHub Pages workflow are in `.github/workflows/`.

## Clerk development instance

Enable username for sign-in and sign-up, enable password, and configure the user model so email and phone are disabled. Restrict public signup. Use the Backend API to provision users as part of the guild's own one-use invitation flow. The Worker will require active D1 membership independently of Clerk authentication. Verify username-only creation and password sign-in with a disposable development identity before relying on the configuration. Clerk's [user creation API](https://clerk.com/docs/reference/backend/user/create-user) takes its required fields from the instance settings. See the [authentication settings](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options) for identifier and password configuration.

Clerk configuration and credentials are still needed for the provider test. Use the Worker secret store for backend secrets. The publishable key belongs in the web build configuration.

## Cloudflare

Provision a separate staging Worker and D1 database before integration testing on Cloudflare. Bind the D1 database as `DB` with its actual database ID in a deployment configuration. Apply versioned migrations to that explicitly selected environment before running its health check. The local configuration uses an all-zero database ID and disables public Worker and preview URLs. The Durable Object binding and reconciliation Cron are later milestones.

## GitHub Pages

Use `danielclowers/documentation-guild`. Before creating or pushing, verify GitHub CLI identity with `gh api user -q .login`, SSH identity with `ssh -T git@github.com`, and the target remote with `git remote -v`. Configure **GitHub Actions** as the Pages source in repository settings. The included workflow builds and deploys from `main` with Vite's `/documentation-guild/` base path. Verify the environment URL from the workflow after it succeeds. [GitHub Pages custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
