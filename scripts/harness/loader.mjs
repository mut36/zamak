// Lets plain node import the app's server modules.
//   - `server-only` is a virtual module Next injects; stub it out.
//   - App code uses extensionless relative imports; add the .ts back.
import { registerHooks } from 'node:module';

const EMPTY = 'data:text/javascript,export {}';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: EMPTY, shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.')) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
