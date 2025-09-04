import { Request, Response, NextFunction } from 'express';
import { CustomerRepository } from '../models/customerRepository';
import { notFoundError, validationError, conflictError } from '../middleware/errorHandler';
import { logger, logCustomerOperation } from '../utils/logger';

const customerRepo = new CustomerRepository();

export class CustomerController {
  /**
   * Get customer by ID
   */
  async getCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(validationError('Customer ID is required'));
      }

      const customer = await customerRepo.findById(id);
      if (!customer) {
        return next(notFoundError('Customer', id));
      }

      logCustomerOperation('CUSTOMER_RETRIEVED', id, {
        name: customer.name,
        retrieved_by: req.user?.customer_id,
      });

      res.json({
        success: true,
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new customer
   */
  async createCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, address, contact_info } = req.body;

      // Validate required fields
      if (!name) {
        return next(validationError('Customer name is required'));
      }

      if (!contact_info || !contact_info.email) {
        return next(validationError('Contact information with email is required'));
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contact_info.email)) {
        return next(validationError('Invalid email format'));
      }

      // Check if customer with this email already exists
      const existingCustomer = await customerRepo.findByEmail(contact_info.email);
      if (existingCustomer) {
        return next(conflictError('Customer with this email already exists', {
          email: contact_info.email,
        }));
      }

      const newCustomer = await customerRepo.create({
        name,
        address: address || '',
        contact_info,
      });

      logCustomerOperation('CUSTOMER_CREATED', newCustomer.customer_id, {
        name,
        email: contact_info.email,
        created_by: req.user?.customer_id,
      });

      res.status(201).json({
        success: true,
        data: newCustomer,
        message: 'Customer created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update customer information
   */
  async updateCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, address, contact_info } = req.body;

      if (!id) {
        return next(validationError('Customer ID is required'));
      }

      // Check if customer exists
      const existingCustomer = await customerRepo.findById(id);
      if (!existingCustomer) {
        return next(notFoundError('Customer', id));
      }

      // Validate email format if provided
      if (contact_info?.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(contact_info.email)) {
          return next(validationError('Invalid email format'));
        }

        // Check if another customer has this email
        const customerWithEmail = await customerRepo.findByEmail(contact_info.email);
        if (customerWithEmail && customerWithEmail.customer_id !== id) {
          return next(conflictError('Another customer with this email already exists'));
        }
      }

      const updatedCustomer = await customerRepo.update(id, {
        ...(name && { name }),
        ...(address !== undefined && { address }),
        ...(contact_info && { contact_info }),
      });

      if (!updatedCustomer) {
        return next(notFoundError('Customer', id));
      }

      logCustomerOperation('CUSTOMER_UPDATED', id, {
        updated_fields: Object.keys(req.body),
        updated_by: req.user?.customer_id,
      });

      res.json({
        success: true,
        data: updatedCustomer,
        message: 'Customer updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete customer (admin only)
   */
  async deleteCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(validationError('Customer ID is required'));
      }

      // Check if customer exists
      const existingCustomer = await customerRepo.findById(id);
      if (!existingCustomer) {
        return next(notFoundError('Customer', id));
      }

      const deleteSuccess = await customerRepo.delete(id);
      if (!deleteSuccess) {
        return next(notFoundError('Customer', id));
      }

      logCustomerOperation('CUSTOMER_DELETED', id, {
        name: existingCustomer.name,
        deleted_by: req.user?.customer_id,
      });

      res.json({
        success: true,
        message: 'Customer deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all customers (with pagination)
   */
  async getAllCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { limit = 50, offset = 0 } = req.query;

      const customers = await customerRepo.findAll(
        parseInt(limit as string),
        parseInt(offset as string)
      );

      logCustomerOperation('CUSTOMERS_LIST_RETRIEVED', 'multiple', {
        count: customers.length,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        retrieved_by: req.user?.customer_id,
      });

      res.json({
        success: true,
        data: {
          customers,
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            count: customers.length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search customers by email
   */
  async searchByEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.query;

      if (!email) {
        return next(validationError('Email query parameter is required'));
      }

      const customer = await customerRepo.findByEmail(email as string);

      logCustomerOperation('CUSTOMER_SEARCH_BY_EMAIL', customer?.customer_id || 'not_found', {
        search_email: email,
        found: !!customer,
        searched_by: req.user?.customer_id,
      });

      if (!customer) {
        return res.json({
          success: true,
          data: null,
          message: 'No customer found with this email',
        });
      }

      res.json({
        success: true,
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if customer exists
   */
  async checkCustomerExists(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(validationError('Customer ID is required'));
      }

      const exists = await customerRepo.exists(id);

      res.json({
        success: true,
        data: {
          customer_id: id,
          exists,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
