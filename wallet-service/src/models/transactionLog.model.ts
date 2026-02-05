import { Model, DataTypes, Sequelize, Optional } from "sequelize";

export enum TransactionStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REVERSED = "REVERSED",
}

export enum TransactionType {
  TRANSFER = "TRANSFER",
  DEPOSIT = "DEPOSIT",
  WITHDRAWAL = "WITHDRAWAL",
}

interface TransactionLogAttributes {
  id: string;
  requestReference: string;
  payerWalletId: string;
  payeeWalletId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  type: TransactionType;
  responseReference: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TransactionLogCreationAttributes extends Optional<
  TransactionLogAttributes,
  | "id"
  | "status"
  | "currency"
  | "type"
  | "responseReference"
  | "metadata"
  | "errorMessage"
> {}

class TransactionLog
  extends Model<TransactionLogAttributes, TransactionLogCreationAttributes>
  implements TransactionLogAttributes
{
  public id!: string;
  public requestReference!: string;
  public payerWalletId!: string;
  public payeeWalletId!: string;
  public amount!: number;
  public currency!: string;
  public status!: TransactionStatus;
  public type!: TransactionType;
  public responseReference!: string;
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
        requestReference: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
          field: "request_reference",
        },
        payerWalletId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "payer_wallet_id",
        },
        payeeWalletId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "payee_wallet_id",
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
          defaultValue: "NGN",
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
        responseReference: {
          type: DataTypes.STRING(100),
          allowNull: false,
          unique: true,
          field: "response_reference",
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        errorMessage: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "error_message",
        },
      },
      {
        sequelize,
        tableName: "transaction_logs",
        underscored: true,
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["request_reference"],
          },
          {
            fields: ["payer_wallet_id", "created_at"],
          },
          {
            fields: ["payee_wallet_id", "created_at"],
          },
          {
            fields: ["status", "created_at"],
          },
          {
            unique: true,
            fields: ["response_reference"],
          },
        ],
      },
    );

    return TransactionLog;
  }
}

export default TransactionLog;
