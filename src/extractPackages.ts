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
    ignored?: string,
    descriptorString: string,
    descriptor: Descriptor,
    actualDescriptor: Descriptor,
    satisfiedBy: Set<string>,
    candidateVersions?: string[],
    requestedProtocol: string | null,
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

  for (const [entryName, entry] of Object.entries(yarnEntries)) {
      if (entryName === '__metadata') continue;

      const resolution = entry.resolution;
      const resolutionDescriptor = resolution ? structUtils.tryParseDescriptor(resolution, true) : null;

      for (const descriptorString of entryName.split(', ')){
          const descriptor = structUtils.parseDescriptor(descriptorString);
          const range = structUtils.parseRange(descriptor.range);

          // If the range is a valid descriptor we're dealing with an alias ("foo": "npm:lodash@*")
          // and need to make the locator from that instead of the original descriptor
          let actualDescriptor = descriptor;
          try {
            const potentialDescriptor = structUtils.tryParseDescriptor(range.selector, true);
            if (potentialDescriptor) {
                actualDescriptor = potentialDescriptor;
            }
          } catch { }

          const actualRange = structUtils.parseRange(actualDescriptor.range);
          const resolutionRange = resolutionDescriptor ? structUtils.parseRange(resolutionDescriptor.range) : null;
          const packageName = structUtils.stringifyIdent(actualDescriptor);
          const protocol = actualRange.protocol || resolutionRange?.protocol || null;

          let ignored = (() => {
            if (!protocol) {
                return 'no protocol';
            }
            if (!['npm','npm:'].includes(protocol)) {
                return 'not npm protocol';
            }
            if (!!entry.linkType && entry.linkType !== 'hard') {
                return 'not hard link';
            }
            })();

          // If there is a list of scopes, only process those.
          if (
              includeScopes.length > 0 &&
              !includeScopes.find((scope) => packageName.startsWith(`${scope}/`))
          ) {
              ignored = 'not in includeScopes';
          } else if (
              excludeScopes.length > 0 &&
              excludeScopes.find((scope) => packageName.startsWith(`${scope}/`))
          ) {
              ignored = 'in excludeScopes';
          }

          // If there is a list of package names, only process those.
          else if (includePackages.length > 0 && !includePackages.includes(packageName)) {
              ignored = 'not in includePackages';
          } else if (excludePackages.length > 0 && excludePackages.includes(packageName)) {
              ignored = 'in excludePackages';
          }

          const packageKey = ignored ? entryName : packageName + '@' + protocol;
          packages[packageKey] = packages[packageKey] || [];

          packages[packageKey].push({
              packageKey,
              packageName,
              pkg: entry,
              descriptorString,
              descriptor,
              actualDescriptor,
              ignored,
              requestedProtocol: protocol,
              requestedVersion: range.selector,
              installedVersion: entry.version,
              satisfiedBy: new Set(),
              versions: new Map()
          });
      }
  };
  return packages;
};
