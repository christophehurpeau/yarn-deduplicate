import type { Descriptor } from "@yarnpkg/core";
import type { Options } from "./sharedTypes";
import type { YarnEntries, YarnEntry } from "./yarnlock";
import { structUtils } from '@yarnpkg/core';

export type Version = {
  pkg: YarnEntry,
  satisfies: Set<Package>
}

export type Versions = Map<string, Version>;

export type Package = {
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

export type Packages = Record<string, Package[]>;

export const extractPackages = (
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

          let ignored = requestedProtocol !== 'npm' || (!!entry.linkType && entry.linkType !== 'hard');

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
