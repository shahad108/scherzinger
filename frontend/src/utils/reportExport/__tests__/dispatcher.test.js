import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../pdf', () => ({
  generatePdf: vi.fn(async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
}));
vi.mock('../xlsx', () => ({
  generateXlsx: vi.fn(async () => new Blob(['xlsx'], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })),
}));
vi.mock('../docx', () => ({
  generateDocx: vi.fn(async () => new Blob(['docx'], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })),
}));

import { generateReport } from '../index';
import { generatePdf } from '../pdf';
import { generateXlsx } from '../xlsx';
import { generateDocx } from '../docx';

const baseSpec = { title: 't', scope: 'reply', defaultFormat: 'pdf' };
const blocks = [{ type: 'narrative', text: 'hello' }];

describe('generateReport', () => {
  beforeEach(() => {
    generatePdf.mockClear(); generateXlsx.mockClear(); generateDocx.mockClear();
  });

  it('routes pdf to generatePdf', async () => {
    const blob = await generateReport('pdf', baseSpec, blocks);
    expect(blob.type).toBe('application/pdf');
    expect(generatePdf).toHaveBeenCalledTimes(1);
  });

  it('routes xlsx to generateXlsx', async () => {
    const blob = await generateReport('xlsx', baseSpec, blocks);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(generateXlsx).toHaveBeenCalledTimes(1);
  });

  it('routes docx to generateDocx', async () => {
    const blob = await generateReport('docx', baseSpec, blocks);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(generateDocx).toHaveBeenCalledTimes(1);
  });

  it('throws on unknown format', async () => {
    await expect(generateReport('rtf', baseSpec, blocks)).rejects.toThrow(/unknown/i);
  });

  it('passes sourceBlocks through untouched', async () => {
    await generateReport('pdf', baseSpec, blocks);
    expect(generatePdf).toHaveBeenCalledWith(baseSpec, blocks);
  });
});
