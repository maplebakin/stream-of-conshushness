export class MaintenanceInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MaintenanceInputError';
  }
}

/**
 * Maintenance scripts must never guess which database to inspect or mutate.
 * This intentionally performs only syntax-level validation; the MongoDB
 * driver remains responsible for validating hosts, credentials, and options.
 */
export function requiredMongoUri(env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  const schemeMatch = mongoUri.match(/^mongodb(?:\+srv)?:\/\//i);
  if (!schemeMatch || /\s/.test(mongoUri) || mongoUri.length > 2048) {
    throw new MaintenanceInputError(
      'MONGODB_URI is required and must be a MongoDB connection URL.'
    );
  }

  const authority = mongoUri
    .slice(schemeMatch[0].length)
    .split(/[/?#]/, 1)[0];
  const hosts = authority.includes('@')
    ? authority.slice(authority.lastIndexOf('@') + 1)
    : authority;
  if (!hosts || hosts.split(',').some((host) => !host.trim())) {
    throw new MaintenanceInputError(
      'MONGODB_URI is required and must be a MongoDB connection URL.'
    );
  }

  return mongoUri;
}

export function requiredOwnerId(env = process.env) {
  const ownerId = String(env.USER_ID || '').trim();
  if (!/^[a-f\d]{24}$/i.test(ownerId)) {
    throw new MaintenanceInputError(
      'USER_ID is required and must be a 24-character MongoDB ObjectId.'
    );
  }
  return ownerId;
}

/** Mutating maintenance scripts are dry-run unless --apply is explicit. */
export function mutationMode(argv = []) {
  const flags = new Set(argv);
  const knownFlags = new Set(['--apply', '--dry-run']);
  if ([...flags].some((flag) => !knownFlags.has(flag))) {
    throw new MaintenanceInputError('Unknown option. Use --dry-run or --apply.');
  }
  if (flags.has('--apply') && flags.has('--dry-run')) {
    throw new MaintenanceInputError('Choose either --dry-run or --apply, not both.');
  }
  return { apply: flags.has('--apply') };
}

export function isMaintenanceInputError(error) {
  return error instanceof MaintenanceInputError;
}
