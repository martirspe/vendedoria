import { Global, Module } from '@nestjs/common';
import { InboxEventsService } from './inbox-events.service';

/** Global so orders and payments can notify the inbox without importing ConversationsModule. */
@Global()
@Module({
  providers: [InboxEventsService],
  exports: [InboxEventsService],
})
export class InboxEventsModule {}
