import { describe, expect, it } from 'vitest';
import { adobeMcpReceipt, normalizeAdobeMcpResponse } from '../src/mcpResult';

function text(value: unknown) {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

describe('Adobe MCP result normalization', () => {
  it('unwraps the nested response shape returned by the local Adobe MCP', () => {
    const response = {
      content: text({
        senderId: 'ae',
        status: 'SUCCESS',
        response: { content: text({ status: 'queued', renderQueueIndex: 2 }) },
      }),
    };
    expect(normalizeAdobeMcpResponse(response)).toMatchObject({
      structuredContent: { status: 'queued', renderQueueIndex: 2 },
    });
    expect(adobeMcpReceipt(response).receipt.renderQueueIndex).toBe(2);
  });

  it('does not allow an ExtendScript exception to masquerade as success', () => {
    const response = {
      isError: false,
      content: text({
        status: 'SUCCESS',
        response: { content: text({ error: 'Missing effect', line: 44 }) },
      }),
    };
    expect(() => adobeMcpReceipt(response)).toThrow(
      'After Effects could not build the Director composition at ExtendScript line 44: Missing effect',
    );
  });

  it('accepts the extra JSON-string layer produced by older Adobe MCP panels', () => {
    const response = {
      content: text({
        status: 'SUCCESS',
        response: { content: text(JSON.stringify({ status: 'queued', renderQueueIndex: 4 })) },
      }),
    };
    expect(adobeMcpReceipt(response).receipt).toMatchObject({
      status: 'queued',
      renderQueueIndex: 4,
    });
  });

  it('rejects a response without the queued-render receipt', () => {
    expect(() => adobeMcpReceipt({ structuredContent: { status: 'SUCCESS' } }))
      .toThrow('queued-render receipt');
  });
});
