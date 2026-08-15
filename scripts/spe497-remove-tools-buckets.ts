/**
 * SPE-497 stage 2, apply-runbook step 2: empty and delete the three Tools-suite
 * storage buckets through the Storage API.
 *
 * This exists because the stage-2 SQL migration
 * (supabase/migrations/20260815_spe497_stage2_drop_tools_suite.sql) cannot do
 * it: Supabase's storage.protect_delete() trigger rejects direct DELETEs on
 * storage tables (caught on the branch-DB rehearsal, 2026-08-15) — bucket
 * removal must go through the Storage API, the same mechanism the retired
 * cleanup-worksheet-images cron used in production.
 *
 * Usage (env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx scripts/spe497-remove-tools-buckets.ts            # dry run: list only
 *   npx tsx scripts/spe497-remove-tools-buckets.ts -- --yes   # empty + delete
 */
import { createClient } from '@supabase/supabase-js';

const BUCKETS = ['worksheets', 'worksheet-submissions', 'saved-worksheets'];
const PAGE = 1000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function main() {
  const apply = process.argv.includes('--yes');
  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );

  for (const bucket of BUCKETS) {
    const { data: bucketInfo, error: headErr } = await supabase.storage.getBucket(bucket);
    if (headErr) {
      // Only a confirmed bucket-not-found means "already removed". The pinned
      // storage-js returns StorageApiError { status: 400, message: 'Bucket not
      // found' } with NO statusCode field (observed on the 2026-08-15 prod
      // apply); newer versions expose statusCode '404'. Accept exactly those
      // two shapes. Anything else (network, auth, 5xx) must abort loudly:
      // this script is the ONLY remaining deletion path for this data; a
      // silent skip would report success while student-work objects survive.
      const { status, statusCode } = headErr as {
        status?: number;
        statusCode?: string | number;
      };
      const notFound =
        String(statusCode ?? '') === '404' ||
        ((status === 400 || status === 404) && headErr.message === 'Bucket not found');
      if (notFound) {
        console.log(`[${bucket}] not found — already removed, skipping`);
        continue;
      }
      throw new Error(`[${bucket}] getBucket failed (status ${statusCode ?? status ?? 'unknown'}, NOT treated as removed): ${headErr.message}`);
    }
    if (!bucketInfo) {
      throw new Error(`[${bucket}] getBucket returned no bucket and no error — refusing to treat as removed`);
    }

    // Count objects (top-level listing; the suite stored flat or one-folder
    // paths — emptyBucket below removes everything regardless of depth).
    const { data: objects, error: listErr } = await supabase.storage
      .from(bucket)
      .list('', { limit: PAGE });
    if (listErr) throw new Error(`[${bucket}] list failed: ${listErr.message}`);
    console.log(`[${bucket}] exists; ${objects?.length ?? 0} top-level entries${(objects?.length ?? 0) === PAGE ? ' (more beyond first page)' : ''}`);

    if (!apply) continue;

    const { error: emptyErr } = await supabase.storage.emptyBucket(bucket);
    if (emptyErr) throw new Error(`[${bucket}] emptyBucket failed: ${emptyErr.message}`);

    // emptyBucket resolves before the object removal fully settles server-side,
    // so an immediate deleteBucket can fail with "not empty" (hit on the
    // 2026-08-15 prod apply). Retry only that specific failure, briefly.
    let deleted = false;
    for (let attempt = 1; attempt <= 5 && !deleted; attempt++) {
      const { error: delErr } = await supabase.storage.deleteBucket(bucket);
      if (!delErr) {
        deleted = true;
      } else if (/not empty/i.test(delErr.message) && attempt < 5) {
        console.warn(`[${bucket}] deleteBucket raced the empty (attempt ${attempt}) — retrying in 2s`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw new Error(`[${bucket}] deleteBucket failed: ${delErr.message}`);
      }
    }
    console.log(`[${bucket}] emptied and deleted`);
  }

  console.log(apply ? 'Done — all Tools-suite buckets removed.' : 'Dry run only. Re-run with -- --yes to remove.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
