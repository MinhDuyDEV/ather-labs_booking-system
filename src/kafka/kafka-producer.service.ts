import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, ProducerRecord, CompressionTypes } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private isConnected = false;
  private readonly MAX_RETRIES = 10;
  private readonly RETRY_DELAY = 1000; // 1 second
  private connectionRetryCount = 0;
  private readonly MAX_CONNECTION_RETRIES = 10;
  private readonly CONNECTION_RETRY_DELAY = 5000; // 5 seconds
  private readonly LEADERSHIP_RETRY_DELAY = 10000; // 10 seconds
  private readonly INITIAL_CONNECTION_DELAY = 10000; // 10 seconds

  constructor(private readonly configService: ConfigService) {
    this.logger.log('KafkaProducerService initialized');

    const brokers = this.configService.get<string[]>('kafka.brokers');
    const clientId = this.configService.get<string>('kafka.clientId');

    this.logger.log(
      `Kafka configuration: brokers=${brokers}, clientId=${clientId}`,
    );

    this.kafka = new Kafka({
      clientId: clientId,
      brokers: brokers,
      retry: {
        initialRetryTime: 300,
        retries: 15,
        maxRetryTime: 30000,
        factor: 0.2,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      idempotent: true,
      retry: {
        initialRetryTime: 300,
        retries: 15,
        maxRetryTime: 30000,
        factor: 0.2,
      },
      transactionTimeout: 30000,
    });
  }

  async onModuleInit() {
    this.logger.log(
      `Waiting ${this.INITIAL_CONNECTION_DELAY}ms before connecting to Kafka...`,
    );
    setTimeout(() => this.connect(), this.INITIAL_CONNECTION_DELAY);
  }

  private async connect() {
    try {
      this.logger.log('Connecting to Kafka producer...');
      await this.producer.connect();
      this.isConnected = true;
      this.connectionRetryCount = 0;
      this.logger.log('Kafka producer connected successfully');
    } catch (error) {
      this.isConnected = false;
      this.connectionRetryCount++;

      const isLeadershipError =
        error.message && error.message.includes('leadership election');
      const retryDelay = isLeadershipError
        ? this.CONNECTION_RETRY_DELAY * 2
        : this.CONNECTION_RETRY_DELAY;

      this.logger.error(
        `Failed to connect Kafka producer (Attempt ${this.connectionRetryCount}/${this.MAX_CONNECTION_RETRIES}): ${error.message}${isLeadershipError ? ' - Leadership election in progress' : ''}`,
        error.stack,
      );

      if (this.connectionRetryCount < this.MAX_CONNECTION_RETRIES) {
        this.logger.log(`Retrying connection in ${retryDelay}ms...`);
        setTimeout(() => this.connect(), retryDelay);
      } else {
        this.logger.error(
          `Maximum connection retry attempts reached. Failed to connect to Kafka.`,
        );
      }
    }
  }

  async onModuleDestroy() {
    try {
      if (this.isConnected) {
        await this.producer.disconnect();
        this.isConnected = false;
        this.logger.log('Kafka producer disconnected successfully');
      }
    } catch (error) {
      this.logger.error(
        `Error disconnecting Kafka producer: ${error.message}`,
        error.stack,
      );
    }
  }

  async sendMessage(topic: string, message: any, key?: string): Promise<void> {
    if (!this.isConnected) {
      this.logger.log('Producer not connected, attempting to reconnect...');
      await this.connect();
      if (!this.isConnected) {
        throw new Error('Failed to connect to Kafka producer');
      }
    }

    const record: ProducerRecord = {
      topic,
      messages: [
        {
          key: key || undefined,
          value: JSON.stringify(message),
          headers: {
            timestamp: Date.now().toString(),
            messageId: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
          },
        },
      ],
      compression: CompressionTypes.GZIP,
    };

    return this.sendWithRetry(record, 0);
  }

  private async sendWithRetry(
    record: ProducerRecord,
    retryCount: number,
  ): Promise<void> {
    try {
      this.logger.log(`Sending message to topic ${record.topic}...`);
      const result = await this.producer.send(record);
      this.logger.debug(
        `Message sent to topic ${record.topic}: ${JSON.stringify(record.messages[0].value)}`,
      );
      this.logger.debug(`Kafka response: ${JSON.stringify(result)}`);
    } catch (error) {
      const isLeadershipError =
        error.message && error.message.includes('leadership election');

      this.logger.error(
        `Error sending message to topic ${record.topic} (Attempt ${retryCount + 1}/${this.MAX_RETRIES}): ${error.message}${isLeadershipError ? ' - Leadership election in progress' : ''}`,
        error.stack,
      );

      if (retryCount < this.MAX_RETRIES) {
        let nextRetryDelay = this.RETRY_DELAY * Math.pow(2, retryCount);

        if (isLeadershipError) {
          nextRetryDelay = Math.max(
            nextRetryDelay,
            this.LEADERSHIP_RETRY_DELAY,
          );
          this.logger.warn(
            `Leadership election in progress for topic ${record.topic}. Waiting ${nextRetryDelay}ms before retry...`,
          );
        }

        nextRetryDelay = Math.min(nextRetryDelay, 60000);

        this.logger.log(
          `Retrying send message to topic ${record.topic} in ${nextRetryDelay}ms (Attempt ${retryCount + 1}/${this.MAX_RETRIES})`,
        );

        await new Promise((resolve) => setTimeout(resolve, nextRetryDelay));

        if (!this.isConnected) {
          try {
            await this.connect();
          } catch (connectError) {
            this.logger.error(
              `Failed to reconnect before retry: ${connectError.message}`,
              connectError.stack,
            );
          }
        }

        return this.sendWithRetry(record, retryCount + 1);
      } else {
        this.logger.error(
          `Failed to send message to topic ${record.topic} after ${this.MAX_RETRIES} retries`,
        );

        this.storeFailedMessage(record);

        throw new Error(
          `Failed to send message to topic ${record.topic} after ${this.MAX_RETRIES} retries: ${error.message}`,
        );
      }
    }
  }

  private storeFailedMessage(record: ProducerRecord): void {
    this.logger.warn(
      `Message to topic ${record.topic} failed to send and should be stored for later processing: ${JSON.stringify(record.messages[0].value)}`,
    );
  }
}
