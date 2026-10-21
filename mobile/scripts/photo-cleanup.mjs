// Trusted operator tooling only. This module is never imported by the mobile app.
export async function cleanAbandonedPhotos(client, { apply = false, maxBatches = 10 } = {}) {
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100)
    throw new Error('Invalid cleanup bound.');
  const call = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error('Photo maintenance request failed.');
    return data;
  };
  const eligible = await call('photo_cleanup_count');
  if (!apply) return { dryRun: true, eligible, removed: 0 };
  let removed = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = await call('claim_photo_cleanup', { batch_size: 100 });
    if (!rows.length) break;
    const { error } = await client.storage.from('chat-photos').remove(rows.map((row) => row.path));
    // Retain the marked metadata if Storage fails. It can be retried safely and
    // cannot be attached to a message while physical deletion is pending.
    if (error) throw new Error('Physical photo cleanup failed; retry maintenance.');
    removed += await call('finish_photo_cleanup', { asset_ids: rows.map((row) => row.id) });
  }
  return { dryRun: false, eligible, removed, remaining: await call('photo_cleanup_count') };
}
