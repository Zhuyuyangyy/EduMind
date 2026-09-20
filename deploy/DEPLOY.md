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

## Update

```bash
docker compose pull
docker compose up -d --build
docker image prune -f
```

## Rollback

Keep the previous uploaded deployment directory or image tag. To restore it, enter that directory and run:

```bash
docker compose up -d
docker compose ps
curl http://127.0.0.1:8255/api/health
```

The named volume `edumind_mysql_data` is retained across normal updates. Do not run `docker compose down -v` unless you intentionally want to delete all learning records.
