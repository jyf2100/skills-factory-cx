export async function jsonGet<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `cannot reach market API at ${url} (${message}). ` +
        "Ensure market-api is running and the source URL is correct (use: find-skills source list, or pass --from to local-find-skills/local-install)."
    );
  }

  if (!response.ok) {
    throw new Error(`request failed ${response.status} for ${url}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}
