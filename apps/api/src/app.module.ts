import { Module } from '@nestjs/common';

import { AppController } from './app.controller.js';
import { SandboxController } from './sandbox.controller.js';
import { SandboxService, sandboxPool } from './sandbox.service.js';
import { readSandboxConfig } from './sandbox-config.js';

@Module({
  controllers: [AppController, SandboxController],
  providers: [
    {
      provide: SandboxService,
      useFactory: () => {
        const config = readSandboxConfig(process.env);
        if (!config.enabled) return new SandboxService(null, '');
        return new SandboxService(sandboxPool(config.databaseUrl), config.encryptionKey);
      },
    },
  ],
})
export class AppModule {}
