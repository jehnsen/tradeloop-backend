import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../common/config/configuration';
import { AvailableLoadPosting } from '../marketplace/entities/load-posting.entity';
import { AvailableVehiclePosting } from '../marketplace/entities/vehicle-posting.entity';
import { HeuristicMatchScorer, MatchScorer } from './match-scorer';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

@Module({
  imports: [TypeOrmModule.forFeature([AvailableLoadPosting, AvailableVehiclePosting])],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    {
      provide: MatchScorer,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new HeuristicMatchScorer(config.get('matching', { infer: true })),
    },
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
