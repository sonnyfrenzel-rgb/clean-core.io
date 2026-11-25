import { test, expect } from '@playwright/test';
import { normalisedPackageJson, packageDockerfile } from '../lib/delivery-package';

/**
 * The package.json of a generated Node package is model output that a reader installs and runs. What the template
 * keeps of it is bounded: registry versions only, the fields a package needs, and every path it puts into a
 * command line is one argument.
 */
const OPTS = { name: 'Z_ORDERS', entry: 'srv/service.ts', testFiles: ['test/a.test.ts'], runner: 'node:test' as const };

test('registry versions stay; URL, git, file and alias specifiers and unknown fields are removed, and said', () => {
  const raw = JSON.stringify({
    name: 'z-orders',
    version: '1.0.0',
    type: 'module',
    dependencies: { express: '^4.19.2', lodash: 'https://example.invalid/lodash.tgz', left: 'git+ssh://git@example.invalid/x.git', local: 'file:../x', alias: 'npm:evil@1', tagged: 'latest' },
    devDependencies: { vitest: '~1.6.0', gh: 'github:someone/thing' },
    optionalDependencies: { extra: '1.0.0' },
    overrides: { express: 'https://example.invalid/express.tgz' },
    bin: { x: 'srv/x.js' },
  });
  const { content, notes } = normalisedPackageJson(raw, OPTS);
  const pkg = JSON.parse(content);
  expect(Object.keys(pkg.dependencies).sort()).toEqual(['express', 'tagged', 'tsx']);
  expect(pkg.devDependencies.vitest).toBe('~1.6.0');
  expect(pkg.devDependencies.gh).toBeUndefined();
  for (const k of ['optionalDependencies', 'overrides', 'bin']) expect(pkg[k], k).toBeUndefined();
  expect(pkg).toMatchObject({ name: 'z-orders', version: '1.0.0', type: 'module' });
  expect(notes.join('\n')).toContain('lodash');
  expect(notes.join('\n')).toContain('"overrides"');
});

test('an entry with shell or quote characters is one argument in the scripts and the container', () => {
  const entry = "srv/a b;touch x\".ts";
  const pkg = JSON.parse(normalisedPackageJson(undefined, { ...OPTS, entry }).content);
  expect(pkg.scripts.start).toBe(`node --import tsx 'srv/a b;touch x".ts'`);
  expect(pkg.scripts.dev).toBe(`tsx watch 'srv/a b;touch x".ts'`);
  const docker = packageDockerfile(entry, ['srv', 'odd dir']);
  expect(docker).toContain(`CMD ["node", "--import", "tsx", ${JSON.stringify(entry)}]`);
  expect(docker).toContain('COPY --from=build /app/srv ./srv');
  expect(docker).toContain('COPY --from=build ["/app/odd dir","./odd dir"]');
  // A plain entry reads exactly as before.
  expect(packageDockerfile('srv/service.ts', ['srv'])).toContain('CMD ["node", "--import", "tsx", "srv/service.ts"]');
  expect(JSON.parse(normalisedPackageJson(undefined, OPTS).content).scripts.start).toBe('node --import tsx srv/service.ts');
});
