/**
 * Find all files in Supabase storage - search for Altera
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function listAllFiles(bucket, path = '') {
  const { data: files } = await supabase.storage.from(bucket).list(path, { limit: 200 });
  const allFiles = [];

  for (const file of files || []) {
    if (file.id) {
      // It's a file
      allFiles.push({ name: file.name, path: path ? `${path}/${file.name}` : file.name });
    } else {
      // It's a folder, recurse
      const subFiles = await listAllFiles(bucket, path ? `${path}/${file.name}` : file.name);
      allFiles.push(...subFiles);
    }
  }
  return allFiles;
}

async function main() {
  const { data: buckets } = await supabase.storage.listBuckets();

  console.log('Searching all buckets for "altera"...\n');

  for (const bucket of buckets || []) {
    const files = await listAllFiles(bucket.name);
    const alteraFiles = files.filter(f => f.name.toLowerCase().includes('altera') || f.path.toLowerCase().includes('altera'));

    if (alteraFiles.length > 0) {
      console.log(`=== ${bucket.name} ===`);
      for (const file of alteraFiles) {
        const { data: urlData } = supabase.storage.from(bucket.name).getPublicUrl(file.path);
        console.log(`  ${file.path}`);
        console.log(`  URL: ${urlData.publicUrl}`);
      }
    }
  }

  // Also check if there's a public bucket or assets bucket
  console.log('\n=== ALL BUCKETS ===');
  for (const bucket of buckets || []) {
    console.log(`- ${bucket.name} (public: ${bucket.public})`);
  }
}

main().catch(console.error);
