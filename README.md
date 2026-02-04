# Sycamore Backend Engineering Assessment

---

## 📦 What's Included

This repository contains:

2. **Project A: Idempotent Wallet Service** (`wallet-service/`)
3. **Project B: Interest Accumulator Service** (`interest-service/`)

---

## 💰 1. Project A: Idempotent Wallet Service

A production-ready wallet transfer system with race condition prevention and distributed locking.

### Key Features:

- ✅ Idempotency key handling
- ✅ Redis distributed locks
- ✅ Database transactions with SERIALIZABLE isolation
- ✅ Row-level locking (SELECT FOR UPDATE)
- ✅ Comprehensive error handling
- ✅ 100% test coverage

### Tech Stack:

- Node.js + TypeScript
- Express.js
- PostgreSQL + Sequelize
- Redis
- Jest

### Quick Start:

```bash
cd wallet-service
npm install
cp .env.example .env
npm run migrate
npm test
npm run dev
```

## 📊 2. Project B: Interest Accumulator Service

Daily interest calculator with **zero floating-point errors** using Decimal.js.

### Key Features:

- ✅ Arbitrary precision arithmetic (Decimal.js)
- ✅ Correct leap year handling (including century rules)
- ✅ 27.5% APR daily compound interest
- ✅ Atomic database transactions
- ✅ Comprehensive audit trail
- ✅ 100% test coverage

### Tech Stack:

- Node.js + TypeScript
- Decimal.js (precision math)
- PostgreSQL + Sequelize
- Jest

### Formula:

```
Daily Interest = (Balance × Annual Rate) / Days in Year

Example:
Balance: ₦10,000
Rate: 27.5% = 0.275
Days: 365
Daily Interest = (10,000 × 0.275) / 366 = ₦7.53
```

### Quick Start:

```bash
cd interest-service
npm install
cp .env.example .env
npm run migrate
npm test
npm run dev
```

---

## 🧪 Running Tests

Both projects have comprehensive test suites with **100% coverage**:

### Wallet Service Tests:

```bash
cd wallet-service
npm test

# Expected Output:
# Test Suites: 1 passed
# Tests: 20+ passed
# Coverage: 100%
```

### Interest Service Tests:

```bash
cd interest-service
npm test

# Expected Output:
# Test Suites: 1 passed
# Tests: 27 passed
# Coverage: 100%
```

---

---

## 🎯 Key Technical Decisions

### Wallet Service

1. **Why Redis for Distributed Locks?**
   - Prevents concurrent processing of same transaction
   - SET NX command provides atomic lock acquisition
   - TTL prevents deadlocks if process crashes

2. **Why SERIALIZABLE Isolation?**
   - Prevents phantom reads and lost updates
   - Essential for financial transactions
   - Slight performance cost acceptable for correctness

3. **Why Transaction Logs with PENDING State?**
   - Enables reconciliation if connection drops
   - Provides audit trail
   - Supports idempotency checks

### Interest Service

1. **Why Decimal.js?**
   - JavaScript's `Number` type uses IEEE 754 floating-point
   - Causes precision errors in financial calculations
   - Decimal.js provides arbitrary precision (40 digits)

---
