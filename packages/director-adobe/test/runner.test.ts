import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_DIRECTOR_ADOBE_PLAN_JSON_BYTES } from '../../../src/shared/directorAdobeContract';
import { readAdobePlan } from '../src/runner';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('Director Adobe plan reader', () => {
  it('rejects a missing plan with a specific local-file error', async () => {
    await expect(readAdobePlan(path.join(tmpdir(), 'missing-director-plan.json')))
      .rejects.toThrow('does not exist');
  });

  it('rejects oversized plan input before JSON parsing', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'director-adobe-test-'));
    temporaryDirectories.push(directory);
    const planPath = path.join(directory, 'oversized.director-adobe.json');
    await writeFile(planPath, Buffer.alloc(MAX_DIRECTOR_ADOBE_PLAN_JSON_BYTES + 1, 0x20));

    await expect(readAdobePlan(planPath)).rejects.toThrow('larger than 5 MB');
  });
});
