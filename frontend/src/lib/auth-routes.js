export const LOGIN_PATH = "/employerportal/authentication/login";

export function getLoginHref({ activationKey, share } = {}) {
  const params = new URLSearchParams();
  if (activationKey) params.set("activationkey", activationKey);
  if (share) params.set("share", share);
  const query = params.toString();
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
}
