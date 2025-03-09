import { User } from 'src/users/entities/user.entity';
import { DataSource } from 'typeorm';

export const createAdminUser = async (dataSource: DataSource) => {
  const userRepository = dataSource.getRepository(User);

  const adminExists = await userRepository.findOne({
    where: { username: 'admin' },
  });

  if (!adminExists) {
    const admin = new User();
    admin.username = 'admin';
    admin.password = 'admin123';
    admin.isAdmin = true;

    await userRepository.save(admin);
    console.log('Admin user created successfully');
  } else {
    console.log('Admin user already exists');
  }
};
