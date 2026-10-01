import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../common/config/configuration';
import { Document } from './document.entity';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { LocalStorageService } from './storage/local-storage.service';
import { StorageService } from './storage/storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document]),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        limits: {
          fileSize: config.get('storage', { infer: true }).maxUploadBytes,
          files: 1,
          fields: 10,
        },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new LocalStorageService(config.get('storage', { infer: true }).localPath),
    },
  ],
})
export class DocumentsModule {}
