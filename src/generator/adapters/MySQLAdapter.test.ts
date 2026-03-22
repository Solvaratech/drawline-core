import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MySQLAdapter } from './MySQLAdapter';
import mysql from 'mysql2/promise';

vi.mock('mysql2/promise', () => ({
  default: {
    createConnection: vi.fn().mockResolvedValue({
      query: vi.fn().mockImplementation((query: string) => {
        if (query.startsWith('INSERT INTO')) {
          return [{ insertId: 1 }];
        }
        return [[]];
      }),
      end: vi.fn().mockResolvedValue(() => Promise.resolve()),
      config: { isServer: true },
    }),
  },
}));

describe('MySQLAdapter', () => {
  let adapter: MySQLAdapter;
  let mockConnection: any;

  beforeAll(async () => {
    mockConnection = await mysql.createConnection({});
    adapter = new MySQLAdapter();
    await adapter.connect({
      host: 'mock_host',
      user: 'mock_user',
      password: 'mock_password',
      database: 'mock_db',
    });
  });

  afterAll(async () => {
    if (adapter && adapter.disconnect) {
      await adapter.disconnect();
    }
    if (mockConnection && mockConnection.end) {
      await mockConnection.end();
    }
  });

  it('should get collections', async () => {
    mockConnection.query.mockResolvedValueOnce([[{ name: 'test_table' }]]);
    const collections = await adapter.getCollections();
    expect(collections).toContain('test_table');
  });

  it('should insert documents', async () => {
    mockConnection.query.mockResolvedValueOnce([{ insertId: 1 }]);
    const result = await adapter.insertDocuments('test_table', [{ id: 1 }, { id: 2 }]);
    expect(result).toContain(1);
    expect(mockConnection.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO test_table'),
      expect.any(Array)
    );
  });
});