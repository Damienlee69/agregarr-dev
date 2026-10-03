// @vitest-environment jsdom
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('axios', () => ({
  default: { get: mocks.get, post: mocks.post, isAxiosError: () => false },
}));
vi.mock('react-toast-notifications', () => ({
  useToasts: () => ({ addToast: vi.fn() }),
}));
vi.mock('react-intl', () => ({
  defineMessages: (messages: unknown) => messages,
  useIntl: () => ({
    formatMessage: (message: string, values: Record<string, string> = {}) =>
      message.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? key),
  }),
}));
vi.mock('@headlessui/react', () => ({
  Transition: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@app/components/Common/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));
vi.mock('@app/components/Common/Button', () => ({
  default: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick: () => void;
  }) => React.createElement('button', { onClick }, children),
}));
vi.mock('@app/components/Common/LoadingSpinner', () => ({
  default: () => null,
}));

import TestItemModal from './TestItemModal';

describe('TestItemModal rule values', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const click = async (text: string) => {
    const el = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(text)
    );
    if (!el) throw new Error(`No button containing "${text}"`);
    await act(async () => el.click());
  };

  it('shows missing for a rule with no actual value, not a blank', async () => {
    const rule = (field: string, actualValue: unknown) => ({
      ruleIndex: 0,
      field,
      operator: 'equals',
      value: true,
      actualValue,
      matched: false,
    });
    mocks.get.mockResolvedValue({
      data: {
        results: [
          {
            ratingKey: '1',
            title: 'Movie One',
            type: 'movie',
            libraryId: '1',
            libraryName: 'Movies',
          },
        ],
        totalResults: 1,
      },
    });
    mocks.post.mockResolvedValue({
      data: {
        poster: '',
        item: { title: 'Movie One', libraryName: 'Movies' },
        templates: [
          {
            id: 7,
            name: 'Badge',
            matched: false,
            conditionResults: {
              sectionResults: [
                {
                  sectionIndex: 0,
                  matched: false,
                  ruleResults: [
                    rule('isRequested', undefined),
                    rule('isNull', null),
                    rule('isFalse', false),
                  ],
                },
              ],
            },
          },
        ],
        context: {},
        output: { width: 1, height: 1, jpegQuality: 1 },
      },
    });

    await act(async () =>
      root.render(
        React.createElement(TestItemModal, { isOpen: true, onClose: vi.fn() })
      )
    );
    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set;
      setter?.call(input, 'movie');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Search');
    await click('Movie One');
    await click('Test Overlay');
    await click('Badge');

    const text = container.textContent ?? '';
    expect(text).toContain('isRequested equals true(actual: missing)');
    expect(text).toContain('isNull equals true(actual: missing)');
    expect(text).toContain('isFalse equals true(actual: false)');
  });
});
