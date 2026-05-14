### Name:
Aidin Yaseri\
Felipe Mesa Parades
#  Personal Finance Tracker

##  Introduction

Our project is a web application made to help users track their
income and expenses in a simple and easy way. It allows users to
manage their financial data, understand their spending habits, and make
better financial decisions. This application is targeted at students and individuals who want an
hassle free tool to monitor their finances.

------------------------------------------------------------------------

## Core Features

-   User authentication (register, login, logout)
-   Add, edit, and delete transactions
-   Categorize income and expenses
-   View financial dashboard (balance, summaries)
-   Filter transactions by category or date
-   Basic analytics (monthly spending, category breakdown)

------------------------------------------------------------------------

##  User Stories

### Authentication

-   As a user, I want to register so I can create an account.
-   As a user, I want to log in so I can access my data.
-   As a user, I want to log out to secure my account.

### Transactions

-   As a user, I want to add a transaction so I can track my spending.
-   As a user, I want to view my transactions to see my financial history.
-   As a user, I want to edit a transaction to fix mistakes.
-   As a user, I want to delete a transaction when it is no longer
    needed.

### Categories

-   As a user, I want to categorize transactions to organize my expenses.
-   As a user, I want to filter transactions by category.

### Dashboard

-   As a user, I want to see my total balance.
-   As a user, I want to compare income and expenses.
-   As a user, I want to view summaries of my spending.

------------------------------------------------------------------------

## Database Design

### Entities

#### Users

-   user_id
-   username
-   email
-   password

#### Transactions

-   Transaction_id
-   user_id
-   amount
-   type (income or expense)
-   category_id
-   date
-   description

#### Categories

-   category_id
-   name

### Relationships

-   One user has many transactions
-   One category has many transactions\
  
![Alt Text](./md_images/web2Project_dbdiagram.png)
------------------------------------------------------------------------

##  API Endpoints

### Authentication

-   POST /api/auth/register
-   POST /api/auth/login
-   POST /api/auth/logout
-   GET /api/auth/me

### Transactions

-   GET /api/transactions
-   GET /api/transactions/:id
-   POST /api/transactions
-   PUT /api/transactions/:id
-   DELETE /api/transactions/:id

### Categories

-   GET /api/categories
-   POST /api/categories
-   DELETE /api/categories/:id

### Dashboard

-   GET /api/dashboard/summary
-   GET /api/dashboard/monthly
-   GET /api/dashboard/categories

------------------------------------------------------------------------

##  Authentication



------------------------------------------------------------------------

## Framework and tech

-   Frontend: React
-   Backend: Node.js and Express
-   Database: Postgres

------------------------------------------------------------------------

##  Optional Features

-   Budget limits per category
-   Spending alerts
-   Dark mode
-   Export data (CSV)
-   Recurring transactions


