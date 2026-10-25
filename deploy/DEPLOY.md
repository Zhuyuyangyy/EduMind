# 智学星枢服务部署

This package starts three containers: Nginx (web), Node.js (API), and MySQL.
Only Nginx is exposed to the host. The API and database remain on an internal Docker network.

## Server prerequisites

- Docker Engine 27+ and Docker Compose v2
- At least 2 CPU cores, 4 GB RAM, and 10 GB free disk space
- Port 8255 open in the server firewall (and port 443 when HTTPS is configured)

## Deploy

```bash
unzip edumind-deploy.zip -d edumind
cd edumind
cp deploy/.env.production.example .env
nano .env
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8255/healthz
curl http://127.0.0.1:8255/api/health
```

Do not put `VITE_DEEPSEEK_API_KEY` in this deployment. The model key is consumed only by the API container.

## HTTPS

The bundle serves HTTP on port 8255 for competition/LAN deployment. For a public domain, put Caddy, Certbot-managed Nginx, or your cloud load balancer in front of this service and terminate TLS on port 443. Keep `/api` on the same origin.

The supplied production template binds the web port to `127.0.0.1` for a host-side TLS proxy. Existing LAN usage can explicitly set `APP_BIND_ADDRESS=0.0.0.0`; restrict that port with the deployment firewall. This bundle does not provision certificates or expose a validated public payment callback by itself.

## Payment configuration and acceptance

Sales remain disabled by default. Compose passes `PAYMENT_BASE_URL`, the server-only `VIBE_PAY_*` application configuration, product price and the explicit sale switch into the API container. The production gateway and environment configuration source are fixed in Compose; never mount the development `.alipay-sandbox.json` into production. Set real values locally or through deployment secret management, never send production private keys to an Agent.

Use `docker compose config --quiet` to validate interpolation without printing secrets. Do not publish full rendered Compose configuration or `docker inspect` output, which can contain environment credentials.

Before enabling sales: deploy the reviewed account/data-isolation baseline; verify authenticated API behavior; configure HTTPS and the matching formal application/product; verify signed public notifications and query compensation; test a specifically approved small payment and refund; and verify actual product delivery and entitlement enforcement. A successful build or sandbox payment does not satisfy these release conditions.

The GitHub `Production container smoke (sales disabled)` job builds these images and tests a fresh MySQL fixture, registration/login, role boundaries, denied anonymous access and disabled sales through Nginx. It never calls a model or initiates a payment. It does not validate your production server, account activation, certificates or public callback.

## Update

```bash
docker compose pull
docker compose up -d --build
```

## Rollback

Keep the previous uploaded deployment directory, a separately tagged image and a verified database backup. The command below only restarts that directory's configured images; reverting image tags, database migrations and restoring backups must be validated separately. Do not assume that an old directory using a mutable image tag proves rollback works. To restart the selected deployment, enter that directory and run:

```bash
docker compose up -d
docker compose ps
curl http://127.0.0.1:8255/api/health
```

The named volume `edumind_mysql_data` is retained across normal updates. Do not run `docker compose down -v` unless you intentionally want to delete all learning records.
