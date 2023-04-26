import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import {type Readable} from "stream";

const execFile = promisify(childProcess.execFile);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const cliFilePath = path.join(__dirname, '../dist/cli.js');
const fixturesPath = path.join(__dirname, './fixtures');
const yarnLockFilePath = path.join(fixturesPath, 'yarn.lock');

const testWithFlags = async (flags:string[]) => {
    const { stdout, stderr } = await execFile(process.execPath, [
        cliFilePath,
        '--print',
        ...flags,
        '--',
        yarnLockFilePath,
    ]);
    expect(stderr).toBe('');
    return stdout;
};

const streamToString = (stream:Readable) => {
    const chunks:Uint8Array[] = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
};

describe('Basic output', () => {
    test('prints duplicates', async () => {
        const { stdout, stderr } = await execFile(process.execPath, [
            cliFilePath,
            '--list',
            yarnLockFilePath,
        ]);
        expect(stdout).toContain(
            'Package "@scope/lib" wants >=1.0.0 and could get 4.17.15, but got 1.3.1'
        );
        expect(stdout).toContain(
            'Package "@another-scope/lib" wants >=1.0.0 and could get 4.17.15, but got 1.3.1'
        );
        expect(stdout).toContain(
            'Package "lodash" wants >=1.0.0 and could get 4.17.15, but got 1.3.1'
        );
        expect(stderr).toBe('');
    });

    test('prints fixed yarn.lock', async () => {
        const { stdout, stderr } = await execFile(process.execPath, [
            cliFilePath,
            '--print',
            yarnLockFilePath,
        ]);
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
        expect(stdout).not.toContain('"lodash@npm:>=1.0.0":');
        expect(stdout).toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');
        expect(stderr).toBe('');
    });
});

describe('Edit in place', () => {
    test('edits yarn.lock and replaces its content with the fixed version', async () => {
        const oldFileContent = await readFile(yarnLockFilePath, 'utf8');
        try {
            const { stdout, stderr } = await execFile(process.execPath, [
                cliFilePath,
                yarnLockFilePath,
            ]);
            const newFileContent = await readFile(yarnLockFilePath, 'utf8');
            expect(oldFileContent).not.toBe(newFileContent);
            expect(oldFileContent).toContain('"@scope/lib@npm:>=1.0.0":');
            expect(oldFileContent).not.toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
            expect(oldFileContent).toContain('"lodash@npm:>=1.0.0":');
            expect(oldFileContent).not.toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');

            expect(newFileContent).not.toContain('"@scope/lib@npm:>=1.0.0":');
            expect(newFileContent).toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
            expect(newFileContent).not.toContain('"lodash@npm:>=1.0.0":');
            expect(newFileContent).toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');
            expect(stdout).toBe('Found duplicates, yarn.lock changed\n');
            expect(stderr).toBe('');
        } finally {
            await writeFile(yarnLockFilePath, oldFileContent, 'utf8');
        }
    });

    test('edits yarn.lock and replaces its content with the fixed version without specifying yarn.lock path', async () => {
        const oldFileContent = await readFile(yarnLockFilePath, 'utf8');
        try {
            const { stdout, stderr } = await execFile(process.execPath, [cliFilePath], {
                cwd: fixturesPath,
            });
            const newFileContent = await readFile(yarnLockFilePath, 'utf8');
            expect(oldFileContent).not.toBe(newFileContent);
            expect(oldFileContent).toContain('"@scope/lib@npm:>=1.0.0":');
            expect(oldFileContent).not.toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
            expect(oldFileContent).toContain('"lodash@npm:>=1.0.0":');
            expect(oldFileContent).not.toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');

            expect(newFileContent).not.toContain('"@scope/lib@npm:>=1.0.0":');
            expect(newFileContent).toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
            expect(newFileContent).not.toContain('"lodash@npm:>=1.0.0":');
            expect(newFileContent).toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');
            expect(stdout).toBe('Found duplicates, yarn.lock changed\n');
            expect(stderr).toBe('');
        } finally {
            await writeFile(yarnLockFilePath, oldFileContent, 'utf8');
        }
    });
});

describe('Error control', () => {
    test('fails if given the fail option', async () => {
        const listProc = await childProcess.spawn(process.execPath, [
            cliFilePath,
            '--list',
            '--fail',
            yarnLockFilePath,
        ]);
        listProc.on('close', (code) => {
            expect(code).toBe(1);
        });
        const listOut = await streamToString(listProc.stderr);
        expect(listOut).toContain(
            'Found duplicated entries. Run yarn-deduplicate to deduplicate them.'
        );

        const execProc = await childProcess.spawn(process.execPath, [
            cliFilePath,
            '--print',
            '--fail',
            yarnLockFilePath,
        ]);
        execProc.on('close', (code) => {
            expect(code).toBe(1);
        });
        const execOut = await streamToString(execProc.stderr);
        expect(execOut).toContain(
            'Found duplicated entries. Run yarn-deduplicate to deduplicate them.'
        );
    });

    test('does not fail without the fail option', async () => {
        const listProc = await childProcess.spawn(process.execPath, [
            cliFilePath,
            '--list',
            yarnLockFilePath,
        ]);
        listProc.on('close', (code) => {
            expect(code).toBe(0);
        });

        const execProc = await childProcess.spawn(process.execPath, [
            cliFilePath,
            '--print',
            yarnLockFilePath,
        ]);
        execProc.on('close', (code) => {
            expect(code).toBe(0);
        });
    });
});

describe('Supports individal packages', () => {
    test('it accepts a single package', async () => {
        const stdout = await testWithFlags(['--packages', 'lodash']);
        expect(stdout).not.toContain('"lodash@npm:>=1.0.0":');
        expect(stdout).toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');
    });

    test('it accepts a multiple packages in one flag', async () => {
        const stdout = await testWithFlags(['--packages', 'lodash', '@scope/lib']);
        expect(stdout).not.toContain('"lodash@npm:>=1.0.0":');
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
    });

    test('it accepts a multiple flags', async () => {
        const stdout = await testWithFlags(['--packages', 'lodash', '--packages', '@scope/lib']);
        expect(stdout).not.toContain('"lodash@npm:>=1.0.0":');
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
    });

    // eslint-disable-next-line jest/expect-expect
    test('does not break if package is missing', () => testWithFlags(['--packages', 'foo']));
});

describe('Supports scopes', () => {
    test('it accepts a single scope', async () => {
        const stdout = await testWithFlags(['--scopes', '@scope']);
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
    });

    test('it accepts a multiple scopes in one flag', async () => {
        const stdout = await testWithFlags(['--scopes', '@scope', '@another-scope']);
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).not.toContain('"@another-scope/lib@npm:>=1.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
        expect(stdout).toContain('"@another-scope/lib@npm:>=1.0.0, @another-scope/lib@npm:>=2.0.0":');
    });

    test('it accepts a multiple flags', async () => {
        const stdout = await testWithFlags(['--scopes', '@scope', '--scopes', '@another-scope']);
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).not.toContain('"@another-scope/lib@npm:>=1.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
        expect(stdout).toContain('"@another-scope/lib@npm:>=1.0.0, @another-scope/lib@npm:>=2.0.0":');
    });

    // eslint-disable-next-line jest/expect-expect
    test('does not break if scope is missing', () => testWithFlags(['--scopes', '@foo']));
});

describe('Supports excluding packages', () => {
    test('it accepts a single package', async () => {
        const stdout = await testWithFlags(['--exclude', 'lodash']);
        expect(stdout).toContain('"lodash@npm:>=1.0.0":');
        expect(stdout).toContain('"lodash@npm:>=2.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
        expect(stdout).not.toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');
    });

    test('it accepts a multiple package in one flag', async () => {
        const stdout = await testWithFlags(['--exclude', 'lodash', '@scope/lib']);
        expect(stdout).toContain('"lodash@npm:>=1.0.0":');
        expect(stdout).toContain('"lodash@npm:>=2.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=2.0.0":');
        expect(stdout).not.toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
    });

    test('it accepts a multiple flags', async () => {
        const stdout = await testWithFlags(['--exclude', 'lodash', '--exclude', '@scope/lib']);
        expect(stdout).toContain('"lodash@npm:>=1.0.0":');
        expect(stdout).toContain('"lodash@npm:>=2.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).toContain('"@scope/lib@npm:>=2.0.0":');
        expect(stdout).not.toContain('"lodash@npm:>=1.0.0, lodash@npm:>=2.0.0":');
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
    });

    // eslint-disable-next-line jest/expect-expect
    test('does not break if scope is missing', () => testWithFlags(['--exclude', '@foo']));
});

describe('Supports excluding scopes', () => {
    test('it accepts a single scope', async () => {
        const stdout = await testWithFlags(['--exclude-scopes', '@scope']);
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
    });

    test('it accepts a multiple scopes in one flag', async () => {
        const stdout = await testWithFlags(['--exclude-scopes', '@scope', '@another-scope']);
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).toContain('"@another-scope/lib@npm:>=1.0.0":');
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
        expect(stdout).not.toContain('"@another-scope/lib@npm:>=1.0.0, @another-scope/lib@npm:>=2.0.0":');
    });

    test('it accepts a multiple flags', async () => {
        const stdout = await testWithFlags([
            '--exclude-scopes',
            '@scope',
            '--exclude-scopes',
            '@another-scope',
        ]);
        expect(stdout).toContain('"@scope/lib@npm:>=1.0.0":');
        expect(stdout).toContain('"@another-scope/lib@npm:>=1.0.0":');
        expect(stdout).not.toContain('"@scope/lib@npm:>=1.0.0, @scope/lib@npm:>=2.0.0":');
        expect(stdout).not.toContain('"@another-scope/lib@npm:>=1.0.0, @another-scope/lib@npm:>=2.0.0":');
    });

    // eslint-disable-next-line jest/expect-expect
    test('does not break if scope is missing', () => testWithFlags(['--scopes', '@foo']));
});

test('line endings are retained', async () => {
    const oldFileContent = await readFile(yarnLockFilePath, 'utf8');
    try {
        const { stdout, stderr } = await execFile(process.execPath, [
            cliFilePath,
            yarnLockFilePath,
        ]);
        const newFileContent = await readFile(yarnLockFilePath, 'utf8');
        const oldEol = (oldFileContent.match(/(\r?\n)/) as RegExpMatchArray) [0];
        const newEol = (newFileContent.match(/(\r?\n)/) as RegExpMatchArray) [0];
        expect(newEol).toBe(oldEol);
    } finally {
        await writeFile(yarnLockFilePath, oldFileContent, 'utf8');
    }
});

test('uses mostCommon strategy', async () => {
    const { stdout, stderr } = await execFile(process.execPath, [
        cliFilePath,
        '--print',
        '-s',
        'mostCommon',
        yarnLockFilePath,
    ]);
    expect(stdout).not.toContain('library@npm:>=1.0.0:');
    expect(stdout).toContain('"library@npm:>=1.0.0, library@npm:>=1.1.0, library@npm:^2.0.0":');
    expect(stdout).toContain('resolved: "https://example.net/library@^2.1.0"');
    expect(stderr).toBe('');
});

test('uses includePrerelease option', async () => {
    const { stdout, stderr } = await execFile(process.execPath, [
        cliFilePath,
        '--print',
        '--includePrerelease',
        yarnLockFilePath,
    ]);
    expect(stdout).not.toContain('typescript@npm:^4.0.3:');
    expect(stdout).not.toContain('"typescript@npm:^4.0.3":');
    expect(stdout).toContain('"typescript@npm:^4.1.0-beta, typescript@npm:^4.0.3":');
    expect(stdout).toContain(
        'resolved: "https://registry.yarnpkg.com/typescript/-/typescript-4.1.0-beta.tgz#e4d054035d253b7a37bdc077dd71706508573e69"'
    );
    expect(stderr).toBe('');
});
