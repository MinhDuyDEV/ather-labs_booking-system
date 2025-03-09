import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  message: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  async processPayment(amount: number, email: string): Promise<PaymentResult> {
    this.logger.log(`Processing payment of ${amount} for ${email}`);

    const isSuccessful = Math.random() < 0.8;

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (isSuccessful) {
      const transactionId = uuidv4();
      this.logger.log(`Payment successful: ${transactionId}`);
      return {
        success: true,
        transactionId,
        message: 'Payment processed successfully',
      };
    } else {
      this.logger.warn(`Payment failed for ${email}`);
      return {
        success: false,
        message: 'Payment processing failed. Please try again.',
      };
    }
  }
}
