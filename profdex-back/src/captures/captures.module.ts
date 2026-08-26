import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { CapturesController } from './captures.controller';
import { CapturesService } from './captures.service';
import { CAPTURE_RNG } from './capture-ivs';

@Module({
  imports: [MetricsModule],
  controllers: [CapturesController],
  providers: [CapturesService, { provide: CAPTURE_RNG, useValue: Math.random }],
})
export class CapturesModule {}
