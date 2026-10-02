import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateJourneyTemplateDto,
  CreateKnowledgeFaqDto,
  ImportKnowledgePasteDto,
  UpdateJourneyTemplateDto,
  UpdateKnowledgeFaqDto,
} from './dto/knowledge.dto';

export type KnowledgeFaqView = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  source: string;
  reviewStatus: string;
  isPublished: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  listFaqs(tenantId: string) {
    return this.prisma.knowledgeFaq.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async createFaq(tenantId: string, dto: CreateKnowledgeFaqDto) {
    return this.prisma.knowledgeFaq.create({
      data: {
        tenantId,
        question: dto.question.trim(),
        answer: dto.answer.trim(),
        tags: this.normalizeTags(dto.tags),
        isPublished: dto.isPublished ?? true,
        reviewStatus: 'APPROVED',
        source: 'MANUAL',
      },
    });
  }

  async updateFaq(
    tenantId: string,
    faqId: string,
    dto: UpdateKnowledgeFaqDto,
  ) {
    await this.requireFaq(tenantId, faqId);
    return this.prisma.knowledgeFaq.update({
      where: { id: faqId },
      data: {
        question: dto.question?.trim(),
        answer: dto.answer?.trim(),
        tags: dto.tags ? this.normalizeTags(dto.tags) : undefined,
        isPublished: dto.isPublished,
        reviewStatus: dto.reviewStatus,
      },
    });
  }

  async deleteFaq(tenantId: string, faqId: string) {
    await this.requireFaq(tenantId, faqId);
    await this.prisma.knowledgeFaq.delete({ where: { id: faqId } });
    return { ok: true };
  }

  async approveFaq(tenantId: string, faqId: string) {
    await this.requireFaq(tenantId, faqId);
    return this.prisma.knowledgeFaq.update({
      where: { id: faqId },
      data: {
        reviewStatus: 'APPROVED',
        isPublished: true,
      },
    });
  }

  /**
   * Human-reviewed import: creates DRAFT FAQs from pasted Q/A blocks.
   * Does not publish until the merchant approves.
   */
  async importPaste(tenantId: string, dto: ImportKnowledgePasteDto) {
    const pairs = this.parsePaste(dto.rawText);
    if (!pairs.length) {
      return { created: [] as KnowledgeFaqView[], skipped: true };
    }

    const created = await this.prisma.$transaction(
      pairs.slice(0, 40).map((pair, index) =>
        this.prisma.knowledgeFaq.create({
          data: {
            tenantId,
            question: pair.question,
            answer: pair.answer,
            tags: ['import'],
            source: 'PASTE_IMPORT',
            reviewStatus: 'DRAFT',
            isPublished: false,
            sortOrder: index,
          },
        }),
      ),
    );

    return { created, skipped: false };
  }

  listJourneys(tenantId: string) {
    return this.prisma.journeyTemplate.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  createJourney(tenantId: string, dto: CreateJourneyTemplateDto) {
    return this.prisma.journeyTemplate.create({
      data: {
        tenantId,
        title: dto.title.trim(),
        stage: dto.stage,
        scriptText: dto.scriptText.trim(),
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateJourney(
    tenantId: string,
    journeyId: string,
    dto: UpdateJourneyTemplateDto,
  ) {
    await this.requireJourney(tenantId, journeyId);
    return this.prisma.journeyTemplate.update({
      where: { id: journeyId },
      data: {
        title: dto.title?.trim(),
        stage: dto.stage,
        scriptText: dto.scriptText?.trim(),
        isActive: dto.isActive,
      },
    });
  }

  async deleteJourney(tenantId: string, journeyId: string) {
    await this.requireJourney(tenantId, journeyId);
    await this.prisma.journeyTemplate.delete({ where: { id: journeyId } });
    return { ok: true };
  }

  async getRuntimeKnowledge(tenantId: string) {
    const [faqs, journeys] = await Promise.all([
      this.prisma.knowledgeFaq.findMany({
        where: {
          tenantId,
          isPublished: true,
          reviewStatus: 'APPROVED',
        },
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        take: 80,
      }),
      this.prisma.journeyTemplate.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        take: 12,
      }),
    ]);
    return { faqs, journeys };
  }

  async getQualityExtras(tenantId: string) {
    const [publishedFaqs, activeJourneys, draftFaqs] = await Promise.all([
      this.prisma.knowledgeFaq.count({
        where: {
          tenantId,
          isPublished: true,
          reviewStatus: 'APPROVED',
        },
      }),
      this.prisma.journeyTemplate.count({
        where: { tenantId, isActive: true },
      }),
      this.prisma.knowledgeFaq.count({
        where: { tenantId, reviewStatus: 'DRAFT' },
      }),
    ]);
    return { publishedFaqs, activeJourneys, draftFaqs };
  }

  private async requireFaq(tenantId: string, faqId: string) {
    const faq = await this.prisma.knowledgeFaq.findFirst({
      where: { id: faqId, tenantId },
    });
    if (!faq) {
      throw new NotFoundException('FAQ not found');
    }
    return faq;
  }

  private async requireJourney(tenantId: string, journeyId: string) {
    const journey = await this.prisma.journeyTemplate.findFirst({
      where: { id: journeyId, tenantId },
    });
    if (!journey) {
      throw new NotFoundException('Journey template not found');
    }
    return journey;
  }

  private normalizeTags(tags?: string[]) {
    return (tags ?? [])
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12);
  }

  private parsePaste(
    raw: string,
  ): Array<{ question: string; answer: string }> {
    const text = raw.replace(/\r\n/g, '\n').trim();
    if (!text) return [];

    const qaLinePairs: Array<{ question: string; answer: string }> = [];
    const lines = text.split('\n');
    let pendingQ: string | null = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const qMatch = trimmed.match(/^(?:q|pregunta)\s*[:\-]\s*(.+)$/i);
      const aMatch = trimmed.match(/^(?:a|respuesta)\s*[:\-]\s*(.+)$/i);
      if (qMatch) {
        pendingQ = qMatch[1].trim();
        continue;
      }
      if (aMatch && pendingQ) {
        qaLinePairs.push({
          question: pendingQ,
          answer: aMatch[1].trim(),
        });
        pendingQ = null;
      }
    }
    if (qaLinePairs.length) {
      return qaLinePairs.filter(
        (item) => item.question.length >= 4 && item.answer.length >= 4,
      );
    }

    return text
      .split(/\n{2,}/)
      .map((block) => {
        const parts = block
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        if (parts.length < 2) return null;
        return {
          question: parts[0].replace(/^\d+[\).\-\s]+/, '').slice(0, 300),
          answer: parts.slice(1).join(' ').slice(0, 2000),
        };
      })
      .filter(
        (item): item is { question: string; answer: string } =>
          Boolean(item && item.question.length >= 4 && item.answer.length >= 4),
      );
  }
}
