import { Module } from '@nestjs/common';
import { StorefrontModule } from '../storefront/storefront.module';
import {
  ConversionController,
  ConversionPublicController,
} from './conversion.controller';
import { ConversionInfrastructureModule } from './conversion-infrastructure.module';
import { RecoveryMessagingService } from './recovery-messaging.service';
import { RecoveryService } from './recovery.service';
import { RecoveryWorker } from './recovery-worker.service';
import { RecommendationVectors } from './recommendation-vector.service';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [StorefrontModule, ConversionInfrastructureModule],
  controllers: [ConversionController, ConversionPublicController],
  providers: [
    RecoveryMessagingService,
    RecoveryService,
    RecoveryWorker,
    RecommendationVectors,
    RecommendationsService,
  ],
})
export class ConversionModule {}
