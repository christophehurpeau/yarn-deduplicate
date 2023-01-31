import { Descriptor, structUtils } from '@yarnpkg/core';
import * as yarnParsers from '@yarnpkg/parsers';
import semver from 'semver';

type YarnEntry = {
    version: string
    resolution: string
    dependencies?: Record<string, string>
    checksum?: string;
    languageName?: 'node'
    linkType?: 'hard' | 'soft'
}

type YarnEntries = Record<string,YarnEntry>;

type Packages = Record<string, Package[]>;

type Package = {
    installedVersion:string,
    packageKey: string,
    packageName: string,
    pkg: YarnEntry,
    ignored: boolean,
    descriptorString: string,
    descriptor: Descriptor,
    satisfiedBy: Set<string>,
    candidateVersions?: string[],
    requestedProtocol: string,
    requestedVersion: string,
    bestVersion?: string,
    versions: Versions
}

type Version = {
    pkg: YarnEntry,
    satisfies: Set<Package>
}

type Versions = Map<string, Version>;

type Options = {
    includeScopes?: string[];
    includePackages?: string[];
    excludePackages?: string[];
    excludeScopes?: string[];
    useMostCommon?: boolean;
    includePrerelease?: boolean;
}

const parseYarnLock = (file:string) => yarnParsers.parseSyml(file) as YarnEntries;

const extractPackages = (
    yarnEntries: YarnEntries,
    {
        includeScopes = [],
        includePackages = [],
        excludePackages = [],
        excludeScopes = [],
    }: Options = {}
): Packages => {
    const packages: Packages = {};
    const re = /^(?:([^:]*):)?([^@]*?)$/;

    for (const [entryName, entry] of Object.entries(yarnEntries)) {
        if (entryName === '__metadata') continue;

        for (const descriptorString of entryName.split(', ')){
            const descriptor = structUtils.parseDescriptor(descriptorString);
            const [, requestedProtocol, requestedVersion] = descriptor.range.match(re) || [];

            const packageName = structUtils.stringifyIdent(descriptor);

            let ignored = requestedProtocol !== 'npm' || entry.linkType !== 'hard';

            // If there is a list of scopes, only process those.
            if (
                includeScopes.length > 0 &&
                !includeScopes.find((scope) => packageName.startsWith(`${scope}/`))
            ) {
                ignored = true;
            } else if (
                excludeScopes.length > 0 &&
                excludeScopes.find((scope) => packageName.startsWith(`${scope}/`))
            ) {
                ignored = true;
            }

            // If there is a list of package names, only process those.
            else if (includePackages.length > 0 && !includePackages.includes(packageName)) {
                ignored = true;
            } else if (excludePackages.length > 0 && excludePackages.includes(packageName)) {
                ignored = true;
            }

            const packageKey = ignored ? entryName : packageName + '@' + requestedProtocol;
            packages[packageKey] = packages[packageKey] || [];
            
            packages[packageKey].push({
                packageKey,
                packageName,
                pkg: entry,
                descriptorString,
                descriptor,
                ignored,
                requestedProtocol, 
                requestedVersion,
                installedVersion: entry.version,
                satisfiedBy: new Set(),
                versions: new Map()
            });
        }
    };
    return packages;
};



const computePackageInstances = (packages: Packages, packageKey: string,
    {
        useMostCommon = false,
        includePrerelease = false,
    }: Options = {}): Package[] => {
    // Instances of this package in the tree
    const packageInstances = packages[packageKey];

    // Extract the list of unique versions for this package
    const versions:Versions = new Map();
    for (const packageInstance of packageInstances) {
        if (packageInstance.ignored) continue;
        if (versions.has(packageInstance.installedVersion)) continue;
        versions.set(packageInstance.installedVersion, {
            pkg: packageInstance.pkg,
            satisfies: new Set(),
        })
    }

    // Link each package instance with all the versions it could satisfy.
    for (const [version, {satisfies}] of versions) {
        packageInstances.forEach((packageInstance) => {
            // We can assume that the installed version always satisfied the requested version.
            packageInstance.satisfiedBy.add(packageInstance.installedVersion);
            // In some cases the requested version is invalid form a semver point of view (for
            // example `sinon@next`). Just ignore those cases, they won't get deduped.
            if (
                semver.validRange(packageInstance.requestedVersion, { includePrerelease }) &&
                semver.satisfies(version, packageInstance.requestedVersion, { includePrerelease })
            ) {
                satisfies.add(packageInstance);
                packageInstance.satisfiedBy.add(version);
            }
        });
    };

    // Sort the list of satisfied versions
    packageInstances.forEach((packageInstance) => {
        if (packageInstance.ignored) {
            packageInstance.bestVersion = packageInstance.installedVersion;
            return;
        }

        // Save all versions for future reference
        packageInstance.versions = versions;

        // Compute the versions that actually satisfy this instance
        packageInstance.candidateVersions = Array.from(packageInstance.satisfiedBy);
        packageInstance.candidateVersions.sort((versionA:string, versionB:string) => {
            if (useMostCommon) {
                // Sort verions based on how many packages it satisfies. In case of a tie, put the
                // highest version first.
                const satisfiesA = (versions.get(versionA) as Version).satisfies;
                const satisfiesB = (versions.get(versionB) as Version).satisfies;
                if (satisfiesB.size > satisfiesA.size) return 1;
                if (satisfiesB.size < satisfiesA.size) return -1;
            }
            return semver.rcompare(versionA, versionB);
        });

        // The best package is always the first one in the list thanks to the sorting above.
        packageInstance.bestVersion = packageInstance.candidateVersions[0];
    });

    return packageInstances;
};

export const getBest = (
    packages: Packages,
    options: Options = {}
): Package[] => {

    return Object.keys(packages)
        .reduce(
            (acc:Package[], name) =>
                acc.concat(
                    computePackageInstances(packages, name, options)
                ),
            []
        );
};

export const getDuplicates = (
    packages: Packages,
    options: Options = {}
): Package[] => {
    return getBest(packages, options)
        .filter(({ bestVersion, installedVersion }) => bestVersion !== installedVersion);
};

export const listDuplicates = (yarnLock:string, options: Options = {}): string[] => {
    const yarnEntries = parseYarnLock(yarnLock);
    const packages = extractPackages(yarnEntries);
    const duplicates = getDuplicates(packages, options);
    
    const result = duplicates.map(({ bestVersion, packageName, installedVersion, requestedVersion }) => {
        return `Package "${packageName}" wants ${requestedVersion} and could get ${bestVersion}, but got ${installedVersion}`;
    });
    return result;
};

const yarnLockHeader = `${[
    `# This file is generated by running "yarn install" inside your project.\n`,
    `# Manual changes might be lost - proceed with caution!\n`,
  ].join(``)}\n`;

export const fixDuplicates = ( yarnLock: string, options: Options = {} ) => {
    const yarnEntries = parseYarnLock(yarnLock);
    const packages = extractPackages(yarnEntries);
    const bestPackages = getBest(packages, options);
    const packageResolutions: Record<string,any> = {};

    for (const bestPackage of bestPackages) {
        const { descriptorString, bestVersion, requestedProtocol, installedVersion, pkg, descriptor, ignored, packageKey } = bestPackage;

        const keyWithBestVersion = ignored ? packageKey : structUtils.stringifyDescriptor({
            ...descriptor,
            range: requestedProtocol + ':' + bestVersion
        });
        packageResolutions[keyWithBestVersion] = packageResolutions[keyWithBestVersion] || {keys:[]};
        packageResolutions[keyWithBestVersion].keys.push(descriptorString);
        if (bestVersion === installedVersion) packageResolutions[keyWithBestVersion].pkg = pkg;
    }

    const newYarnEntries: YarnEntries = { __metadata: yarnEntries.__metadata };
    for (const packageResolution of Object.values(packageResolutions)) {
        const key = packageResolution.keys.join(', ');
        newYarnEntries[key] = packageResolution.pkg;
    }

    return yarnLockHeader + yarnParsers.stringifySyml(newYarnEntries);
};

