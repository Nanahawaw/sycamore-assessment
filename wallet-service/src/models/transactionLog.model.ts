import { Model, DataTypes, Sequelize, Optional } from 'sequelize';

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

export enum TransactionType {
  TRANSFER = 'TRANSFER',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

interface TransactionLogAttributes {
  id: string;
  idempotencyKey: string;
  sourceWalletId: string;
  destinationWalletId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  type: TransactionType;
  reference: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TransactionLogCreationAttributes
  extends Optional<
    TransactionLogAttributes,
    'id' | 'status' | 'currency' | 'type' | 'reference' | 'metadata' | 'errorMessage'
  > {}

class TransactionLog
  extends Model<TransactionLogAttributes, TransactionLogCreationAttributes>
  implements TransactionLogAttributes
{
  public id!: string;
  public idempotencyKey!: string;
  public sourceWalletId!: string;
  public destinationWalletId!: string;
  public amount!: number;
  public currency!: string;
  public status!: TransactionStatus;
  public type!: TransactionType;
  public reference!: string;
  public metadata?: Record<string, unknown>;
  public errorMessage?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static initModel(sequelize: Sequelize): typeof TransactionLog {
    TransactionLog.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        idempotencyKey: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
          field: 'idempotency_key',
        },
        sourceWalletId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'source_wallet_id',
        },
        destinationWalletId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'destination_wallet_id',
        },
        amount: {
          type: DataTypes.DECIMAL(20, 2),
          allowNull: false,
          validate: {
            min: 0.01,
          },
        },
        currency: {
          type: DataTypes.STRING(3),
          allowNull: false,
          defaultValue: 'NGN',
        },
        status: {
          type: DataTypes.ENUM(...Object.values(TransactionStatus)),
          allowNull: false,
          defaultValue: TransactionStatus.PENDING,
        },
        type: {
          type: DataTypes.ENUM(...Object.values(TransactionType)),
          allowNull: false,
          defaultValue: TransactionType.TRANSFER,
        },
        reference: {
          type: DataTypes.STRING(100),
          allowNull: false,
          unique: true,
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        errorMessage: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: 'error_message',
        },
      },
      {
        sequelize,
        tableName: 'transaction_logs',
        underscored: true,
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ['idempotency_key'],
          },
          {
            fields: ['source_wallet_id', 'created_at'],
          },
          {
            fields: ['destination_wallet_id', 'created_at'],
          },
          {
            fields: ['status', 'created_at'],
          },
          {
            unique: true,
            fields: ['reference'],
          },
        ],
      }
    );

    return TransactionLog;
  }
}

export default TransactionLog;
