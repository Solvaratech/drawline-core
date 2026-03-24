import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MySQLAdapter } from './MySQLAdapter';
import mysql from 'mysql2/promise';

vi.mock('mysql2/promise', () => ({
  default: {
    createConnection: vi.fn(),
  },
}));

describe('MySQLAdapter', () => {
  let adapter: MySQLAdapter;
  let mockConnection: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConnection = {
      query: vi.fn().mockImplementation((query: string) => {
        if (query.startsWith('INSERT INTO')) {
          return [{ insertId: 1 }];
        }
        if (query.startsWith('SELECT TABLE_NAME FROM information_schema.tables')) {
          return [[{ dummy: 1 }]]; // Simulates table exists
        }
        return [[]]; // Default empty
      }),
      end: vi.fn().mockResolvedValue(() => Promise.resolve()),
      config: { isServer: true },
    };
    (mysql.createConnection as any).mockResolvedValue(mockConnection);

    adapter = new MySQLAdapter({ host: 'localhost' });
    await adapter.connect({
      host: 'mock_host',
      user: 'mock_user',
      password: 'mock_password',
      database: 'mock_db',
    });
  });

  afterEach(async () => {
    if (adapter && adapter.disconnect) {
      await adapter.disconnect();
    }
  });

  it('should get collections', async () => {
    mockConnection.query.mockResolvedValueOnce([[{ name: 'test_table' }]]);
    const collections = await adapter.getCollections();
    expect(collections).toContain('test_table');
  });

  it('should insert documents with proper escaping and column listing', async () => {
    mockConnection.query.mockImplementation((query: string) => {
      if (query.startsWith('SELECT TABLE_NAME FROM information_schema.tables')) {
        return [[{ dummy: 1 }]]; // Table exists
      }
      if (query.startsWith('INSERT INTO')) {
        return [{ insertId: 1 }];
      }
      return [[]];
    });

    const result = await adapter.insertDocuments('test_table', [{ id: 1, name: 'test' }]);
    expect(result).toContain(1);
    expect(mockConnection.query).toHaveBeenCalledWith(
      'INSERT INTO `test_table` (`id`, `name`) VALUES (?, ?)',
      [1, 'test']
    );
  });

  it('should throw an error if not connected', async () => {
    const disconnectedAdapter = new MySQLAdapter({ host: 'localhost' });
    await expect(disconnectedAdapter.getCollections()).rejects.toThrow('Not connected');
  });

  it('should handle invalid table/field names', async () => {
    // Make table NOT exist for this specific test
    mockConnection.query.mockImplementation((query: string) => {
      if (query.startsWith('SELECT TABLE_NAME FROM information_schema.tables')) {
         return [[]]; // Table does not exist
      }
      return [[]];
    });
    await expect(adapter.insertDocuments('invalid`table', [{ id: 1 }])).rejects.toThrow();
    await expect(adapter.getDocumentCount('invalid`table')).rejects.toThrow();
  });

  it('should handle empty document insertion gracefully', async () => {
    mockConnection.query.mockClear();
    const result = await adapter.insertDocuments('test_table', []);
    expect(result).toEqual([]);
    expect(mockConnection.query).not.toHaveBeenCalled();
  });

  it('should throw an error if not connected when calling getDocumentCount', async () => {
    const disconnectedAdapter = new MySQLAdapter({ host: 'localhost' });
    await expect(disconnectedAdapter.getDocumentCount('test_table')).rejects.toThrow('Not connected to MySQL');
  });

  it('should escape identifiers to prevent SQL injection', async () => {
    mockConnection.query.mockImplementation((query: string) => {
      if (query.startsWith('SELECT TABLE_NAME FROM information_schema.tables')) {
        return [[{ dummy: 1 }]]; // Table exists
      }
      if (query.startsWith('SELECT COUNT(*)')) {
        return [[{ count: 5 }]]; 
      }
      return [[]];
    });

    const count = await adapter.getDocumentCount('test_table');

    expect(mockConnection.query).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM `test_table`');
    expect(count).toBe(5);
  });

  it('should handle invalid table names gracefully', async () => {
    mockConnection.query.mockRejectedValueOnce(new Error('ER_NO_SUCH_TABLE: Table does not exist'));

    await expect(adapter.getDocumentCount('invalid_table')).rejects.toThrow('ER_NO_SUCH_TABLE: Table does not exist');
  });

  it('should handle connection failures', async () => {
    const errorAdapter = new MySQLAdapter({ host: 'localhost' });
    (mysql.createConnection as any).mockRejectedValueOnce(new Error('Connection failed'));

    await expect(errorAdapter.connect({ host: 'localhost', user: 'root', database: 'test' })).rejects.toThrow('Connection failed');
  });

  it('should handle edge cases in data insertion', async () => {
    mockConnection.query.mockImplementation((query: string) => {
      if (query.startsWith('SELECT TABLE_NAME FROM information_schema.tables')) {
        return [[{ dummy: 1 }]]; // Table exists
      }
      if (query.startsWith('INSERT INTO')) {
         // Using mockResolvedValue doesn't return exactly the mock structure if not careful,
         // but let's return this for consistency with how adapter parses it:
         return [{ affectedRows: 2 /* no insertId, meaning it will fallback to indexes */ }];
      }
      return [[]];
    });

    const result = await adapter.insertDocuments('test_table', [
      { id: 1, name: 'Test' },
      { id: 2, name: 'Example' },
    ]);

    expect(mockConnection.query).toHaveBeenCalledWith(
      'INSERT INTO `test_table` (`id`, `name`) VALUES (?, ?), (?, ?)',
      [1, 'Test', 2, 'Example']
    );
    expect(result).toEqual([1, 2]);
  });
});