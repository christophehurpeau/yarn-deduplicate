import { Package, Packages, Version, Versions } from "./extractPackages";
import { Options } from "./sharedTypes";
import semver from 'semver';

export const computePackageInstances = (packages: Packages, packageKey: string,
  {
      strategy = 'fewerHighest',
      includePrerelease = false,
  }: Options = {}): Package[] => {
  // Instances of this package in the tree
  const packageInstances = packages[packageKey];

  // Extract the list of unique versions for this package
  const versions: Versions = new Map();
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
          if (strategy === 'fewer' || strategy === 'mostCommon' || strategy === 'fewerHighest') {
              // Sort versions based on how many packages it satisfies. In case of a tie, put the
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

export const selectBestVersionFromPackageInstances = (packageInstances: Package[]): void=> {
    // Find the versions that were selected on the previous run
    const selectedVersions = new Map();

    packageInstances.forEach((packageInstance) => {
        if (!selectedVersions.has(packageInstance.packageKey)) {
            selectedVersions.set(packageInstance.packageKey, new Set());
        }
        selectedVersions.get(packageInstance.packageKey).add(packageInstance.bestVersion);
    });

    // Sort the list of satisfied versions
    packageInstances.forEach((packageInstance) => {
        if (packageInstance.ignored || !packageInstance.candidateVersions) {
            return;
        }

        const selectedVersionsForPackage = selectedVersions.get(packageInstance.packageKey);
        const candidateVersionsExcludingNotSelected = packageInstance.candidateVersions.filter(version => selectedVersionsForPackage.has(version) );
        candidateVersionsExcludingNotSelected.sort((versionA:string, versionB:string) => {
            return semver.rcompare(versionA, versionB);
        });

        // The best package is always the first one in the list thanks to the sorting above.
        packageInstance.bestVersion = candidateVersionsExcludingNotSelected[0];
    });
  }