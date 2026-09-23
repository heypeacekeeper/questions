# Production rollback

Use this procedure when a production deployment is unhealthy or causes a serious regression.

## Before rollback

1. Open the failed deployment run in GitHub Actions.
2. Record the deployed Git commit SHA and the failure output.
3. Confirm the problem affects production and is not only a local browser or network issue.
4. Do not delete the failed deployment or its logs.

## Roll back with Cloudflare

Authenticate Wrangler using an API token with permission to deploy the Worker.

List recent deployments:

    npx wrangler deployments list

Identify the last known healthy version ID, then roll back:

    npx wrangler rollback <VERSION_ID>

Confirm the rollback when Wrangler asks for confirmation.

## Verify production

Check the health endpoint:

    curl --fail --show-error https://wouldyouratherquestions.org/api/health/

Check the homepage:

    curl --fail --show-error --head https://wouldyouratherquestions.org/

Check the deployment manifest:

    curl --fail --show-error https://wouldyouratherquestions.org/deployment-manifest.json

Confirm that:

- The health endpoint reports `"ok": true`.
- The homepage returns HTTP 200.
- The deployment manifest contains the expected previous Git commit.
- The game loads and displays questions.
- Contact and question-submission forms load normally.

## Follow-up

1. Record the rolled-back version ID and Git commit in the failed deployment run.
2. Open an issue describing the production failure and rollback.
3. Fix the problem on a new branch.
4. Run the complete CI suite before attempting another deployment.
5. Do not redeploy the failed commit.
