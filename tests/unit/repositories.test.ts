import { DatabaseClient, createDatabaseClient, initDatabase } from '../../src/services/db/client';
import { SessionRepository, GlobalStats } from '../../src/services/db/session_repository';
import { QuoteRepository, FALLBACK_QUOTE } from '../../src/services/db/quote_repository';
import { DEFAULT_QUOTES } from '../../src/services/db/schema';
import { MonitoringSession, QuoteItem } from '../../src/core/types';

describe('Database Repositories', () => {
  let client: DatabaseClient;
  let sessionRepo: SessionRepository;
  let quoteRepo: QuoteRepository;

  beforeEach(async () => {
    client = createDatabaseClient({ filename: ':memory:' });
    await initDatabase(client);
    sessionRepo = new SessionRepository(client);
    quoteRepo = new QuoteRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('SessionRepository', () => {
    describe('createSession', () => {
      it('creates a session with auto-generated UUID v4 and monitoring status', async () => {
        const session: MonitoringSession = await sessionRepo.createSession();

        expect(typeof session.id).toBe('string');
        expect(session.id.length).toBeGreaterThan(0);
        expect(session.status).toBe('monitoring');
        expect(session.durationSeconds).toBe(0);
        expect(session.triggersCount).toBe(0);
        expect(session.keptCount).toBe(0);
        expect(session.deletedCount).toBe(0);
        expect(session.endedAt).toBeNull();
        expect(typeof session.startedAt).toBe('number');
        expect(session.startedAt).toBeGreaterThan(0);
      });

      it('creates a session with explicit custom identifier', async () => {
        const customId = 'sess-custom-12345';
        const session = await sessionRepo.createSession(customId);

        expect(session.id).toBe(customId);
        expect(session.status).toBe('monitoring');

        const fetched = await sessionRepo.getSessionById(customId);
        expect(fetched).not.toBeNull();
        expect(fetched?.id).toBe(customId);
      });

      it('rejects creating duplicate session with the same identifier', async () => {
        const duplicateId = 'sess-duplicate-id';
        await sessionRepo.createSession(duplicateId);

        await expect(sessionRepo.createSession(duplicateId)).rejects.toThrow();
      });
    });

    describe('atomic counters and updates', () => {
      it('atomically increments trigger count', async () => {
        const session = await sessionRepo.createSession();

        await sessionRepo.incrementTriggerCount(session.id);
        await sessionRepo.incrementTriggerCount(session.id);
        await sessionRepo.incrementTriggerCount(session.id);

        const updated = await sessionRepo.getSessionById(session.id);
        expect(updated?.triggersCount).toBe(3);
      });

      it('atomically increments kept count', async () => {
        const session = await sessionRepo.createSession();

        await sessionRepo.incrementKeptCount(session.id);
        await sessionRepo.incrementKeptCount(session.id);

        const updated = await sessionRepo.getSessionById(session.id);
        expect(updated?.keptCount).toBe(2);
      });

      it('atomically increments deleted count', async () => {
        const session = await sessionRepo.createSession();

        await sessionRepo.incrementDeletedCount(session.id);

        const updated = await sessionRepo.getSessionById(session.id);
        expect(updated?.deletedCount).toBe(1);
      });

      it('throws error when incrementing non-existent session', async () => {
        const nonExistent = 'sess-not-existing';

        await expect(sessionRepo.incrementTriggerCount(nonExistent)).rejects.toThrow(
          `Session not found: ${nonExistent}`
        );
        await expect(sessionRepo.incrementKeptCount(nonExistent)).rejects.toThrow(
          `Session not found: ${nonExistent}`
        );
        await expect(sessionRepo.incrementDeletedCount(nonExistent)).rejects.toThrow(
          `Session not found: ${nonExistent}`
        );
      });

      it('maintains integrity under concurrent increments without race conditions', async () => {
        const session = await sessionRepo.createSession();
        const concurrentOperations = 15;

        await Promise.all([
          ...Array.from({ length: concurrentOperations }, () =>
            sessionRepo.incrementTriggerCount(session.id)
          ),
          ...Array.from({ length: concurrentOperations }, () =>
            sessionRepo.incrementKeptCount(session.id)
          ),
          ...Array.from({ length: concurrentOperations }, () =>
            sessionRepo.incrementDeletedCount(session.id)
          ),
        ]);

        const updated = await sessionRepo.getSessionById(session.id);
        expect(updated?.triggersCount).toBe(concurrentOperations);
        expect(updated?.keptCount).toBe(concurrentOperations);
        expect(updated?.deletedCount).toBe(concurrentOperations);
      });
    });

    describe('endSession and getSessionById', () => {
      it('successfully closes an active session and sets idle status', async () => {
        const session = await sessionRepo.createSession();

        await sessionRepo.endSession(session.id, 142.7);

        const updated = await sessionRepo.getSessionById(session.id);
        expect(updated).not.toBeNull();
        expect(updated?.status).toBe('idle');
        expect(updated?.durationSeconds).toBe(143);
        expect(updated?.endedAt).not.toBeNull();
        expect(typeof updated?.endedAt).toBe('number');
        expect(Number(updated?.endedAt)).toBeGreaterThanOrEqual(Number(updated?.startedAt));
      });

      it('throws error when ending non-existent session', async () => {
        await expect(sessionRepo.endSession('non-existent-session', 60)).rejects.toThrow(
          'Session not found: non-existent-session'
        );
      });

      it('returns null for non-existent session id', async () => {
        const nonExistent = await sessionRepo.getSessionById('missing-session-uuid');
        expect(nonExistent).toBeNull();
      });
    });

    describe('global statistics', () => {
      it('returns zeros for empty database', async () => {
        const stats = await sessionRepo.getGlobalStats();

        expect(stats).toEqual({
          totalSessions: 0,
          totalDurationSeconds: 0,
          totalTriggers: 0,
          totalKept: 0,
          totalDeletedBlind: 0,
        });
      });

      it('consolidates aggregate metrics across multiple sessions', async () => {
        const s1 = await sessionRepo.createSession('sess-1');
        await sessionRepo.incrementTriggerCount(s1.id);
        await sessionRepo.incrementTriggerCount(s1.id);
        await sessionRepo.incrementKeptCount(s1.id);
        await sessionRepo.incrementDeletedCount(s1.id);
        await sessionRepo.endSession(s1.id, 120);

        const s2 = await sessionRepo.createSession('sess-2');
        await sessionRepo.incrementTriggerCount(s2.id);
        await sessionRepo.incrementDeletedCount(s2.id);
        await sessionRepo.incrementDeletedCount(s2.id);
        await sessionRepo.endSession(s2.id, 80);

        const s3 = await sessionRepo.createSession('sess-3');
        await sessionRepo.incrementTriggerCount(s3.id);
        await sessionRepo.incrementKeptCount(s3.id);

        const stats: GlobalStats = await sessionRepo.getGlobalStats();
        const aliasStats = await sessionRepo.getSessionStats();

        expect(stats.totalSessions).toBe(3);
        expect(stats.totalDurationSeconds).toBe(200);
        expect(stats.totalTriggers).toBe(4);
        expect(stats.totalKept).toBe(2);
        expect(stats.totalDeletedBlind).toBe(3);
        expect(aliasStats).toEqual(stats);
      });
    });
  });

  describe('QuoteRepository', () => {
    describe('empty library behavior', () => {
      it('reports zero quotes when unseeded', async () => {
        const count = await quoteRepo.countQuotes();
        const all = await quoteRepo.getAllQuotes();

        expect(count).toBe(0);
        expect(all).toEqual([]);
      });

      it('returns deterministic fallback quote when library is empty', async () => {
        const quote = await quoteRepo.getRandomQuote();

        expect(quote).toEqual(FALLBACK_QUOTE);
        expect(quote.id).toBe('fallback-0');
        expect(quote.quoteText).toBe('Registramos um momento delicado.');
        expect(quote.toneCategory).toBe('dry');
      });
    });

    describe('seeding and querying', () => {
      it('seeds default quotes and remains strictly idempotent', async () => {
        const firstInsertCount = await quoteRepo.seedInitialQuotes();
        expect(firstInsertCount).toBe(DEFAULT_QUOTES.length);

        const countAfterFirst = await quoteRepo.countQuotes();
        expect(countAfterFirst).toBe(DEFAULT_QUOTES.length);

        const secondInsertCount = await quoteRepo.seedInitialQuotes();
        expect(secondInsertCount).toBe(0);

        const countAfterSecond = await quoteRepo.countQuotes();
        expect(countAfterSecond).toBe(DEFAULT_QUOTES.length);
      });

      it('retrieves all quotes with sequential IDs and mapped tone categories', async () => {
        await quoteRepo.seedInitialQuotes();

        const allQuotes: QuoteItem[] = await quoteRepo.getAllQuotes();

        expect(allQuotes).toHaveLength(DEFAULT_QUOTES.length);
        for (const quote of allQuotes) {
          expect(typeof quote.id).toBe('string');
          expect(typeof quote.quoteText).toBe('string');
          expect(quote.quoteText.length).toBeGreaterThan(0);
          expect(['dry', 'ironic', 'absurd']).toContain(quote.toneCategory);
        }

        const quoteTexts = allQuotes.map((q) => q.quoteText);
        for (const defaultItem of DEFAULT_QUOTES) {
          expect(quoteTexts).toContain(defaultItem.quoteText);
        }
      });

      it('draws pseudo-random quotes from seeded library', async () => {
        await quoteRepo.seedInitialQuotes();

        const drawnQuotes = new Set<string>();
        for (let i = 0; i < 40; i++) {
          const quote = await quoteRepo.getRandomQuote();
          expect(typeof quote.id).toBe('string');
          expect(quote.id).not.toBe('fallback-0');
          expect(['dry', 'ironic', 'absurd']).toContain(quote.toneCategory);
          drawnQuotes.add(quote.quoteText);
        }

        expect(drawnQuotes.size).toBeGreaterThan(1);
      });
    });
  });
});
