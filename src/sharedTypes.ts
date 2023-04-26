// compatibility with original yarn-deduplicate. Same as "mostCommon"
export type LegacyFewerStrategy = 'fewer';
export type DedupeStrategy = LegacyFewerStrategy | 'mostCommon' | 'fewerHighest' | 'highest';

export type Options = {
    includeScopes?: string[];
    includePackages?: string[];
    excludePackages?: string[];
    excludeScopes?: string[];
    strategy?: DedupeStrategy;
    includePrerelease?: boolean;
}
