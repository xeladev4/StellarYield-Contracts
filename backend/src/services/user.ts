import type { User, UserVaultPosition } from "../types/index.js";

export class UserService {
  async getUser(_address: string): Promise<User | null> {
    throw new Error("Not implemented");
  }

  async upsertUser(_address: string, _kycVerified?: boolean): Promise<void> {
    throw new Error("Not implemented");
  }

  async getUserPortfolio(_address: string): Promise<UserVaultPosition[]> {
    throw new Error("Not implemented");
  }
}
