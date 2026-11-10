import { Module } from '@nestjs/common';

import { AppController } from './app.controller.js';
import { SandboxController } from './sandbox.controller.js';
import { SandboxService, sandboxPool } from './sandbox.service.js';

@Module({
  controllers: [AppController, SandboxController],
  providers: [
    {
      provide: SandboxService,
      useFactory: () => {
        if (process.env['ENABLE_SANDBOX_WORKSPACE'] !== 'true') return new SandboxService(null, '');
        const url = process.env['DATABASE_URL'],
          key = process.env['SANDBOX_ENCRYPTION_KEY'];
        if (!url || !key || !/^[a-f0-9]{64}$/i.test(key))
          throw new Error(
            'Sandbox workspace requires DATABASE_URL and a 64-character hex SANDBOX_ENCRYPTION_KEY',
          );
        return new SandboxService(sandboxPool(url), key);
      },
    },
  ],
})
export class AppModule {}
