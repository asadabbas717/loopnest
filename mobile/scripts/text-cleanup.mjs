// Trusted operator tooling. Dry runs never mutate rows or expose message data.
export async function cleanExpiredText(client, { apply = false, maxBatches = 10 } = {}) {
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100)
    throw new Error('Invalid cleanup bound.');
  const call = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error('Text maintenance request failed.');
    return data;
  };
  const eligible = await call('expired_text_cleanup_count');
  if (!apply) return { dryRun: true, eligible, removed: 0 };
  let removed = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const count = await call('purge_expired_messages', { batch_size: 500 });
    if (!Number.isInteger(count) || count < 0 || count > 500)
      throw new Error('Invalid cleanup result.');
    removed += count;
    if (count < 500) break;
  }
  return { dryRun: false, eligible, removed, remaining: await call('expired_text_cleanup_count') };
}
