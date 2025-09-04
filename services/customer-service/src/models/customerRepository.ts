import { eq } from 'drizzle-orm';
import { db } from '../utils/db';
import { customers, type Customer, type NewCustomer } from './schema';

export class CustomerRepository {
  /**
   * Create a new customer
   */
  async create(customerData: Omit<NewCustomer, 'customer_id' | 'created_at' | 'updated_at'>): Promise<Customer> {
    const [customer] = await db
      .insert(customers)
      .values(customerData)
      .returning();
    
    return customer;
  }

  /**
   * Find customer by ID
   */
  async findById(customerId: string): Promise<Customer | null> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.customer_id, customerId))
      .limit(1);
    
    return customer || null;
  }

  /**
   * Find customer by email (from contact_info JSONB)
   */
  async findByEmail(email: string): Promise<Customer | null> {
    const result = await db
      .select()
      .from(customers)
      .where(eq(customers.contact_info, { email } as any))
      .limit(1);
    
    return result[0] || null;
  }

  /**
   * Update customer information
   */
  async update(customerId: string, updates: Partial<Omit<Customer, 'customer_id' | 'created_at' | 'updated_at'>>): Promise<Customer | null> {
    const [updatedCustomer] = await db
      .update(customers)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(eq(customers.customer_id, customerId))
      .returning();
    
    return updatedCustomer || null;
  }

  /**
   * Delete customer (soft delete by setting a flag or hard delete)
   */
  async delete(customerId: string): Promise<boolean> {
    const result = await db
      .delete(customers)
      .where(eq(customers.customer_id, customerId));
    
    return result.rowCount > 0;
  }

  /**
   * Get all customers (with pagination)
   */
  async findAll(limit: number = 50, offset: number = 0): Promise<Customer[]> {
    return await db
      .select()
      .from(customers)
      .limit(limit)
      .offset(offset)
      .orderBy(customers.created_at);
  }

  /**
   * Check if customer exists
   */
  async exists(customerId: string): Promise<boolean> {
    const [result] = await db
      .select({ customer_id: customers.customer_id })
      .from(customers)
      .where(eq(customers.customer_id, customerId))
      .limit(1);
    
    return !!result;
  }
}
