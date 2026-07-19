# DevSecOps Infra

This repository contains reusable GitHub Actions workflows for the DevSecOps pipeline.

## Reusable Workflows

- `security-scan.yml`: Secret detection (Gitleaks), SAST & SCA (SonarCloud), IaC misconfiguration (Trivy).
- `build-deploy.yml`: Docker multi-stage build, container image scan (Trivy), push to GAR, deploy to Cloud Run with health check and rollback.
- `dast-scan.yml`: Dynamic Application Security Testing (DAST) using OWASP ZAP on the deployed Cloud Run service.

---

## Setup Guide & Required GitHub Secrets

To run this pipeline successfully at $0 cost, configure the following secrets in your GitHub repositories:

### 1. `devsecops-infra` Repository
No secrets required. This is a shared repository hosting the reusable workflows.

### 2. `invoice-api` & `portal-fe` Repositories
Add these secrets under **Settings -> Secrets and variables -> Actions**:

*   **`GCP_PROJECT_ID`**: ID của dự án Google Cloud.
*   **`GCP_WORKLOAD_IDENTITY_PROVIDER`**: WIF Provider ID (ví dụ: `projects/123/locations/global/workloadIdentityPools/github-pool/providers/github-provider`).
*   **`GCP_SERVICE_ACCOUNT`**: Email của Service Account trên GCP (ví dụ: `my-sa@my-project.iam.gserviceaccount.com`).
    *   *Permissions needed*: Artifact Registry Writer, Cloud Run Admin, Service Account User, Secret Manager Secret Accessor.
*   **`SONAR_TOKEN`**: Authentication token from SonarCloud.
*   **`GOOGLE_CHAT_WEBHOOK`** *(Optional)*: Webhook URL of your Google Chat space to receive build/test/deploy notifications.
*   **`E2E_PAT_TOKEN`** *(Optional, Frontend only)*: A Personal Access Token (PAT) with `repo` scope to trigger E2E tests in the `e2e-tests` repository.
*   **`API_URL`** *(Frontend only)*: The backend URL (e.g. `https://invoice-api-xxxx-as.a.run.app`) for server-side fetching.

### 3. `e2e-tests` Repository (Playwright)
*   **`GOOGLE_CHAT_WEBHOOK`** *(Optional)*: Webhook URL of your Google Chat space to receive E2E/Smoke Test results.

---

## Best Practices Implemented
1.  **$0 Cost**: Relies on free tiers (GitHub Actions, Google Cloud Run, Supabase PostgreSQL, Google AI Studio, SonarCloud).
2.  **Server-side Secrets Injection**: Next.js `API_URL` is kept on the server to prevent leakage to client browsers.
3.  **Automatic Migrations**: Database is automatically migrated via Prisma on backend container startup.
4.  **Non-Root Security**: Containers run under custom unprivileged users.
5.  **Safe DAST SARIF Reports**: Dynamic scan outputs are mapped and centralized in the GitHub Security tab.

