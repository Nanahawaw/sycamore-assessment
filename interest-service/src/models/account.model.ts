import { Model, DataTypes, Sequelize, Optional } from 'sequelize';

interface AccountAttributes {
  id: string;
  userId: string;
  accountNumber: string;
  balance: string; // Store as string to preserve decimal precision
  interestRate: string;
  lastInterestDate: Date;
  totalInterestEarned: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface AccountCreationAttributes
  extends Optional<AccountAttributes, 'id' | 'balance' | 'interestRate' | 'totalInterestEarned' | 'isActive'> {}

class Account extends Model<AccountAttributes, AccountCreationAttributes> implements AccountAttributes {
  public id!: string;
  public userId!: string;
  public accountNumber!: string;
  public balance!: string;
  public interestRate!: string;
  public lastInterestDate!: Date;
  public totalInterestEarned!: string;
  public isActive!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static initModel(sequelize: Sequelize): typeof Account {
    Account.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'user_id',
        },
        accountNumber: {
          type: DataTypes.STRING(20),
          allowNull: false,
          unique: true,
          field: 'account_number',
        },
        balance: {
          type: DataTypes.DECIMAL(30, 10), // High precision for interest calculations
          allowNull: false,
          defaultValue: '0',
          get() {
            const value = this.getDataValue('balance');
            return value ? value.toString() : '0';
          },
        },
        interestRate: {
          type: DataTypes.DECIMAL(10, 6), // e.g., 27.500000 for 27.5%
          allowNull: false,
          defaultValue: '27.5',
          field: 'interest_rate',
          get() {
            const value = this.getDataValue('interestRate');
            return value ? value.toString() : '27.5';
          },
        },
        lastInterestDate: {
          type: DataTypes.DATEONLY,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: 'last_interest_date',
        },
        totalInterestEarned: {
          type: DataTypes.DECIMAL(30, 10),
          allowNull: false,
          defaultValue: '0',
          field: 'total_interest_earned',
          get() {
            const value = this.getDataValue('totalInterestEarned');
            return value ? value.toString() : '0';
          },
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          field: 'is_active',
        },
      },
      {
        sequelize,
        tableName: 'accounts',
        underscored: true,
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ['account_number'],
          },
          {
            fields: ['user_id'],
          },
          {
            fields: ['is_active'],
          },
          {
            fields: ['last_interest_date'],
          },
        ],
      }
    );

    return Account;
  }
}

export default Account;
