export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export class DuplicateEmailError extends Error {}

export interface UserRepo {
  /** Throws DuplicateEmailError if the email is already taken. */
  create(input: { email: string; passwordHash: string }): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}
