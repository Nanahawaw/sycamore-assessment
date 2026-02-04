import { Model, DataTypes, Sequelize, Optional } from 'sequelize';

interface InterestLogAttributes {
  id: string;
  accountId: string;
  calculationDate: Date;
  openingBalance: string;
  interestRate: string;
  daysInYear: number;
  interestAmount: string;
  closingBalance: string;
  createdAt?: Date;
}

interface InterestLogCreationAttributes extends Optional<InterestLogAttributes, 'id'> {}

class InterestLog
  extends Model<InterestLogAttributes, InterestLogCreationAttributes>
  implements InterestLogAttributes
{
  public id!: string;
  public accountId!: string;
  public calculationDate!: Date;
  public openingBalance!: string;
  public interestRate!: string;
  public daysInYear!: number;
  public interestAmount!: string;
  public closingBalance!: string;
  public readonly createdAt!: Date;

  static initModel(sequelize: Sequelize): typeof InterestLog {
    InterestLog.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        accountId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: 'account_id',
        },
        calculationDate: {
          type: DataTypes.DATEONLY,
          allowNull: false,
          field: 'calculation_date',
        },
        openingBalance: {
          type: DataTypes.DECIMAL(30, 10),
          allowNull: false,
          field: 'opening_balance',
          get() {
            const value = this.getDataValue('openingBalance');
            return value ? value.toString() : '0';
          },
        },
        interestRate: {
          type: DataTypes.DECIMAL(10, 6),
          allowNull: false,
          field: 'interest_rate',
          get() {
            const value = this.getDataValue('interestRate');
            return value ? value.toString() : '0';
          },
        },
        daysInYear: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: 'days_in_year',
          comment: '365 for regular year, 366 for leap year',
        },
        interestAmount: {
          type: DataTypes.DECIMAL(30, 10),
          allowNull: false,
          field: 'interest_amount',
          get() {
            const value = this.getDataValue('interestAmount');
            return value ? value.toString() : '0';
          },
        },
        closingBalance: {
          type: DataTypes.DECIMAL(30, 10),
          allowNull: false,
          field: 'closing_balance',
          get() {
            const value = this.getDataValue('closingBalance');
            return value ? value.toString() : '0';
          },
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: 'created_at',
        },
      },
      {
        sequelize,
        tableName: 'interest_logs',
        underscored: true,
        timestamps: false,
        indexes: [
          {
            fields: ['account_id', 'calculation_date'],
          },
          {
            fields: ['calculation_date'],
          },
        ],
      }
    );

    return InterestLog;
  }
}

export default InterestLog;
