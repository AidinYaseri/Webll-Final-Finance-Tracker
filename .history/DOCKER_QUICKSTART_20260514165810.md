# 🐳 Finance Tracker - Docker Quick Start

## ⚡ Quick Start (Docker)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running

### Run the Application

```bash
# Navigate to project root
cd Webll-Final-Finance-Tracker

# Start all services (database, backend, frontend)
docker-compose up -d

# Wait for services to initialize (30-60 seconds)
docker-compose logs -f
```

### Access the Application
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000/api

### Default Login
Use any credentials you register with. Example:
- Username: `testuser`
- Password: `password123`

### Stop the Application
```bash
# Stop all services
docker-compose down

# Stop and remove data
docker-compose down -v
```

---

## 📋 What's Running

| Service | Port | Description |
|---------|------|-------------|
| **client** | 3000 | React Frontend |
| **server** | 5000 | Express Backend API |
| **db** | 5432 | PostgreSQL Database |

---

## 🔧 Useful Commands

```bash
# View logs
docker-compose logs -f
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f db

# Execute commands in containers
docker-compose exec server npm run dev
docker-compose exec db psql -U postgres -d finance_tracker

# Rebuild images
docker-compose build

# View running containers
docker-compose ps

# Stop all services
docker-compose stop

# Start services again
docker-compose start
```

---

## 🆘 Troubleshooting

### Containers won't start?
```bash
# Check Docker is running
docker --version

# Check logs
docker-compose logs
```

### Port 3000 or 5000 already in use?
Edit `docker-compose.yml` and change the port mapping:
```yaml
server:
  ports:
    - "5001:5000"  # Changed from 5000:5000
client:
  ports:
    - "3001:3000"  # Changed from 3000:3000
```

### Database connection issues?
```bash
# Check if DB is healthy
docker-compose logs db

# Restart database
docker-compose restart db
```

### Need to check database directly?
```bash
# Connect to PostgreSQL in container
docker-compose exec db psql -U postgres -d finance_tracker

# View tables
\dt

# View users
SELECT * FROM users;

# Exit
\q
```

---

## 📁 Docker Files

- **docker-compose.yml** - Defines all services and their configuration
- **server/Dockerfile** - Node.js backend container
- **client/Dockerfile** - React frontend container
- **.dockerignore** - Files to exclude from Docker build

---

## 🌐 Accessing from Other Machines

To access the app from another computer on your network:

1. Find your machine's IP: `ipconfig` (look for IPv4 Address)
2. Access frontend: `http://<YOUR_IP>:3000`
3. Backend API: `http://<YOUR_IP>:5000/api`

---

## 📝 Environment Variables

All environment variables are configured in `docker-compose.yml`:

```yaml
DATABASE_URL=postgresql://postgres:password@db:5432/finance_tracker
JWT_SECRET=your_secure_jwt_secret_key_change_this_in_production
PORT=5000
NODE_ENV=development
```

**⚠️ Change JWT_SECRET in production!**

---

## 🚀 Full Setup Guide

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for:
- Manual setup without Docker
- Detailed API documentation
- Complete troubleshooting guide
- Project structure
