import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { AdminCaptureTokensController } from './admin-capture-tokens.controller';
import { AdminCaptureTokensService } from './admin-capture-tokens.service';
import { CapturesController } from './captures.controller';
import { CapturesService } from './captures.service';
import { CAPTURE_RNG } from './capture-ivs';

@Module({
  imports: [MetricsModule],
  controllers: [CapturesController, AdminCaptureTokensController],
  providers: [
    CapturesService,
    AdminCaptureTokensService,
    { provide: CAPTURE_RNG, useValue: Math.random },
  ],
})
export class CapturesModule {}
