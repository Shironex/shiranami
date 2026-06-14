import { noDirectProcessEnvRule } from '../../src/rules/no-direct-process-env';
import { ruleTester } from '../test-utils/ruleTester';

const options = [{ allowedFiles: ['**/apps/server/**', '**/*.{spec,test}.{ts,tsx}'] }] as const;

ruleTester.run('no-direct-process-env', noDirectProcessEnvRule, {
  valid: [
    {
      code: "const port = config.get('PORT');",
      filename: 'apps/web/src/lib/runtime.ts',
      options,
    },
    // Allowlisted server file may read process.env directly.
    {
      code: "const name = process.env.SERVICE_NAME ?? 'server';",
      filename: 'apps/server/src/main.ts',
      options,
    },
    // Allowlisted test file may stub env.
    {
      code: "process.env.NODE_ENV = 'production';",
      filename: 'apps/web/src/lib/runtime.test.ts',
      options,
    },
    {
      code: 'const local = process.environment;',
      filename: 'apps/web/src/lib/runtime.ts',
      options,
    },
  ],
  invalid: [
    {
      code: "const isProd = process.env.NODE_ENV === 'production';",
      filename: 'apps/web/src/lib/runtime.ts',
      options,
      errors: [{ messageId: 'directProcessEnv' }],
    },
    {
      code: 'const { DATABASE_URL } = process.env;',
      filename: 'apps/web/src/lib/runtime.ts',
      options,
      errors: [{ messageId: 'directProcessEnv' }],
    },
    {
      code: "const v = process.env['CORS_ORIGINS'];",
      filename: 'apps/web/src/lib/runtime.ts',
      options,
      errors: [{ messageId: 'directProcessEnv' }],
    },
  ],
});
