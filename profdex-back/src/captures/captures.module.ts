import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { CapturesController } from './captures.controller';
import { CapturesService } from './captures.service';

@Module({
  imports: [MetricsModule],
  controllers: [CapturesController],
  providers: [CapturesService],
})
export class CapturesModule {}
