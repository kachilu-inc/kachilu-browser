export const BRANDED_BROWSER_ENV_PREFIX = "KACHILU_BROWSER_";
export const UPSTREAM_BROWSER_ENV_PREFIX = "AGENT_BROWSER_";

function resolveSuffix(name, prefixes) {
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      return name.slice(prefix.length);
    }
  }
  return null;
}

export function getPrefixedEnvNames(
  name,
  {
    primaryPrefix = BRANDED_BROWSER_ENV_PREFIX,
    secondaryPrefix = UPSTREAM_BROWSER_ENV_PREFIX,
  } = {}
) {
  const suffix = resolveSuffix(name, [primaryPrefix, secondaryPrefix]);
  if (suffix == null) {
    return [name];
  }
  return [`${primaryPrefix}${suffix}`, `${secondaryPrefix}${suffix}`];
}

export function getBridgedEnvValue(env, name, options) {
  for (const candidate of getPrefixedEnvNames(name, options)) {
    const value = env[candidate]?.trim();
    if (value) return value;
  }
  return "";
}

export function bridgePrefixedEnv(env, options) {
  const next = { ...env };
  for (const [key, value] of Object.entries(env)) {
    const candidates = getPrefixedEnvNames(key, options);
    if (candidates.length <= 1) continue;
    for (const candidate of candidates) {
      if (candidate === key) continue;
      if (next[candidate] == null || next[candidate] === "") {
        next[candidate] = value;
      }
    }
  }
  return next;
}
