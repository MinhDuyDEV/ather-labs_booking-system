import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createAdminUser } from './admin-user.seed';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.seed();
  }

  async seed() {
    console.log('Starting database seeding...');

    try {
      await createAdminUser(this.dataSource);
      console.log('Database seeding completed successfully');
    } catch (error) {
      console.error('Database seeding failed:', error);
    }
  }
}
