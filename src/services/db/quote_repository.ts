import { DatabaseClient } from './client';
import { DEFAULT_QUOTES, QuoteLibraryRecord } from './schema';
import { QuoteItem, ToneCategory } from '../../core/types';

export const FALLBACK_QUOTE: QuoteItem = {
  id: 'fallback-0',
  quoteText: 'Registramos um momento delicado.',
  toneCategory: 'dry',
};

export interface IQuoteRepository {
  seedInitialQuotes(): Promise<number>;
  getRandomQuote(): Promise<QuoteItem>;
  getAllQuotes(): Promise<QuoteItem[]>;
  countQuotes(): Promise<number>;
}

function normalizeToneCategory(tone: string): ToneCategory {
  if (tone === 'ironic') {
    return 'ironic';
  }
  if (tone === 'shock' || tone === 'absurd') {
    return 'absurd';
  }
  return 'dry';
}

function mapQuoteRecord(record: QuoteLibraryRecord): QuoteItem {
  return {
    id: String(record.id),
    quoteText: record.quote_text,
    toneCategory: normalizeToneCategory(record.tone_category),
  };
}

export class QuoteRepository implements IQuoteRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async seedInitialQuotes(): Promise<number> {
    return await this.client.transaction(async (tx) => {
      let insertedCount = 0;
      for (const item of DEFAULT_QUOTES) {
        const result = await tx.run(
          'INSERT OR IGNORE INTO quote_library (quote_text, tone_category) VALUES (?, ?);',
          [item.quoteText, item.toneCategory]
        );
        insertedCount += result.changes;
      }
      return insertedCount;
    });
  }

  public async getRandomQuote(): Promise<QuoteItem> {
    const row = await this.client.get<QuoteLibraryRecord>(
      'SELECT id, quote_text, tone_category FROM quote_library ORDER BY RANDOM() LIMIT 1;'
    );
    if (!row) {
      return FALLBACK_QUOTE;
    }
    return mapQuoteRecord(row);
  }

  public async getAllQuotes(): Promise<QuoteItem[]> {
    const rows = await this.client.all<QuoteLibraryRecord>(
      'SELECT id, quote_text, tone_category FROM quote_library ORDER BY id ASC;'
    );
    return rows.map(mapQuoteRecord);
  }

  public async countQuotes(): Promise<number> {
    const row = await this.client.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM quote_library;'
    );
    return Number(row?.count ?? 0);
  }
}
