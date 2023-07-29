import { fixDuplicates, listDuplicates } from '../src/index';
import * as yarnParsers from '@yarnpkg/parsers';
import outdent from 'outdent';
import { DedupeStrategy } from '../src/sharedTypes';

test.each([undefined, 'fewestHighest', 'highest'])(
    'dedupes lockfile to max compatible version with strategy %s',
    (strategy) => {
        const yarn_lock = outdent`
    "library@npm:^1.1.0":
      version: "1.2.0"
      resolved: "https://example.net/library@^1.1.0"

    "library@npm:^1.2.0":
      version: "1.2.0"
      resolved: "https://example.net/library@^1.2.0"

    "library@npm:^1.3.0":
      version: "1.3.0"
      resolved: "https://example.net/library@^1.3.0"
    `;
        const deduped = fixDuplicates(yarn_lock, {
            strategy: strategy as DedupeStrategy | undefined,
        });
        const parsedYarnLock = yarnParsers.parseSyml(deduped);

        expect(parsedYarnLock).toMatchInlineSnapshot(`
                    {
                      "library@npm:^1.1.0, library@npm:^1.2.0, library@npm:^1.3.0": {
                        "resolved": "https://example.net/library@^1.3.0",
                        "version": "1.3.0",
                      },
                    }
            `);

        const list = listDuplicates(yarn_lock);

        expect(list).toEqual([
          'Package "library" wants ^1.1.0 and could get 1.3.0, but got 1.2.0',
          'Package "library" wants ^1.2.0 and could get 1.3.0, but got 1.2.0',
        ]);
    }
);

test('dedupes lockfile to most common compatible version', () => {
    const yarn_lock = outdent`
    "library@npm:>=1.0.0":
      version: "3.0.0"
      resolved: "https://example.net/library@^3.0.0"

    "library@npm:>=1.1.0":
      version: "3.0.0"
      resolved: "https://example.net/library@^3.0.0"

    "library@npm:^2.0.0":
      version: "2.1.0"
      resolved: "https://example.net/library@^2.1.0"
  `;
    const deduped = fixDuplicates(yarn_lock, {
        strategy: 'mostCommon',
    });
    const parsedYarnLock = yarnParsers.parseSyml(deduped);

    expect(parsedYarnLock).toMatchInlineSnapshot(`
        {
          "library@npm:>=1.0.0, library@npm:>=1.1.0, library@npm:^2.0.0": {
            "resolved": "https://example.net/library@^2.1.0",
            "version": "2.1.0",
          },
        }
    `);

    const list = listDuplicates(yarn_lock, {
        strategy: 'mostCommon',
    });

    expect(list).toEqual([
        'Package "library" wants >=1.0.0 and could get 2.1.0, but got 3.0.0',
        'Package "library" wants >=1.1.0 and could get 2.1.0, but got 3.0.0',
    ]);
});

test('limits the scopes to be de-duplicated', () => {
    const yarn_lock = outdent`
    "@a-scope/a-package@npm:^2.0.0":
      version: "2.0.0"
      resolved: "http://example.com/a-scope/a-package/2.1.0"

    "@a-scope/a-package@npm:^2.0.1":
      version: "2.0.1"
      resolved: "http://example.com/a-scope/a-package/2.2.0"

    "@another-scope/a-package@npm:^1.0.0":
      version: "1.0.11"
      resolved: "http://example.com/another-scope/a-package/1.0.0"

    "@another-scope/a-package@npm:^1.0.1":
      version: "1.0.12"
      resolved: "http://example.com/another-scope/a-package/1.0.0"
  `;

    const deduped = fixDuplicates(yarn_lock, {
        includeScopes: ['@another-scope'],
    });
    const parsedYarnLock = yarnParsers.parseSyml(deduped);

    expect(parsedYarnLock).toMatchInlineSnapshot(`
        {
          "@a-scope/a-package@npm:^2.0.0": {
            "resolved": "http://example.com/a-scope/a-package/2.1.0",
            "version": "2.0.0",
          },
          "@a-scope/a-package@npm:^2.0.1": {
            "resolved": "http://example.com/a-scope/a-package/2.2.0",
            "version": "2.0.1",
          },
          "@another-scope/a-package@npm:^1.0.0, @another-scope/a-package@npm:^1.0.1": {
            "resolved": "http://example.com/another-scope/a-package/1.0.0",
            "version": "1.0.12",
          },
        }
    `);

    const list = listDuplicates(yarn_lock, {
        includeScopes: ['@another-scope'],
    });

    expect(list).toHaveLength(1);
    expect(list).toEqual([
        'Package "@another-scope/a-package" wants ^1.0.0 and could get 1.0.12, but got 1.0.11',
    ]);
});

test('excludes scopes to be de-duplicated', () => {
    const yarn_lock = outdent`
    "@a-scope/package@npm:^2.0.0":
      version: "2.0.0"
      resolved: "http://example.com/@a-scope/package/2.1.0"

    "@a-scope/package@npm:^2.0.1":
      version: "2.0.1"
      resolved: "http://example.com/@a-scope/package/2.2.0"

    "@other-scope/package@npm:^1.0.0":
      version: "1.0.11"
      resolved: "http://example.com/@other-scope/package/1.0.0"

    "@other-scope/package@npm:^1.0.1":
      version: "1.0.12"
      resolved: "http://example.com/@other-package/package/1.0.0"
  `;

    const deduped = fixDuplicates(yarn_lock, {
        excludeScopes: ['@a-scope'],
    });
    const parsedYarnLock = yarnParsers.parseSyml(deduped);

    expect(parsedYarnLock).toMatchInlineSnapshot(`
        {
          "@a-scope/package@npm:^2.0.0": {
            "resolved": "http://example.com/@a-scope/package/2.1.0",
            "version": "2.0.0",
          },
          "@a-scope/package@npm:^2.0.1": {
            "resolved": "http://example.com/@a-scope/package/2.2.0",
            "version": "2.0.1",
          },
          "@other-scope/package@npm:^1.0.0, @other-scope/package@npm:^1.0.1": {
            "resolved": "http://example.com/@other-package/package/1.0.0",
            "version": "1.0.12",
          },
        }
    `);

    const list = listDuplicates(yarn_lock, {
        excludeScopes: ['@a-scope'],
    });

    expect(list).toEqual([
        'Package "@other-scope/package" wants ^1.0.0 and could get 1.0.12, but got 1.0.11',
    ]);
});

test('includePrerelease options dedupes to the prerelease', () => {
    const yarn_lock = outdent`
  typescript@npm:^4.1.0-beta:
    version: "4.1.0-beta"
    resolved: "https://registry.yarnpkg.com/typescript/-/typescript-4.1.0-beta.tgz#e4d054035d253b7a37bdc077dd71706508573e69"
    integrity: sha512-b/LAttdVl3G6FEmnMkDsK0xvfvaftXpSKrjXn+OVCRqrwz5WD/6QJOiN+dTorqDY+hkaH+r2gP5wI1jBDmdQ7A==

  typescript@npm:^4.0.3:
    version: "4.0.3"
    resolved: "https://packages.atlassian.com/api/npm/npm-remote/typescript/-/typescript-4.0.3.tgz#153bbd468ef07725c1df9c77e8b453f8d36abba5"
    integrity: sha1-FTu9Ro7wdyXB35x36LRT+NNqu6U=
`;

    const deduped = fixDuplicates(yarn_lock, {
        includePrerelease: true,
    });
    const parsedYarnLock = yarnParsers.parseSyml(deduped);

    expect(parsedYarnLock).toMatchInlineSnapshot(`
        {
          "typescript@npm:^4.1.0-beta, typescript@npm:^4.0.3": {
            "integrity": "sha512-b/LAttdVl3G6FEmnMkDsK0xvfvaftXpSKrjXn+OVCRqrwz5WD/6QJOiN+dTorqDY+hkaH+r2gP5wI1jBDmdQ7A==",
            "resolved": "https://registry.yarnpkg.com/typescript/-/typescript-4.1.0-beta.tgz#e4d054035d253b7a37bdc077dd71706508573e69",
            "version": "4.1.0-beta",
          },
        }
    `);

    const list = listDuplicates(yarn_lock, {
        includePrerelease: true,
    });

    expect(list).toEqual([
        'Package "typescript" wants ^4.0.3 and could get 4.1.0-beta, but got 4.0.3',
    ]);
});

test('limits the packages to be de-duplicated', () => {
    const yarn_lock = outdent`
    "a-package@npm:^2.0.0":
      version: "2.0.0"
      resolved: "http://example.com/a-package/2.1.0"

    "a-package@npm:^2.0.1":
      version: "2.0.1"
      resolved: "http://example.com/a-package/2.2.0"

    "other-package@npm:^1.0.0":
      version: "1.0.11"
      resolved: "http://example.com/other-package/1.0.0"

    "other-package@npm:^1.0.1":
      version: "1.0.12"
      resolved: "http://example.com/other-package/1.0.0"
  `;

    const deduped = fixDuplicates(yarn_lock, {
        includePackages: ['other-package'],
    });
    const parsedYarnLock = yarnParsers.parseSyml(deduped);

    expect(parsedYarnLock).toMatchInlineSnapshot(`
        {
          "a-package@npm:^2.0.0": {
            "resolved": "http://example.com/a-package/2.1.0",
            "version": "2.0.0",
          },
          "a-package@npm:^2.0.1": {
            "resolved": "http://example.com/a-package/2.2.0",
            "version": "2.0.1",
          },
          "other-package@npm:^1.0.0, other-package@npm:^1.0.1": {
            "resolved": "http://example.com/other-package/1.0.0",
            "version": "1.0.12",
          },
        }
    `);

    const list = listDuplicates(yarn_lock, {
        includePackages: ['other-package'],
    });

    expect(list).toEqual([
        'Package "other-package" wants ^1.0.0 and could get 1.0.12, but got 1.0.11',
    ]);
});

test('excludes packages to be de-duplicated', () => {
    const yarn_lock = outdent`
    "a-package@npm:^2.0.0":
      version: "2.0.0"
      resolved: "http://example.com/a-package/2.1.0"

    "a-package@npm:^2.0.1":
      version: "2.0.1"
      resolved: "http://example.com/a-package/2.2.0"

    "other-package@npm:^1.0.0":
      version: "1.0.11"
      resolved: "http://example.com/other-package/1.0.0"

    "other-package@npm:^1.0.1":
      version: "1.0.12"
      resolved: "http://example.com/other-package/1.0.0"
  `;

    const deduped = fixDuplicates(yarn_lock, {
        excludePackages: ['a-package'],
    });
    const parsedYarnLock = yarnParsers.parseSyml(deduped);

    expect(parsedYarnLock).toMatchInlineSnapshot(`
        {
          "a-package@npm:^2.0.0": {
            "resolved": "http://example.com/a-package/2.1.0",
            "version": "2.0.0",
          },
          "a-package@npm:^2.0.1": {
            "resolved": "http://example.com/a-package/2.2.0",
            "version": "2.0.1",
          },
          "other-package@npm:^1.0.0, other-package@npm:^1.0.1": {
            "resolved": "http://example.com/other-package/1.0.0",
            "version": "1.0.12",
          },
        }
    `);

    const list = listDuplicates(yarn_lock, {
        excludePackages: ['a-package'],
    });

    expect(list).toEqual([
        'Package "other-package" wants ^1.0.0 and could get 1.0.12, but got 1.0.11',
    ]);
});

test('should support the integrity field if present', () => {
    const yarn_lock = outdent({ trimTrailingNewline: false })`
    # This file is generated by running "yarn install" inside your project.
    # Manual changes might be lost - proceed with caution!

    "a-package@npm:^2.0.0":
      version: 2.0.1
      dependencies:
        a-second-package: ^2.0.0
      integrity: sha512-ptqFDzemkXGMf7ylch/bCV+XTDvVjD9dRymzcjOPIxg8Hqt/uesOye10GXItFbsxJx9VZeJBYrR8FFTauu+hHg==
      resolved: "http://example.com/a-package/2.0.1"

    "a-second-package@npm:^2.0.0":
      version: 2.0.1
      integrity: sha512-ptqFDzemkXGMf7ylch/bCV+XTDvVjD9dRymzcjOPIxg8Hqt/uesOye10GXItFbsxJx9VZeJBYrR8FFTauu+hHg==
      resolved: "http://example.com/a-second-package/2.0.1"
  `;

    const deduped = fixDuplicates(yarn_lock);

    // We should not have made any change to the order of outputted lines (@yarnpkg/lockfile 1.0.0 had this bug)
    expect(yarn_lock).toBe(deduped);
});


test('should supported renamed packages', () => {
  const yarn_lock = outdent({ trimTrailingNewline: false })`
  # This file is generated by running "yarn install" inside your project.
  # Manual changes might be lost - proceed with caution!

  "string-width-cjs@npm:string-width@^4.2.0, string-width@npm:^1.0.2 || 2 || 3 || 4, string-width@npm:^4.1.0, string-width@npm:^4.2.0, string-width@npm:^4.2.3":
    version: 4.2.3
    resolution: "string-width@npm:4.2.3"
    dependencies:
      emoji-regex: ^8.0.0
      is-fullwidth-code-point: ^3.0.0
      strip-ansi: ^6.0.1
    checksum: e52c10dc3fbfcd6c3a15f159f54a90024241d0f149cf8aed2982a2d801d2e64df0bf1dc351cf8e95c3319323f9f220c16e740b06faecd53e2462df1d2b5443fb
    languageName: node
    linkType: hard
  `;

  const deduped = fixDuplicates(yarn_lock);

  // We should not have made duplicate entries
  expect(yarn_lock).toBe(deduped);
});