import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const TS_EXTENSIONS = ['.ts', '.tsx'];

function isRelativeSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function hasExplicitExtension(specifier) {
  const lastSegment = specifier.split('/').pop() ?? specifier;
  return lastSegment.includes('.');
}

function findResolvableTsExtension(parentURL, specifier) {
  for (const extension of TS_EXTENSIONS) {
    const candidateUrl = new URL(`${specifier}${extension}`, parentURL);
    if (existsSync(fileURLToPath(candidateUrl))) {
      return extension;
    }
  }

  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        !context.parentURL ||
        !isRelativeSpecifier(specifier) ||
        hasExplicitExtension(specifier) ||
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ERR_MODULE_NOT_FOUND'
      ) {
        throw error;
      }

      const extension = findResolvableTsExtension(context.parentURL, specifier);
      if (!extension) {
        throw error;
      }

      return nextResolve(`${specifier}${extension}`, context);
    }
  }
});
