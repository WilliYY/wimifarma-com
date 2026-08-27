function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

export function authorizedCoreUser(row) {
  if (!row || row.active !== true) return null;

  const username = normalized(row.username);
  const role = normalized(row.role);
  const permissionCount = Number(row.permission_count || 0);
  const allowed = username === 'adm'
    || role === 'admin'
    || permissionCount === 0
    || row.can_access === true;

  if (!allowed) return null;

  const id = Number.parseInt(String(row.id || ''), 10);
  if (!Number.isSafeInteger(id) || id <= 0 || !username) return null;

  return {
    id,
    username: String(row.username),
    role: String(row.role || 'user'),
    active: true
  };
}

export function readinessResult({ quoteReady, redisReady, auth }) {
  const ok = quoteReady === true
    && redisReady === true
    && auth?.coreReachable === true
    && auth?.usersSynced === true;
  return { ok, status: ok ? 200 : 503 };
}

export function sessionCookieSecureMode(nodeEnv, configuredValue = '') {
  const configured = normalized(configuredValue);
  if (configured === 'true' || configured === '1' || configured === 'yes' || configured === 'on') return true;
  if (configured === 'false' || configured === '0' || configured === 'no' || configured === 'off') return false;
  return normalized(nodeEnv) === 'production' ? 'auto' : false;
}

export function sortCellChangesForLocking(changes) {
  return (Array.isArray(changes) ? changes : [])
    .map((change, index) => ({ change, index }))
    .sort((left, right) => (
      String(left.change?.rowId || '').localeCompare(String(right.change?.rowId || ''))
      || left.index - right.index
    ))
    .map(({ change }) => change);
}
