import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SQLiteAdapter } from "../../../generator/adapters/SQLiteAdapter";

// We map a basic in-memory mocking interface for better-sqlite3
vi.mock('better-sqlite3', () => {
  const mockDb = function(this: any, filename: string) {
    if (filename === 'fail_db') {
      throw new Error('Mock connection error');
    }
    this.prepare = vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue({ count: 0 }),
      run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }),
    });
    this.exec = vi.fn();
    this.transaction = vi.fn().mockImplementation((fn: any) => (...args: any[]) => fn(...args));
    this.close = vi.fn();
  };
  return {
    default: mockDb
  };
});

describe('SQLiteAdapter', () => {
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    adapter = new SQLiteAdapter();
    await adapter.connect({ filename: ':memory:' });
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.disconnect();
    }
  });

  it('should initialize and connect successfully', async () => {
    const freshAdapter = new SQLiteAdapter();
    await expect(freshAdapter.connect()).resolves.toBeUndefined();
  });

  it('should fail mapping invalid database files', async () => {
    const errorAdapter = new SQLiteAdapter();
    await expect(errorAdapter.connect({ filename: 'fail_db' })).rejects.toThrow('Failed to connect to SQLite');
  });

  it('should escape identifiers properly', async () => {
    // Expose privately for testing validation
    const escaped = (adapter as any).escapeIdentifier('my"table');
    expect(escaped).toBe('"my""table"');
  });

  it('should throw an error on unconnected operations', async () => {
    const disconnectedAdapter = new SQLiteAdapter();
    await expect(disconnectedAdapter.getCollections()).rejects.toThrow('Not connected to SQLite');
  });

  it('should handle zero documents to insert gracefully', async () => {
    const result = await adapter.insertDocuments('test_table', []);
    expect(result).toEqual([]);
  });

  it('should enforce checking if table exists before counts', async () => {
    // Mock the adapter to return false on exists
    vi.spyOn(adapter, 'collectionExists').mockResolvedValueOnce(false);
    await expect(adapter.getDocumentCount('no_table')).rejects.toThrow('Table does not exist');
  });

  it('should insert records securely through the transaction bulk wrapper', async () => {
    vi.spyOn(adapter, 'collectionExists').mockResolvedValueOnce(true);
    
    // As mock handles the prepare->transaction wrap, we just expect output format
    const results = await adapter.insertDocuments('users', [
      { id: 1, data: { id: 1, name: 'Test' } } as any,
      { id: 2, data: { id: 2, name: 'Alice' } } as any
    ]);
    
    expect(results).toEqual([1, 2]); 
  });
});