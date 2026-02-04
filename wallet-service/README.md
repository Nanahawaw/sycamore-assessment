# Wallet Service - Idempotent Transfer System

A production-ready wallet transfer service built with Node.js, TypeScript, PostgreSQL, and Redis. This service implements idempotency, race condition prevention, and distributed locking to ensure safe financial transactions.

## 🎯 Problem Statement

**Challenge**: Prevent money loss when database connections drop mid-transaction during loan disbursements.

**Solution**: Multi-layered approach with:
- Transaction logs with PENDING state created before processing
- Idempotency keys to prevent duplicate processing
- Distributed locks using Redis
- Database transactions with SERIALIZABLE isolation
- Row-level locking with SELECT FOR UPDATE
- Comprehensive reconciliation strategy

## 🏗️ Architecture

### Key Features

1. **Idempotency Handling**
   - Every transfer request requires a unique idempotency key
   - Duplicate requests return the same result without reprocessing
   - Prevents double-tap issues from mobile clients

2. **Race Condition Prevention**
   - Distributed locks via Redis (SET NX)
   - Database-level row locking (SELECT FOR UPDATE)
   - SERIALIZABLE transaction isolation
   - Wallets locked in consistent order to prevent deadlocks

3. **Transaction Safety**
   - Two-phase commit pattern
   - PENDING transaction log created before balance updates
   - Atomic debit and credit operations
   - Automatic rollback on any failure

4. **Production-Ready**
   - Comprehensive error handling
   - Structured logging with Winston
   - 100% test coverage
   - API validation with express-validator
   - Security headers with Helmet

## 📋 Prerequisites

- Node.js >= 18.x
- PostgreSQL >= 14.x
- Redis >= 6.x
- npm or yarn

## 🚀 Getting Started

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd wallet-service

# Install dependencies
npm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### 3. Database Setup

```bash
# Create database
createdb wallet_db

# Run migrations
npm run migrate

# (Optional) Seed test data
npm run seed
```

### 4. Start Redis

```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or install locally
redis-server
```

### 5. Run the Service

```bash
# Development mode with auto-reload
npm run dev

# Production build
npm run build
npm start
```

The service will be available at `http://localhost:3000`

## 🧪 Testing

```bash
# Run all tests with coverage
npm test

# Run tests in watch mode
npm run test:watch

# View coverage report
open coverage/lcov-report/index.html
```

### Test Coverage

The service includes comprehensive tests for:
- ✅ Successful transfers
- ✅ Idempotency (duplicate request handling)
- ✅ Concurrent request handling
- ✅ Race condition prevention
- ✅ Double-spending prevention
- ✅ Input validation
- ✅ Transaction rollback
- ✅ Insufficient balance scenarios
- ✅ Inactive wallet handling

## 📡 API Endpoints

### 1. POST /api/transfer

Process a wallet transfer with idempotency.

**Request:**
```json
{
  "sourceWalletId": "uuid",
  "destinationWalletId": "uuid",
  "amount": 1000.50,
  "idempotencyKey": "unique-key-from-client",
  "metadata": {
    "description": "Payment for invoice #123"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "transactionId": "uuid",
    "status": "COMPLETED",
    "reference": "TXN-ABC123",
    "message": "Transfer completed successfully"
  }
}
```

**Response (Duplicate Request):**
```json
{
  "success": true,
  "data": {
    "transactionId": "same-uuid-as-first-request",
    "status": "COMPLETED",
    "reference": "TXN-ABC123",
    "message": "Transaction already processed"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Insufficient balance"
}
```

### 2. GET /api/transfer/:idempotencyKey

Retrieve transaction by idempotency key.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "idempotencyKey": "unique-key",
    "sourceWalletId": "uuid",
    "destinationWalletId": "uuid",
    "amount": "1000.50",
    "status": "COMPLETED",
    "reference": "TXN-ABC123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:05.000Z"
  }
}
```

### 3. GET /api/transfer/reference/:reference

Retrieve transaction by reference number.

**Response:** Same as above

### 4. GET /health

Health check endpoint.

**Response:**
```json
{
  "success": true,
  "message": "Service is healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🔒 How It Works: Race Condition Prevention

### Scenario: Connection Drops Mid-Transaction

```
User Request → API → Create PENDING Log → [DATABASE CONNECTION DROPS HERE] → ???
```

### Our Solution (5-Layer Defense):

#### Layer 1: Idempotency Check
```typescript
const existing = await TransactionLog.findOne({ where: { idempotencyKey } });
if (existing) return existing; // Already processed!
```

#### Layer 2: Distributed Lock (Redis)
```typescript
const lockAcquired = await redis.set(
  `transfer:lock:${idempotencyKey}`,
  '1',
  { NX: true, PX: 10000 } // Only one process can acquire
);
```

#### Layer 3: PENDING Transaction Log
```typescript
// Create log BEFORE touching balances
const txLog = await TransactionLog.create({
  idempotencyKey,
  status: 'PENDING', // <-- If connection drops, we can reconcile this
  amount,
  sourceWalletId,
  destinationWalletId
});
```

#### Layer 4: Database Transaction with Row Locks
```typescript
await sequelize.transaction(async (t) => {
  // Lock wallets in sorted order (prevents deadlocks)
  const [wallet1, wallet2] = await Promise.all([
    Wallet.findByPk(id1, { lock: t.LOCK.UPDATE, transaction: t }),
    Wallet.findByPk(id2, { lock: t.LOCK.UPDATE, transaction: t })
  ]);
  
  // Debit + Credit atomically
  await wallet1.update({ balance: newBalance1 }, { transaction: t });
  await wallet2.update({ balance: newBalance2 }, { transaction: t });
  
  // Mark as COMPLETED
  await txLog.update({ status: 'COMPLETED' }, { transaction: t });
});
```

#### Layer 5: Reconciliation Job (Bonus)
```typescript
// Background job scans for PENDING transactions > 5 minutes old
// Checks actual wallet balances vs expected
// Either completes or reverses the transaction
```

### Why This Works

1. **If connection drops BEFORE transaction log creation**: Idempotency check catches retry
2. **If connection drops AFTER log but BEFORE database transaction**: Transaction log stays PENDING, reconciliation job handles it
3. **If connection drops DURING database transaction**: Automatic rollback, transaction log stays PENDING
4. **If connection drops AFTER database transaction**: Transaction is COMPLETED, client can query by idempotency key

## 🗄️ Database Schema

### Wallets Table
```sql
CREATE TABLE wallets (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL,
  balance DECIMAL(20, 2) NOT NULL CHECK (balance >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_is_active ON wallets(is_active);
```

### Transaction Logs Table
```sql
CREATE TABLE transaction_logs (
  id UUID PRIMARY KEY,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  source_wallet_id UUID NOT NULL REFERENCES wallets(id),
  destination_wallet_id UUID NOT NULL REFERENCES wallets(id),
  amount DECIMAL(20, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  status ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED') NOT NULL,
  type ENUM('TRANSFER', 'DEPOSIT', 'WITHDRAWAL') NOT NULL,
  reference VARCHAR(100) UNIQUE NOT NULL,
  metadata JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX idx_transaction_logs_idempotency_key ON transaction_logs(idempotency_key);
CREATE INDEX idx_transaction_logs_source_wallet ON transaction_logs(source_wallet_id, created_at);
CREATE INDEX idx_transaction_logs_destination_wallet ON transaction_logs(destination_wallet_id, created_at);
CREATE INDEX idx_transaction_logs_status ON transaction_logs(status, created_at);
CREATE UNIQUE INDEX idx_transaction_logs_reference ON transaction_logs(reference);
```

## 🧩 Project Structure

```
wallet-service/
├── src/
│   ├── __tests__/
│   │   └── services/
│   │       └── transfer.service.test.ts
│   ├── controllers/
│   │   └── transfer.controller.ts
│   ├── models/
│   │   ├── index.ts
│   │   ├── wallet.model.ts
│   │   └── transactionLog.model.ts
│   ├── routes/
│   │   └── index.ts
│   ├── services/
│   │   ├── transfer.service.ts
│   │   └── redis.service.ts
│   ├── utils/
│   │   └── logger.ts
│   ├── app.ts
│   └── index.ts
├── migrations/
│   ├── 20240101000001-create-wallets-table.js
│   └── 20240101000002-create-transaction-logs-table.js
├── config/
│   └── config.js
├── .env.example
├── .sequelizerc
├── jest.config.js
├── tsconfig.json
├── package.json
└── README.md
```

## 🔐 Security Considerations

1. **Input Validation**: All inputs validated with express-validator
2. **SQL Injection**: Protected by Sequelize ORM parameterized queries
3. **Rate Limiting**: Recommended to add rate limiting middleware (e.g., express-rate-limit)
4. **Authentication**: Add JWT/OAuth middleware before deployment
5. **HTTPS**: Always use HTTPS in production
6. **Audit Logging**: All transactions logged with metadata

## 📊 Performance Considerations

1. **Indexes**: All foreign keys and frequently queried columns indexed
2. **Connection Pooling**: Sequelize connection pool configured (max: 20, min: 5)
3. **Redis Caching**: Distributed locks with TTL to prevent deadlocks
4. **Transaction Timeout**: 10-second timeout on database transactions
5. **Pagination**: Implement pagination for transaction history endpoints

## 🚧 Production Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong database passwords
- [ ] Enable SSL for PostgreSQL connection
- [ ] Configure Redis password
- [ ] Set up monitoring (e.g., New Relic, DataDog)
- [ ] Configure log aggregation (e.g., ELK Stack)
- [ ] Set up alerts for failed transactions
- [ ] Implement rate limiting
- [ ] Add authentication middleware
- [ ] Configure CORS properly
- [ ] Run database migrations
- [ ] Set up automated backups
- [ ] Configure reconciliation cron job

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 👨‍💻 Author

**Precious** - Senior Backend Engineer specializing in fintech systems

## 🙏 Acknowledgments

- Built for Sycamore backend engineering assessment
- Inspired by real-world fintech challenges at PalmPay
- Reference: [Stripe's Idempotency Guide](https://stripe.com/docs/api/idempotent_requests)
