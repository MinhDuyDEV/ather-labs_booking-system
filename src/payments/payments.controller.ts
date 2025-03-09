import { Body, Controller, Post } from '@nestjs/common';
import { PaymentsService, PaymentResult } from './payments.service';

class ProcessPaymentDto {
  amount: number;
  email: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('process')
  async processPayment(
    @Body() paymentDto: ProcessPaymentDto,
  ): Promise<PaymentResult> {
    return this.paymentsService.processPayment(
      paymentDto.amount,
      paymentDto.email,
    );
  }
}
