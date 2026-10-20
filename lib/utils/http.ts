// Reads a JSON response. When the server (or the host, e.g. Vercel after a timeout) answers with plain text
// instead, the raw "Unexpected token ... is not valid JSON" error would reach the user; this turns it into a
// message that says what to do. The jobs are resumable, so trying again continues where they stopped.
export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const timedOut = response.status === 504 || /timeout|timed out/i.test(text);
    throw new Error(
      timedOut
        ? "İşlem sunucuda zaman aşımına uğradı. \"Devam et\" ile kaldığı yerden sürdürebilirsin."
        : "Sunucu geçici bir hata verdi. \"Devam et\" ile kaldığı yerden sürdürebilirsin.",
    );
  }
}
