import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly subscriptions: Map<string, (message: any) => Promise<void>> =
    new Map();
  private isConsumerRunning = false;
  private pendingSubscriptions: string[] = [];
  private isConnected = false;
  private connectionRetryCount = 0;
  private readonly MAX_CONNECTION_RETRIES = 10; // Increased from 5 to 10
  private readonly CONNECTION_RETRY_DELAY = 5000; // 5 seconds
  private readonly SUBSCRIPTION_RETRY_DELAY = 3000; // 3 seconds
  private readonly MAX_SUBSCRIPTION_RETRIES = 10;
  private readonly INITIAL_CONNECTION_DELAY = 10000; // 10 seconds

  constructor(private readonly configService: ConfigService) {
    this.logger.log('KafkaConsumerService initialized');

    const brokers = this.configService.get<string[]>('kafka.brokers');
    const clientId = this.configService.get<string>('kafka.clientId');
    const groupId = this.configService.get<string>('kafka.groupId');

    this.logger.log(
      `Kafka configuration: brokers=${brokers}, clientId=${clientId}, groupId=${groupId}`,
    );

    this.kafka = new Kafka({
      clientId: clientId,
      brokers: brokers,
      retry: {
        initialRetryTime: 300,
        retries: 15, // Increased from 10 to 15
        maxRetryTime: 30000,
        factor: 0.2,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: groupId,
      allowAutoTopicCreation: true,
      retry: {
        initialRetryTime: 300,
        retries: 15, // Increased from 10 to 15
        maxRetryTime: 30000,
        factor: 0.2,
      },
      readUncommitted: false,
    });
  }

  async onModuleInit() {
    // Add a delay before connecting to allow Kafka to fully initialize
    this.logger.log(
      `Waiting ${this.INITIAL_CONNECTION_DELAY}ms before connecting to Kafka...`,
    );
    setTimeout(() => this.connect(), this.INITIAL_CONNECTION_DELAY);
  }

  private async connect() {
    try {
      this.logger.log('Connecting to Kafka consumer...');
      await this.consumer.connect();
      this.logger.log('Kafka consumer connected successfully');
      this.isConnected = true;
      this.connectionRetryCount = 0;

      // Subscribe to topics and set up message handler
      await this.setupSubscriptions();
    } catch (error) {
      this.isConnected = false;
      this.connectionRetryCount++;

      // Special handling for leadership election errors
      const isLeadershipError =
        error.message && error.message.includes('leadership election');
      const retryDelay = isLeadershipError
        ? this.CONNECTION_RETRY_DELAY * 2 // Wait longer for leadership election
        : this.CONNECTION_RETRY_DELAY;

      this.logger.error(
        `Failed to connect Kafka consumer (Attempt ${this.connectionRetryCount}/${this.MAX_CONNECTION_RETRIES}): ${error.message}${isLeadershipError ? ' - Leadership election in progress' : ''}`,
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
        await this.consumer.disconnect();
        this.logger.log('Kafka consumer disconnected successfully');
        this.isConnected = false;
      }
    } catch (error) {
      this.logger.error(
        `Error disconnecting Kafka consumer: ${error.message}`,
        error.stack,
      );
    }
  }

  async subscribe(
    topic: string,
    callback: (message: any) => Promise<void>,
  ): Promise<void> {
    this.logger.log(`Registering callback for topic: ${topic}`);
    this.subscriptions.set(topic, callback);

    // If consumer is not running yet, add to pending subscriptions
    if (!this.isConsumerRunning || !this.isConnected) {
      if (!this.pendingSubscriptions.includes(topic)) {
        this.pendingSubscriptions.push(topic);
        this.logger.log(`Topic ${topic} added to pending subscriptions`);
      }
      return;
    }

    try {
      await this.subscribeToTopic(topic);
    } catch (error) {
      this.logger.error(
        `Error subscribing to topic ${topic}: ${error.message}`,
        error.stack,
      );

      // Add to pending subscriptions for retry
      if (!this.pendingSubscriptions.includes(topic)) {
        this.pendingSubscriptions.push(topic);
        this.logger.log(
          `Topic ${topic} added to pending subscriptions for retry`,
        );
      }
    }
  }

  private async subscribeToTopic(topic: string, retryCount = 0): Promise<void> {
    try {
      this.logger.log(`Subscribing to topic: ${topic}`);
      await this.consumer.subscribe({ topic, fromBeginning: false });
      this.logger.log(`Subscribed to topic: ${topic}`);

      // Remove from pending subscriptions if it's there
      const index = this.pendingSubscriptions.indexOf(topic);
      if (index !== -1) {
        this.pendingSubscriptions.splice(index, 1);
      }
    } catch (error) {
      // Special handling for leadership election errors
      const isLeadershipError =
        error.message && error.message.includes('leadership election');

      this.logger.error(
        `Error subscribing to topic ${topic} (Attempt ${retryCount + 1}/${this.MAX_SUBSCRIPTION_RETRIES}): ${error.message}${isLeadershipError ? ' - Leadership election in progress' : ''}`,
        error.stack,
      );

      if (retryCount < this.MAX_SUBSCRIPTION_RETRIES) {
        const retryDelay = isLeadershipError
          ? this.SUBSCRIPTION_RETRY_DELAY * 2 // Wait longer for leadership election
          : this.SUBSCRIPTION_RETRY_DELAY;

        this.logger.log(
          `Retrying subscription to topic ${topic} in ${retryDelay}ms...`,
        );

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        // Retry subscription
        return this.subscribeToTopic(topic, retryCount + 1);
      } else {
        this.logger.error(
          `Maximum retry attempts reached for topic ${topic}. Adding to pending subscriptions.`,
        );

        // Add to pending subscriptions if not already there
        if (!this.pendingSubscriptions.includes(topic)) {
          this.pendingSubscriptions.push(topic);
        }
      }
    }
  }

  @Interval(10000) // Check every 10 seconds
  async retryPendingSubscriptions() {
    if (
      this.isConsumerRunning &&
      this.isConnected &&
      this.pendingSubscriptions.length > 0
    ) {
      this.logger.log(
        `Retrying subscription for pending topics: ${this.pendingSubscriptions.join(', ')}`,
      );

      const topicsToRetry = [...this.pendingSubscriptions];
      for (const topic of topicsToRetry) {
        try {
          await this.subscribeToTopic(topic);
        } catch (error) {
          // Error is already logged in subscribeToTopic
          // Keep in pending subscriptions for next retry
        }
      }
    }
  }

  private async setupSubscriptions() {
    // Combine existing and pending subscriptions
    const allTopics = [
      ...new Set([...this.subscriptions.keys(), ...this.pendingSubscriptions]),
    ];

    if (allTopics.length === 0) {
      this.logger.warn('No topics to subscribe to');
      this.isConsumerRunning = true; // Mark as running even if no topics
      return;
    }

    this.logger.log(
      `Setting up subscriptions for topics: ${allTopics.join(', ')}`,
    );

    // Subscribe to all topics
    for (const topic of allTopics) {
      try {
        await this.subscribeToTopic(topic);
      } catch (error) {
        // Error is already logged in subscribeToTopic
        // Keep in pending subscriptions for retry
      }
    }

    // Set up message handler
    try {
      this.logger.log('Setting up message handler');
      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          const { topic, message, partition } = payload;
          this.logger.debug(
            `Received message from topic ${topic}, partition ${partition}`,
          );

          const callback = this.subscriptions.get(topic);

          if (callback && message.value) {
            try {
              const parsedMessage = JSON.parse(message.value.toString());
              this.logger.debug(
                `Processing message from topic ${topic}: ${JSON.stringify(parsedMessage)}`,
              );
              await callback(parsedMessage);
            } catch (error) {
              this.logger.error(
                `Error processing message from topic ${topic}: ${error.message}`,
                error.stack,
              );

              // Here you could implement a retry mechanism or dead letter queue
              // For example, you could publish to a dead letter topic
            }
          } else {
            this.logger.warn(
              `No callback registered for topic ${topic} or message has no value`,
            );
          }
        },
        autoCommit: true,
        autoCommitInterval: 5000, // 5 seconds
        autoCommitThreshold: 100, // 100 messages
      });

      this.logger.log('Message handler set up successfully');
      this.isConsumerRunning = true;

      // Now that consumer is running, try to subscribe to any pending topics
      if (this.pendingSubscriptions.length > 0) {
        this.logger.log(
          `Consumer is running, retrying pending subscriptions immediately`,
        );
        await this.retryPendingSubscriptions();
      }
    } catch (error) {
      this.logger.error(
        `Error setting up message handler: ${error.message}`,
        error.stack,
      );
      this.isConsumerRunning = false;
    }
  }
}
