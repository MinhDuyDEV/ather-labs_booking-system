import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, ProducerRecord } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly kafka: Kafka;
  private readonly producer: Producer;

  constructor(private readonly configService: ConfigService) {
    this.kafka = new Kafka({
      clientId: this.configService.get<string>('kafka.clientId'),
      brokers: this.configService.get<string[]>('kafka.brokers'),
    });

    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected successfully');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka producer', error);
    }
  }

  async sendMessage(topic: string, message: any, key?: string): Promise<void> {
    try {
      const record: ProducerRecord = {
        topic,
        messages: [
          {
            key: key || undefined,
            value: JSON.stringify(message),
            headers: {
              timestamp: Date.now().toString(),
            },
          },
        ],
      };

      await this.producer.send(record);
      this.logger.debug(
        `Message sent to topic ${topic}: ${JSON.stringify(message)}`,
      );
    } catch (error) {
      this.logger.error(`Error sending message to topic ${topic}`, error);
      throw error;
    }
  }
}
