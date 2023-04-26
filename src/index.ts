import {  structUtils } from '@yarnpkg/core';
import { YarnEntries, parseYarnLock, stringifyYarnLock } from './yarnlock';
import { Options } from './sharedTypes';
import { Package, Packages, extractPackages } from './extractPackages';
import { computePackageInstances,selectBestVersionFromPackageInstances } from './computePackageInstances';

export const getBest = (
    packages: Packages,
    options: Options = {}
): Package[] => {
    const bestPackages: Package[] = [];
     Object.keys(packages)
        .forEach(
             (name) =>{
                bestPackages.push(
                    ...computePackageInstances(packages, name, options)
                );
            }
        );

  // eliminate candidates that were not selected on the previous run
  if (!options.strategy || options.strategy === 'fewerHighest') {
    selectBestVersionFromPackageInstances(bestPackages);
  }
    return bestPackages;
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
    const packages = extractPackages(yarnEntries, options);
    const duplicates = getDuplicates(packages, options);
    const result = duplicates.map(({ bestVersion, packageName, installedVersion, requestedVersion }) => {
        return `Package "${packageName}" wants ${requestedVersion} and could get ${bestVersion}, but got ${installedVersion}`;
    });
    return result;
};

export const fixDuplicates = ( yarnLock: string, options: Options = {} ) => {
    const yarnEntries = parseYarnLock(yarnLock);
    const packages = extractPackages(yarnEntries, options);
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
        //TODO packageResolution.keys.sort();
        const key = packageResolution.keys.join(', ');
        newYarnEntries[key] = packageResolution.pkg;
    }

    return stringifyYarnLock(newYarnEntries);
};

