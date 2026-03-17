# 🐳 Phase 2: Docker Containerization

## Overview

ระบบตอนนี้ประกอบด้วย 3 containers:
- **app** - Node.js backend (port 3000)
- **postgres** - PostgreSQL database (port 5432)
- **redis** - Redis cache (port 6379)

## Prerequisites

- Docker Desktop (Windows/Mac)
- Docker Engine + Docker Compose (Linux)
- `.env` file with credentials

## Quick Start

### 1. Setup environment
```bash
cp .env.docker .env
# Edit .env with your credentials
```

### 2. Build and run
```bash
docker-compose up --build
```

Server starts at: `http://localhost:3000`

### 3. First time setup
```bash
# Run migrations (if using Prisma)
docker-compose exec app npx prisma migrate deploy

# Create admin user
docker-compose exec app node make-admin.js
```

## Commands

### View logs
```bash
docker-compose logs -f app        # Backend logs
docker-compose logs -f postgres   # Database logs
docker-compose logs -f redis      # Cache logs
docker-compose logs -f            # All services
```

### Access PostgreSQL
```bash
docker-compose exec postgres psql -U postgres -d carwash
```

### Execute command in container
```bash
docker-compose exec app npm test
docker-compose exec app node script.js
```

### Rebuild image
```bash
docker-compose up --build
```

### Stop all services
```bash
docker-compose down
```

### Remove everything (including volumes)
```bash
docker-compose down -v
```

## Files

- `Dockerfile` - Node.js multi-stage build
- `docker-compose.yml` - Service orchestration
- `.dockerignore` - Exclude files from Docker build
- `.env.docker` - Environment template
- `scripts/init.sql` - Database initialization

## Database Migration

### SQLite → PostgreSQL

PostgreSQL schema is automatically created via `scripts/init.sql`

**To migrate from existing SQLite:**
```bash
# Export SQLite data
sqlite3 data/carwash.db ".dump" > backup.sql

# Import to PostgreSQL (manually map SQL syntax)
docker-compose exec postgres psql -U postgres -d carwash < backup.sql
```

## Environment Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `NODE_ENV` | production | Node environment |
| `DB_HOST` | postgres | Database host |
| `DB_PORT` | 5432 | Database port |
| `DB_NAME` | carwash | Database name |
| `DB_USER` | postgres | Database user |
| `DB_PASSWORD` | postgres | Database password |
| `REDIS_HOST` | redis | Redis host |
| `REDIS_PORT` | 6379 | Redis port |
| `GMAIL_USER` | email@gmail.com | Gmail for OTP |
| `GMAIL_PASS` | app-password | Gmail app password |
| `SCB_API_KEY` | xxx | SCB API key |
| `SCB_SANDBOX` | true | Use SCB sandbox |

## Port Mappings

| Service | Internal | External |
|---------|----------|----------|
| App | 3000 | 3000 |
| PostgreSQL | 5432 | 5432 |
| Redis | 6379 | 6379 |

## Volume Mounts

| Volume | Purpose |
|--------|---------|
| `postgres_data` | PostgreSQL data persistence |
| `redis_data` | Redis data persistence |
| `./public` | Frontend files |
| `./src` | Source code |

## Health Checks

All services have health checks:
- App: HTTP GET `/health` (30s interval)
- PostgreSQL: `pg_isready` (10s interval)
- Redis: `PING` command (10s interval)

## Development vs Production

### Development
```bash
NODE_ENV=development
docker-compose up
```

### Production
```bash
NODE_ENV=production
# Use secrets for passwords
# Setup backup strategy
# Configure logging aggregation
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Container won't start
```bash
# View logs
docker-compose logs app

# Check container status
docker-compose ps

# Rebuild
docker-compose down
docker-compose up --build
```

### Database connection error
```bash
# Verify database is running
docker-compose exec postgres pg_isready

# Check network
docker network ls
docker network inspect carwash_carwash-network
```

### Port already in use
```bash
# Change port in docker-compose.yml
# Or kill process using port
lsof -i :3000
kill -9 <PID>
```

## Production Deployment

### Option 1: Docker Swarm
```bash
docker swarm init
docker stack deploy -c docker-compose.yml carwash
```

### Option 2: Kubernetes
```bash
kubectl create namespace carwash
kubectl apply -f k8s/ -n carwash
```

### Option 3: Cloud Platforms
- **AWS ECS**: Push image to ECR, create ECS service
- **Google Cloud Run**: Push image to Container Registry
- **Azure Container Instances**: Deploy from image
- **DigitalOcean App Platform**: Connect GitHub repo

## Next Steps

1. **Setup CI/CD** - GitHub Actions to auto-build and push image
2. **Setup Monitoring** - Prometheus + Grafana for metrics
3. **Setup Logging** - ELK stack for centralized logs
4. **Setup Backup** - Automated PostgreSQL backups
5. **Setup SSL/TLS** - HTTPS with Let's Encrypt

## Resources

- Docker: https://docs.docker.com/
- Docker Compose: https://docs.docker.com/compose/
- PostgreSQL in Docker: https://hub.docker.com/_/postgres
- Redis in Docker: https://hub.docker.com/_/redis
