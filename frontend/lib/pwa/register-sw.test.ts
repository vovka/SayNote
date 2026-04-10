import test from 'node:test';
import assert from 'node:assert/strict';
import { registerServiceWorker } from './register-sw.ts';

test('registerServiceWorker registers /sw.js when service workers are available', async () => {
  let registeredUrl: string | null = null;
  const originalNavigator = globalThis.navigator;
  const originalWindow = (globalThis as Record<string, unknown>).window;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: {
        register: async (url: string) => {
          registeredUrl = url;
          return {} as ServiceWorkerRegistration;
        }
      }
    }
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {}
  });

  try {
    registerServiceWorker();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(registeredUrl, '/sw.js');
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator
    });

    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow
      });
    }
  }
});

test('registerServiceWorker no-ops when service workers are unavailable', () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = (globalThis as Record<string, unknown>).window;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {}
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {}
  });

  try {
    assert.doesNotThrow(() => registerServiceWorker());
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator
    });

    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow
      });
    }
  }
});
