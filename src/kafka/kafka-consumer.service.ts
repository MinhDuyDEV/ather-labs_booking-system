import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly subscriptions: Map<string, (message: any) => Promise<void>> =
    new Map();

  constructor(private readonly configService: ConfigService) {
    this.kafka = new Kafka({
      clientId: this.configService.get<string>('kafka.clientId'),
      brokers: this.configService.get<string[]>('kafka.brokers'),
    });

    this.consumer = this.kafka.consumer({
      groupId: this.configService.get<string>('kafka.groupId'),
    });
  }

  async onModuleInit() {
    try {
      await this.consumer.connect();
      this.logger.log('Kafka consumer connected successfully');

      // Subscribe to topics and set up message handler
      await this.setupSubscriptions();
    } catch (error) {
      this.logger.error('Failed to connect Kafka consumer', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.consumer.disconnect();
      this.logger.log('Kafka consumer disconnected successfully');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka consumer', error);
    }
  }

  async subscribe(
    topic: string,
    callback: (message: any) => Promise<void>,
  ): Promise<void> {
    this.subscriptions.set(topic, callback);

    // If consumer is already running, subscribe to the new topic
    if (this.consumer) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
      this.logger.log(`Subscribed to topic: ${topic}`);
    }
  }

  private async setupSubscriptions() {
    // Subscribe to all topics
    for (const topic of this.subscriptions.keys()) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
      this.logger.log(`Subscribed to topic: ${topic}`);
    }

    // Set up message handler
    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, message } = payload;
        const callback = this.subscriptions.get(topic);

        if (callback && message.value) {
          try {
            const parsedMessage = JSON.parse(message.value.toString());
            this.logger.debug(
              `Received message from topic ${topic}: ${JSON.stringify(parsedMessage)}`,
            );
            await callback(parsedMessage);
          } catch (error) {
            this.logger.error(
              `Error processing message from topic ${topic}`,
              error,
            );
          }
        }
      },
    });
  }
}
