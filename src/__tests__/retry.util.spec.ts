import { executeWithRetry } from '../utils/retry.util';

describe('executeWithRetry', () => {
  it('should succeed on first attempt', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');

    const result = await executeWithRetry(mockFn, { maxRetries: 3 });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const result = await executeWithRetry(mockFn, { maxRetries: 3, initialDelay: 10 });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  }, 10000);

  it('should throw error after max retries', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('Always fails'));

    await expect(executeWithRetry(mockFn, { maxRetries: 2, initialDelay: 10 })).rejects.toThrow('Always fails');
    expect(mockFn).toHaveBeenCalledTimes(2);
  }, 10000);

  it('should log operation name in errors', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));

    await expect(
      executeWithRetry(mockFn, { maxRetries: 1, initialDelay: 10, operationName: 'TestOperation' })
    ).rejects.toThrow('Test error');

    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});
