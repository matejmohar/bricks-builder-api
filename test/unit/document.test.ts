import { describe, expect, it } from 'vitest';
import { createBricksBuilder } from '../../src/connect';
import { TimeoutError } from '../../src/errors';
import { createFakeBricks } from './fake-bricks';

describe('document', () => {
  it('hasUnsavedChanges() reflects $_state.unsavedChanges', () => {
    const fake = createFakeBricks();
    const bricks = createBricksBuilder(fake.gp, fake.win);
    expect(bricks.document.hasUnsavedChanges()).toBe(false);
    fake.state.unsavedChanges = ['content'];
    expect(bricks.document.hasUnsavedChanges()).toBe(true);
  });

  it('save() uses $_savePostAsync when available', async () => {
    const fake = createFakeBricks();
    fake.state.unsavedChanges = ['content'];
    const bricks = createBricksBuilder(fake.gp, fake.win);
    await bricks.document.save();
    expect(fake.calls).toContainEqual(['$_savePostAsync']);
    expect(bricks.document.hasUnsavedChanges()).toBe(false);
    expect(fake.state.isSaving).toBe(false);
  });

  it('save() falls back to $_savePost and waits for isSaving to clear', async () => {
    const fake = createFakeBricks({ omit: ['$_savePostAsync'] });
    fake.state.unsavedChanges = ['content'];
    const bricks = createBricksBuilder(fake.gp, fake.win);
    await bricks.document.save();
    expect(fake.calls).toContainEqual(['$_savePost']);
    expect(bricks.document.hasUnsavedChanges()).toBe(false);
  });

  it('save() times out', async () => {
    const fake = createFakeBricks({ omit: ['$_savePostAsync'] });
    fake.gp.$_savePost = () => {
      fake.state.isSaving = true;
    };
    const bricks = createBricksBuilder(fake.gp, fake.win);
    await expect(bricks.document.save({ timeout: 60 })).rejects.toBeInstanceOf(TimeoutError);
    const hanging = createFakeBricks();
    hanging.gp.$_savePostAsync = () => new Promise(() => {});
    await expect(createBricksBuilder(hanging.gp, hanging.win).document.save({ timeout: 60 })).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it('save() propagates Bricks save errors', async () => {
    const fake = createFakeBricks();
    fake.gp.$_savePostAsync = () => Promise.reject(new Error('403'));
    await expect(createBricksBuilder(fake.gp, fake.win).document.save()).rejects.toThrow('403');
  });
});
