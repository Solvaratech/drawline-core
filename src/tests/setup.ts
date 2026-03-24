import { beforeAll, afterAll, vi } from "vitest";

// Global Setup for all tests
beforeAll(() => {
    // You can set up global mocks or suppress warnings here
    // e.g. console.warn = vi.fn();
});

afterAll(() => {
    vi.restoreAllMocks();
});
