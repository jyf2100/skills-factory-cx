export function outboundProxy(): string | undefined {
  return (
    process.env.OUTBOUND_PROXY ??
    process.env.HTTPS_PROXY ??
    process.env.HTTP_PROXY ??
    process.env.ALL_PROXY ??
    process.env.https_proxy ??
    process.env.http_proxy ??
    process.env.all_proxy
  );
}

export function withOutboundProxyEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const proxy = outboundProxy();
  if (!proxy) {
    return { ...baseEnv };
  }

  return {
    ...baseEnv,
    HTTPS_PROXY: proxy,
    HTTP_PROXY: proxy,
    ALL_PROXY: proxy,
    https_proxy: proxy,
    http_proxy: proxy,
    all_proxy: proxy
  };
}

export function baseCurlArgs(): string[] {
  const args = ["--fail-with-body", "--silent", "--show-error", "--location", "--max-time", "20"];
  const proxy = outboundProxy();
  if (proxy) {
    args.push("--proxy", proxy);
  }
  return args;
}
