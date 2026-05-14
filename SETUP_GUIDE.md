# Finance Tracker - Setup & Run Guide

## Prerequisites
- Docker & Docker Compose installed
- OR Node.js (v16 or higher), PostgreSQL (v12 or higher), and npm

## Quick Start with Docker (Recommended)

The entire application (backend, frontend, and database) runs in Docker containers.

### 1. Start the Application

```bash
# Navigate to project root
cd Webll-Final-Finance-Tracker

# Start all services
docker-compose up -d

# Wait for services to be ready (about 30 seconds)
```

### 2. Access the Application
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000/api
- **Database:** localhost:5432 (accessible from containers)

### 3. Stop the Application

```bash
# Stop all services
docker-compose down

# Stop and remove data
docker-compose down -v
```

### Docker Services

- **db** - PostgreSQL 15 database
- **server** - Express.js backend API
- **client** - React frontend application

---

## Manual Setup (Without Docker)

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### 1. Database Setup
First, create a PostgreSQL database:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE finance_tracker;

# Exit psql
\q
```

### 2. Backend Setup

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Create .env file (already provided)
# Update DATABASE_URL if needed in .env file

# Start the server
npm run dev
```

The backend will run on `http://localhost:5000`

### 3. Frontend Setup

```bash
# In a new terminal, navigate to client directory
cd client

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will run on `http://localhost:3000`

---

## Useful Docker Commands

```bash
# View logs from all services
docker-compose logs -f

# View logs from specific service
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f db

# Execute command in running container
docker-compose exec server npm run dev
docker-compose exec db psql -U postgres -d finance_tracker

# Rebuild services
docker-compose build

# Remove everything (including data)
docker-compose down -v
```

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user info

### Transactions
- `GET /api/transactions` - Get all transactions
- `GET /api/transactions/:id` - Get transaction by ID
- `POST /api/transactions` - Create new transaction
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create custom category
- `DELETE /api/categories/:id` - Delete category

### Dashboard
- `GET /api/dashboard/summary` - Get financial summary
- `GET /api/dashboard/monthly` - Get monthly breakdown
- `GET /api/dashboard/categories` - Get category breakdown

## Features Implemented

✅ User authentication (register, login, logout)
✅ Add, edit, and delete transactions
✅ Categorize income and expenses
✅ View financial dashboard with balance summary
✅ Filter transactions by category or type
✅ Basic analytics (monthly spending, category breakdown)
✅ Responsive design
✅ JWT-based authentication
✅ Docker containerization

## Default Categories

**Income:**
- Salary
- Bonus
- Investment
- Other Income

**Expense:**
- Food & Dining
- Transportation
- Utilities
- Entertainment
- Shopping
- Health
- Education
- Other Expense

## Environment Variables

### Docker Setup
Variables are pre-configured in `docker-compose.yml`:
```
DATABASE_URL=postgresql://postgres:password@db:5432/finance_tracker
JWT_SECRET=your_secure_jwt_secret_key_change_this_in_production
PORT=5000
NODE_ENV=development
```

### Manual Setup (.env files)

**Backend (server/.env):**
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/finance_tracker
JWT_SECRET=your_secure_jwt_secret_key_change_this
PORT=5000
NODE_ENV=development
```

### Frontend
The frontend uses environment defaults. 
- In Docker: API URL is automatically set to `http://server:5000/api`
- Manually: API URL defaults to `http://localhost:5000/api`

---

## Troubleshooting

### Docker Issues
- **Containers won't start:** Check Docker Desktop is running
- **Port already in use:** Stop existing containers or change ports in `docker-compose.yml`
- **Database connection error:** Ensure `db` service is healthy: `docker-compose logs db`

### Manual Setup Issues
- **Database Connection Error:** Ensure PostgreSQL is running and DATABASE_URL is correct
- **Port Already in Use:** Change PORT in .env or stop conflicting process
- **CORS Errors:** Backend has CORS enabled, check API URL configuration

---

## Project Structure

```
server/
├── src/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── transactions.ts
│   │   ├── categories.ts
│   │   └── dashboard.ts
│   ├── db.ts
│   ├── schema.ts
│   ├── utils.ts
│   └── middleware.ts
├── app.ts
├── Dockerfile
└── package.json

client/
├── src/
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── Dashboard.tsx
│   │   └── Transactions.tsx
│   ├── components/
│   │   ├── Navigation.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── TransactionForm.tsx
│   │   └── TransactionList.tsx
│   ├── hooks/
│   │   └── useAuth.ts
│   ├── context/
│   │   └── AuthContext.tsx
│   ├── services/
│   │   └── api.ts
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts
├── Dockerfile
└── package.json

docker-compose.yml
.dockerignore
```

