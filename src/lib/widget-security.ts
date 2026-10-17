export function isWidgetOriginAllowed(origin: string | null, website: string | null | undefined): boolean {
  if (!origin || !website) return false;
  try {
    const requestOrigin = new URL(origin);
    const site = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(website) ? website : `https://${website}`);
    if (requestOrigin.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && requestOrigin.hostname === 'localhost')) {
      return false;
    }
    const host = site.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    const originHost = requestOrigin.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    // A port is part of a web origin. If the registered URL names one, require
    // it exactly; otherwise only accept the browser's default HTTPS origin.
    const portAllowed = site.port ? site.port === requestOrigin.port : requestOrigin.port === '';
    return originHost === host && portAllowed;
  } catch {
    return false;
  }
}
