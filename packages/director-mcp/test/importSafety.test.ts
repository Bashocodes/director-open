import { expect, it, vi } from 'vitest';

it('does not perform network calls while importing the public module', async () => {
  const fetchSpy = vi.fn(() => {
    throw new Error('Network access is forbidden in Director MCP.');
  });
  vi.stubGlobal('fetch', fetchSpy);
  vi.resetModules();

  const publicModule = await import('../src/index');

  expect(publicModule.createDirectorMcpServer).toBeTypeOf('function');
  expect(publicModule.createDirectorMcpService).toBeTypeOf('function');
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
