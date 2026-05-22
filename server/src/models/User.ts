import bcrypt from 'bcryptjs';
import pool from '../db.js';

export class DuplicateEmailError extends Error {
  statusCode = 400;

  constructor(message = 'Email already exists') {
    super(message);
    this.name = 'DuplicateEmailError';
  }
}

export class InvalidCredentialsError extends Error {
  statusCode = 401;

  constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export interface UserProps {
  user_id: number;
  username: string;
  email: string;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
}

export class User implements UserProps {
  constructor(
    public user_id: number,
    public username: string,
    public email: string
  ) {}

  static fromRow(row: UserProps) {
    return new User(row.user_id, row.username, row.email);
  }

  static async create(input: CreateUserInput) {
    const hashedPassword = await bcrypt.hash(input.password, 10);

    try {
      const result = await pool.query<UserProps>(
        'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING user_id, username, email',
        [input.username, input.email, hashedPassword]
      );

      return User.fromRow(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') {
        throw new DuplicateEmailError();
      }

      throw error;
    }
  }

  static async login(email: string, password: string) {
    const result = await pool.query<any>('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      throw new InvalidCredentialsError();
    }

    const userRow = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, userRow.password);

    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    return User.fromRow(userRow);
  }

  static async findById(userId: number) {
    const result = await pool.query<UserProps>(
      'SELECT user_id, username, email FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return User.fromRow(result.rows[0]);
  }
}