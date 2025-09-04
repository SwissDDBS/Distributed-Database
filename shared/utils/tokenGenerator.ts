import { AuthService } from '../middleware/auth';

/**
 * Utility class for generating test tokens for development and testing
 */
export class TokenGenerator {
  private authService: AuthService;

  constructor(jwtSecret: string = 'your-super-secret-jwt-key') {
    this.authService = new AuthService(jwtSecret);
  }

  /**
   * Generate sample tokens for testing
   */
  generateSampleTokens() {
    const tokens = {
      // Customer tokens for the sample customers
      alice_customer: this.authService.generateTestToken('550e8400-e29b-41d4-a716-446655440001', 'customer'),
      bob_customer: this.authService.generateTestToken('550e8400-e29b-41d4-a716-446655440002', 'customer'),
      carol_customer: this.authService.generateTestToken('550e8400-e29b-41d4-a716-446655440003', 'customer'),
      
      // Teller token
      teller: this.authService.generateTellerToken('teller-001'),
      
      // Admin token
      admin: this.authService.generateAdminToken(),
    };

    return tokens;
  }

  /**
   * Generate token for a specific user
   */
  generateUserToken(customerId: string, role: 'customer' | 'teller' | 'admin' = 'customer'): string {
    return this.authService.generateTestToken(customerId, role);
  }

  /**
   * Print sample tokens for easy copy-paste during testing
   */
  printSampleTokens(): void {
    const tokens = this.generateSampleTokens();
    
    console.log('\n🔐 Sample JWT Tokens for Testing:');
    console.log('=====================================');
    
    console.log('\n👤 Customer Tokens:');
    console.log(`Alice (Customer): ${tokens.alice_customer}`);
    console.log(`Bob (Customer): ${tokens.bob_customer}`);
    console.log(`Carol (Customer): ${tokens.carol_customer}`);
    
    console.log('\n🏪 Teller Token:');
    console.log(`Teller: ${tokens.teller}`);
    
    console.log('\n👑 Admin Token:');
    console.log(`Admin: ${tokens.admin}`);
    
    console.log('\n📝 Usage Examples:');
    console.log('curl -H "Authorization: Bearer <token>" http://localhost:3001/customers/550e8400-e29b-41d4-a716-446655440001');
    console.log('curl -H "Authorization: Bearer <token>" -X POST http://localhost:3003/transfers -d \'{"source_account_id":"...","destination_account_id":"...","amount":100}\'');
    console.log('=====================================\n');
  }

  /**
   * Validate a token
   */
  validateToken(token: string): boolean {
    try {
      this.authService.verifyToken(token);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Decode token payload without verification (for debugging)
   */
  decodeToken(token: string): any {
    try {
      const payload = this.authService.verifyToken(token);
      return payload;
    } catch (error) {
      return { error: 'Invalid token' };
    }
  }
}

// Export a default instance for convenience
export const defaultTokenGenerator = new TokenGenerator();