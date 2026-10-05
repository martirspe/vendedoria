import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConversionInfrastructure } from '../conversion/conversion-infrastructure.service';
import { ExplicitFact, SalesState } from './sales-state';

@Injectable()
export class SalesMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly infra: ConversionInfrastructure,
    private readonly config: ConfigService,
  ) {}
  customerKey(channelId: string, thread: string): string {
    return createHash('sha256').update(`${channelId}/${thread}`).digest('hex');
  }

  async loadCustomer(
    tenantId: string,
    customerKey: string,
  ): Promise<Record<string, ExplicitFact>> {
    // PostgreSQL expiry is authoritative even when Redis is stale.
    const memory = await this.prisma.salesCustomerMemory.findFirst({
      where: { tenantId, customerKey, expiresAt: { gt: new Date() } },
    });
    return (memory?.facts as Record<string, ExplicitFact>) ?? {};
  }

  async saveCustomer(
    tenantId: string,
    customerKey: string,
    state: SalesState,
  ): Promise<void> {
    const facts = Object.fromEntries(
      Object.entries(state.customerFacts).filter(
        ([, fact]) => fact.confidence === 1 && fact.scope === 'customer',
      ),
    );
    if (!Object.keys(facts).length) return;
    const ttl =
      Number(this.config.get('SALES_CUSTOMER_MEMORY_TTL_DAYS', 90)) * 86400000;
    const expiresAt = new Date(Date.now() + ttl);
    const data = Object.fromEntries(
      Object.entries(facts).map(([k, v]) => [
        k,
        { ...v, expiresAt: expiresAt.toISOString() },
      ]),
    );
    await this.prisma.salesCustomerMemory.upsert({
      where: { tenantId_customerKey: { tenantId, customerKey } },
      create: { tenantId, customerKey, facts: data, expiresAt },
      update: { facts: data, expiresAt },
    });
  }

  async cacheState(
    tenantId: string,
    conversationId: string,
    state: SalesState,
  ): Promise<void> {
    try {
      await this.infra.redis?.set(
        `wa:state:${tenantId}:${conversationId}`,
        JSON.stringify(state),
        'EX',
        Number(this.config.get('SALES_MEMORY_TTL_SECONDS', 1800)),
      );
    } catch {
      /* Database state was committed first. */
    }
  }
  async readState(
    tenantId: string,
    conversationId: string,
    persisted: SalesState,
  ): Promise<SalesState> {
    try {
      const hit = await this.infra.redis?.get(
        `wa:state:${tenantId}:${conversationId}`,
      );
      if (hit) {
        const state = JSON.parse(hit) as SalesState;
        if (
          state.version === 1 &&
          state.turns === persisted.turns &&
          JSON.stringify(state) === JSON.stringify(persisted)
        )
          return state;
      }
    } catch {
      /* Reconstruct from PostgreSQL. */
    }
    await this.cacheState(tenantId, conversationId, persisted);
    return persisted;
  }
}
