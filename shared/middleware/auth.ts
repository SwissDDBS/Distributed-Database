import jwt from 'jsonwebtoken';

export interface JWTPayload {
  customer_id: string;
  role: 'customer' | 'teller' | 'admin';
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  customer_id: string;
  role: 'customer' | 'teller' | 'admin';
}

export class AuthService {
  private jwtSecret: string;

  constructor(jwtSecret: string) {
    this.jwtSecret = jwtSecret;
  }

  /**
   * Generate JWT token for a user
   */
  generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, expiresIn: string = '24h'): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn });
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token: string): JWTPayload {
    return jwt.verify(token, this.jwtSecret) as JWTPayload;
  }

  /**
   * Generate token for testing purposes
   */
  generateTestToken(customerId: string, role: 'customer' | 'teller' | 'admin' = 'customer'): string {
    return this.generateToken({
      customer_id: customerId,
      role,
    });
  }

  /**
   * Create admin token for system operations
   */
  generateAdminToken(): string {
    return this.generateToken({
      customer_id: 'system-admin',
      role: 'admin',
    }, '1h');
  }

  /**
   * Create teller token for banking operations
   */
  generateTellerToken(tellerId: string): string {
    return this.generateToken({
      customer_id: tellerId,
      role: 'teller',
    });
  }
}

/**
 * Utility functions for role checking
 */
export class RoleChecker {
  static hasRole(user: AuthUser, allowedRoles: Array<'customer' | 'teller' | 'admin'>): boolean {
    return allowedRoles.includes(user.role);
  }

  static isAdmin(user: AuthUser): boolean {
    return user.role === 'admin';
  }

  static isTeller(user: AuthUser): boolean {
    return user.role === 'teller';
  }

  static isCustomer(user: AuthUser): boolean {
    return user.role === 'customer';
  }

  static canAccessCustomerData(user: AuthUser, customerId: string): boolean {
    // Admins and tellers can access any customer data
    if (user.role === 'admin' || user.role === 'teller') {
      return true;
    }
    
    // Customers can only access their own data
    return user.customer_id === customerId;
  }

  static canAccessAccount(user: AuthUser, accountOwnerId: string): boolean {
    // Admins and tellers can access any account
    if (user.role === 'admin' || user.role === 'teller') {
      return true;
    }
    
    // Customers can only access their own accounts
    return user.customer_id === accountOwnerId;
  }

  static canInitiateTransfer(user: AuthUser, sourceAccountOwnerId: string): boolean {
    // Admins and tellers can initiate transfers from any account
    if (user.role === 'admin' || user.role === 'teller') {
      return true;
    }
    
    // Customers can only transfer from their own accounts
    return user.customer_id === sourceAccountOwnerId;
  }
}
