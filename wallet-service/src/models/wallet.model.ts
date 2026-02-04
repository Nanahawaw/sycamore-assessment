import { Model, DataTypes, Sequelize, Optional } from 'sequelize';

interface WalletAttributes {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface WalletCreationAttributes extends Optional<WalletAttributes, 'id' | 'balance' | 'currency' | 'isActive'> {}

class Wallet extends Model<WalletAttributes, WalletCreationAttributes> implements WalletAttributes {
  public id!: string;
  public userId!: string;
  public balance!: number;
  public currency!: string;
  public isActive!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static initModel(sequelize: Sequelize): typeof Wallet {
    Wallet.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
          field: 'user_id',
        },
        balance: {
          type: DataTypes.DECIMAL(20, 2),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
          },
        },
        currency: {
          type: DataTypes.STRING(3),
          allowNull: false,
          defaultValue: 'NGN',
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
        tableName: 'wallets',
        underscored: true,
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ['user_id'],
          },
          {
            fields: ['is_active'],
          },
        ],
      }
    );

    return Wallet;
  }
}

export default Wallet;
