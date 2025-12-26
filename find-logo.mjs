/**
 * Find Altera logo in Supabase storage
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // List all buckets
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

  console.log('=== STORAGE BUCKETS ===');
  if (bucketsError) {
    console.log('Error:', bucketsError.message);
  } else {
    console.log('Buckets:', buckets?.map(b => b.name).join(', ') || 'None');
  }

  // Search for logo in each bucket
  for (const bucket of buckets || []) {
    console.log(`\n=== FILES IN "${bucket.name}" ===`);
    const { data: files, error: filesError } = await supabase.storage.from(bucket.name).list('', {
      limit: 100,
      search: 'logo',
    });

    if (filesError) {
      console.log('Error:', filesError.message);
    } else if (files && files.length > 0) {
      for (const file of files) {
        console.log(`  - ${file.name}`);
        // Get public URL
        const { data: urlData } = supabase.storage.from(bucket.name).getPublicUrl(file.name);
        console.log(`    URL: ${urlData.publicUrl}`);
      }
    } else {
      // List all files in bucket
      const { data: allFiles } = await supabase.storage.from(bucket.name).list('', { limit: 50 });
      console.log('All files:', allFiles?.map(f => f.name).join(', ') || 'None');
    }
  }
}

main().catch(console.error);
